import os
import boto3
from botocore.exceptions import ClientError
from kafka import KafkaProducer
from pymilvus import connections, Collection
import json
import logging

from shared.minio_config import minio_bucket_name

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RedpandaClient:
    """
    Client for publishing messages to Redpanda/Kafka.
    """
    def __init__(self):
        bootstrap_servers = os.getenv("REDPANDA_BOOTSTRAP", "redpanda:9092")
        self.producer = KafkaProducer(
            bootstrap_servers=bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode('utf-8')
        )

    def publish_message(self, topic, message):
        try:
            self.producer.send(topic, message)
            self.producer.flush()
            # logger.info(f"Published message to topic '{topic}'")
        except Exception as e:
            logger.error(f"Failed to publish to Redpanda topic '{topic}': {e}")

class MinioClient:
    """
    Client for uploading files to MinIO.
    """
    def __init__(self):
        self.client = boto3.client(
            's3',
            endpoint_url=f"http://{os.getenv('MINIO_ENDPOINT')}",
            aws_access_key_id=os.getenv('MINIO_ACCESS_KEY'),
            aws_secret_access_key=os.getenv('MINIO_SECRET_KEY')
        )
        self.bucket_name = minio_bucket_name()

    def upload_file(self, file_path, object_name):
        try:
            self.client.upload_file(file_path, self.bucket_name, object_name)
            # logger.info(f"Uploaded '{file_path}' to MinIO as '{object_name}'")
            return True
        except ClientError as e:
            logger.error(f"MinIO upload failed for '{object_name}': {e}")
            return False

class MilvusClient:
    """
    Client for inserting embeddings into Milvus.
    """
    def __init__(self):
        self.collection_name = "embeddings"
        try:
            connections.connect("default", host=os.getenv("MILVUS_HOST"), port=os.getenv("MILVUS_PORT"))
            self.collection = Collection(self.collection_name)
            self.collection.load()
            logger.info(f"Connected to Milvus and loaded collection '{self.collection_name}'.")
        except Exception as e:
            logger.error(f"Failed to connect to Milvus: {e}")
            self.collection = None

    def insert_embedding(self, data):
        if not self.collection:
            logger.error("Cannot insert embedding, Milvus connection not available.")
            return None
        try:
            result = self.collection.insert(data)
            # logger.info(f"Inserted embedding with ID: {result.primary_keys[0]}")
            return result
        except Exception as e:
            logger.error(f"Failed to insert embedding into Milvus: {e}")
            return None
