import os
import uuid
import logging
from typing import List, Optional
from urllib.parse import urljoin

from sqlalchemy.orm import Session
from minio import Minio
from pymilvus import MilvusClient, DataType

from shared.models import Event, Camera

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SurveillanceServices:
    def __init__(self, db: Session):
        self.db = db
        # Initialize MinIO client
        self.minio_client = Minio(
            endpoint=os.environ.get("MINIO_ENDPOINT"),
            access_key=os.environ.get("MINIO_ACCESS_KEY"),
            secret_key=os.environ.get("MINIO_SECRET_KEY"),
            secure=False
        )
        # Initialize Milvus client
        self.milvus_client = MilvusClient(
            uri=f"http://{os.environ.get('MILVUS_HOST')}:{os.environ.get('MILVUS_PORT')}"
        )
        # HLS base URL for playback
        self.hls_base_url = f"http://{os.environ.get('MINIO_ENDPOINT')}/hls/"

    def initialize_services(self):
        """
        Initializes MinIO buckets and Milvus collections if they don't exist.
        """
        self._initialize_minio()
        self._initialize_milvus()

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
        try:
            if not self.milvus_client.has_collection("events"):
                schema = self.milvus_client.create_schema(
                    auto_id=False,
                    enable_dynamic_field=True,
                )
                schema.add_field("event_id", DataType.VARCHAR, max_length=36, is_primary=True)
                schema.add_field("embedding", DataType.FLOAT_VECTOR, dim=512)
                schema.add_field("timestamp", DataType.INT64)
                schema.add_field("camera_id", DataType.VARCHAR, max_length=255)

                index_params = self.milvus_client.prepare_index_params()
                index_params.add_index(
                    field_name="embedding", 
                    index_type="IVF_FLAT", 
                    metric_type="L2",
                    params={"nlist": 1024}
                )

                self.milvus_client.create_collection(
                    collection_name="events",
                    schema=schema,
                    index_params=index_params
                )
                logger.info("Created Milvus collection: events")
        except Exception as e:
            logger.error(f"Error initializing Milvus: {e}")
            raise
    
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

from fastapi import Depends
from . import database

def get_surveillance_services(db: Session = Depends(database.get_db)):
    return SurveillanceServices(db)
