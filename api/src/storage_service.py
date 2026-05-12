"""
Storage service for MinIO integration
OOP-oriented storage management
"""
import os
import io
import uuid
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from minio import Minio
from minio.error import S3Error
import logging

class MinIOStorageService:
    """OOP service for MinIO object storage operations"""
    
    def __init__(self, 
                 endpoint: str = None,
                 access_key: str = None,
                 secret_key: str = None,
                 bucket_name: str = "surveillance-bucket",
                 secure: bool = False):
        
        self.endpoint = endpoint or os.environ.get("MINIO_ENDPOINT", "localhost:9000")
        self.access_key = access_key or os.environ.get("MINIO_ACCESS_KEY", "minioadmin")
        self.secret_key = secret_key or os.environ.get("MINIO_SECRET_KEY", "minioadmin")
        self.bucket_name = bucket_name
        self.secure = secure
        
        self.logger = logging.getLogger("MinIOStorageService")
        self.client = None
        
        self._initialize_client()
    
    def _initialize_client(self) -> bool:
        """Initialize MinIO client and ensure bucket exists"""
        try:
            self.client = Minio(
                self.endpoint,
                access_key=self.access_key,
                secret_key=self.secret_key,
                secure=self.secure
            )
            
            # Test connection
            self.client.bucket_exists(self.bucket_name)
            
            # Create bucket if it doesn't exist
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
                self.logger.info(f"Created bucket: {self.bucket_name}")
            
            self.logger.info(f"MinIO client initialized: {self.endpoint}")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to initialize MinIO client: {e}")
            return False
    
    def upload_video_chunk(self, 
                          camera_id: str,
                          chunk_data: bytes,
                          timestamp: datetime,
                          metadata: Dict[str, Any] = None,
                          file_extension: str = ".mp4",
                          content_type: str = "video/mp4") -> Optional[str]:
        """Upload video chunk to MinIO (MP4 from edge pipeline or WebM/other from browser MediaRecorder)."""
        
        if not self.client:
            self.logger.error("MinIO client not initialized")
            return None
        
        try:
            # Generate object key
            timestamp_str = timestamp.strftime("%Y/%m/%d/%H")
            chunk_timestamp = timestamp.strftime("%Y%m%d_%H%M%S")
            ext = file_extension if file_extension.startswith(".") else f".{file_extension}"
            unique = uuid.uuid4().hex[:12]
            object_key = f"video-chunks/{camera_id}/{timestamp_str}/{chunk_timestamp}_{unique}{ext}"
            
            # Prepare metadata (S3/MinIO user metadata values must be strings)
            extra = metadata or {}
            chunk_metadata = {
                "camera_id": str(camera_id),
                "timestamp": timestamp.isoformat(),
                "content_type": content_type,
                **{k: str(v) for k, v in extra.items()},
            }
            
            # Upload chunk
            self.client.put_object(
                bucket_name=self.bucket_name,
                object_name=object_key,
                data=io.BytesIO(chunk_data),
                length=len(chunk_data),
                content_type=content_type,
                metadata=chunk_metadata
            )
            
            self.logger.info(f"Uploaded video chunk: {object_key}")
            return object_key
            
        except S3Error as e:
            self.logger.error(f"S3 error uploading chunk: {e}")
            return None
        except Exception as e:
            self.logger.error(f"Error uploading chunk: {e}")
            return None
    
    def upload_thumbnail(self,
                        camera_id: str,
                        thumbnail_data: bytes,
                        event_id: str,
                        timestamp: datetime) -> Optional[str]:
        """Upload thumbnail image to MinIO"""
        
        if not self.client:
            return None
        
        try:
            # Generate object key
            timestamp_str = timestamp.strftime("%Y/%m/%d")
            object_key = f"thumbnails/{camera_id}/{timestamp_str}/{event_id}.jpg"
            
            # Upload thumbnail
            self.client.put_object(
                bucket_name=self.bucket_name,
                object_name=object_key,
                data=io.BytesIO(thumbnail_data),
                length=len(thumbnail_data),
                content_type="image/jpeg",
                metadata={
                    "camera_id": camera_id,
                    "event_id": event_id,
                    "timestamp": timestamp.isoformat()
                }
            )
            
            self.logger.info(f"Uploaded thumbnail: {object_key}")
            return object_key
            
        except Exception as e:
            self.logger.error(f"Error uploading thumbnail: {e}")
            return None
    
    def get_presigned_url(self, 
                         object_key: str,
                         expiry_hours: int = 24) -> Optional[str]:
        """Get presigned URL for object access"""
        
        if not self.client:
            return None
        
        try:
            url = self.client.presigned_get_object(
                bucket_name=self.bucket_name,
                object_name=object_key,
                expires=timedelta(hours=expiry_hours)
            )
            
            return url
            
        except Exception as e:
            self.logger.error(f"Error generating presigned URL: {e}")
            return None
    
    def delete_object(self, object_key: str) -> bool:
        """Delete object from MinIO"""
        
        if not self.client:
            return False
        
        try:
            self.client.remove_object(
                bucket_name=self.bucket_name,
                object_name=object_key
            )
            
            self.logger.info(f"Deleted object: {object_key}")
            return True
            
        except Exception as e:
            self.logger.error(f"Error deleting object: {e}")
            return False
    
    def list_objects(self, prefix: str = "", max_keys: int = 1000) -> list:
        """List objects with given prefix"""
        
        if not self.client:
            return []
        
        try:
            objects = self.client.list_objects(
                bucket_name=self.bucket_name,
                prefix=prefix,
                recursive=True
            )
            
            object_list = []
            for obj in objects:
                object_list.append({
                    "key": obj.object_name,
                    "size": obj.size,
                    "last_modified": obj.last_modified,
                    "etag": obj.etag
                })
                
                if len(object_list) >= max_keys:
                    break
            
            return object_list
            
        except Exception as e:
            self.logger.error(f"Error listing objects: {e}")
            return []
    
    def get_object_metadata(self, object_key: str) -> Optional[Dict[str, Any]]:
        """Get object metadata"""
        
        if not self.client:
            return None
        
        try:
            response = self.client.stat_object(
                bucket_name=self.bucket_name,
                object_name=object_key
            )
            
            return {
                "size": response.size,
                "last_modified": response.last_modified,
                "etag": response.etag,
                "content_type": response.content_type,
                "metadata": response.metadata
            }
            
        except Exception as e:
            self.logger.error(f"Error getting object metadata: {e}")
            return None
    
    def health_check(self) -> bool:
        """Check MinIO service health"""
        
        if not self.client:
            return False
        
        try:
            # Try to list buckets as health check
            buckets = self.client.list_buckets()
            return True
            
        except Exception as e:
            self.logger.error(f"MinIO health check failed: {e}")
            return False