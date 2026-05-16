import os
import time
import uuid
import logging
from typing import List, Optional
from urllib.parse import urljoin

from sqlalchemy.orm import Session
from fastapi import Depends
from minio import Minio
from pymilvus import MilvusClient

from shared.minio_config import minio_endpoint, minio_public_base_url
from shared.recording_clip_milvus import milvus_sdk_http_uri
from shared.models import Event, Camera
from .database import get_db

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SurveillanceServices:
    def __init__(self, db: Session):
        self.db = db
        self.vector_search_enabled = False
        # Initialize MinIO client
        self.minio_client = Minio(
            endpoint=minio_endpoint(),
            access_key=os.environ.get("MINIO_ACCESS_KEY"),
            secret_key=os.environ.get("MINIO_SECRET_KEY"),
            secure=False,
        )
        # Initialize Milvus client
        self.milvus_client = None
        self._init_milvus_client()
        # HLS base URL for browser playback (public MinIO URL when configured)
        self.hls_base_url = f"{minio_public_base_url()}/hls/"

    def _init_milvus_client(self):
        host = (os.environ.get("MILVUS_HOST") or "").strip()
        if not host:
            self.milvus_client = None
            logger.info("MILVUS_HOST not set; MilvusClient (legacy events index) disabled.")
            return
        try:
            port = int(str(os.environ.get("MILVUS_PORT", "19530")).strip())
        except ValueError:
            port = 19530
        try:
            max_attempts = max(1, int(os.environ.get("MILVUS_CONNECT_RETRIES", "18")))
        except ValueError:
            max_attempts = 18
        try:
            sleep_s = float(os.environ.get("MILVUS_CONNECT_RETRY_SEC", "2.0"))
        except ValueError:
            sleep_s = 2.0
        uri = milvus_sdk_http_uri(host, port)
        logger.info(
            "MilvusClient (legacy events index): resolved MILVUS_HOST=%s MILVUS_PORT=%s; using uri=%s",
            host,
            port,
            uri,
        )
        last_err: Optional[Exception] = None
        for attempt in range(1, max_attempts + 1):
            try:
                # pymilvus MilvusClient only honors `uri`; host=/port= kwargs do not replace default localhost.
                client = MilvusClient(uri=uri)
                try:
                    client.list_collections()
                except AttributeError:
                    client.has_collection("events")
                self.milvus_client = client
                if attempt == 1:
                    logger.info("MilvusClient connected (legacy events index) uri=%s", uri)
                else:
                    logger.info("MilvusClient connected after %s attempt(s) uri=%s", attempt, uri)
                return
            except Exception as e:
                last_err = e
                logger.warning(
                    "MilvusClient connect attempt %s/%s failed for uri=%s (gRPC host=%s port=%s): %s",
                    attempt,
                    max_attempts,
                    uri,
                    host,
                    port,
                    e,
                )
                if attempt < max_attempts:
                    time.sleep(sleep_s)
        self.milvus_client = None
        self.vector_search_enabled = False
        logger.warning("MilvusClient unavailable after %s attempts: %s (uri=%s)", max_attempts, last_err, uri)

    def initialize_services(self):
        """
        Initializes MinIO buckets and Milvus collections if they don't exist.
        """
        self._initialize_minio()
        try:
            self._initialize_milvus()
        except Exception as e:
            self.vector_search_enabled = False
            logger.warning(f"Milvus unavailable, vector search disabled: {e}")

    def _initialize_minio(self):
        """
        Creates MinIO buckets if they don't already exist.
        """
        try:
            if not self.minio_client.bucket_exists("thumbnails"):
                self.minio_client.make_bucket("thumbnails")
                logger.info("Created bucket: thumbnails")
            if not self.minio_client.bucket_exists("chunks"):
                self.minio_client.make_bucket("chunks")
                logger.info("Created bucket: chunks")
        except Exception as e:
            logger.error(f"Error initializing MinIO: {e}")
            raise

    def _initialize_milvus(self):
        """
        Creates Milvus collections if they don't already exist.
        """
        if self.milvus_client is None:
            self.vector_search_enabled = False
            logger.warning("Milvus unavailable, vector search disabled")
            return

        try:
            if not self.milvus_client.has_collection("events"):
                self.milvus_client.create_collection(
                    collection_name="events",
                    dimension=512,
                    metric_type="L2",
                )
                logger.info("Created Milvus collection: events")
            self.vector_search_enabled = True
        except Exception as e:
            self.vector_search_enabled = False
            logger.warning(f"Milvus unavailable, vector search disabled: {e}")
    
    def get_event_playback_urls(self, event_id: str) -> dict:
        """
        Generates signed URLs for event playback (HLS playlist and thumbnails).
        """
        event = self.db.query(Event).filter(Event.event_id == event_id).first()
        if not event:
            return {}

        # Get the associated video chunk
        chunk_path = event.chunk_path
        if not chunk_path:
            return {}
        
        # Construct HLS playlist URL
        playlist_url = urljoin(self.hls_base_url, f"{chunk_path}/playlist.m3u8")

        # Construct other stream file URLs
        stream_urls = {
            f"stream{i}.ts": urljoin(self.hls_base_url, f"{chunk_path}/stream{i}.ts")
            for i in range(3)  # Assuming 3 quality levels
        }

        return {
            "event_id": event_id,
            "playlist_url": playlist_url,
            "stream_urls": stream_urls,
            "thumbnail_urls": [urljoin(self.hls_base_url, thumbnail.path) for thumbnail in event.thumbnails]
        }

    def search_events_by_similarity(
        self, 
        query_embedding: List[float], 
        top_k: int = 10, 
        camera_filter: Optional[str] = None,
        time_range: Optional[tuple] = None
    ) -> List[dict]:
        """
        Searches for events in Milvus based on embedding similarity.
        """
        if not self.vector_search_enabled or self.milvus_client is None:
            logger.warning("Milvus unavailable, vector search disabled")
            return []

        try:
            search_params = {"metric_type": "L2", "params": {"nprobe": 10}}
            results = self.milvus_client.search(
                collection_name="events",
                data=[query_embedding],
                limit=top_k,
                search_params=search_params
            )
            
            # Process and return results with playback URLs
            return [
                {
                    "event_id": hit.entity.get("event_id"),
                    "distance": hit.distance,
                    "playback": self.get_event_playback_urls(hit.entity.get("event_id"))
                }
                for hit in results[0]
            ]
        except Exception as e:
            logger.error(f"Error searching Milvus: {e}")
            return []

    def get_camera_live_feed_url(self, camera_id: str) -> Optional[str]:
        """
        Returns the live feed URL for a given camera.
        """
        camera = self.db.query(Camera).filter(Camera.id == camera_id).first()
        if camera:
            return urljoin(self.hls_base_url, f"{camera.id}/live.m3u8")
        return None

def get_surveillance_services(db: Session = Depends(get_db)):
    return SurveillanceServices(db)
