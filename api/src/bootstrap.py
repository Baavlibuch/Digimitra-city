
import os
import boto3
from botocore.exceptions import ClientError
from pymilvus import connections, utility, FieldSchema, CollectionSchema, DataType, Collection

from shared.minio_config import minio_bucket_name

def create_minio_bucket():
    """Creates the MinIO bucket if it doesn't exist."""
    minio_endpoint = os.getenv("MINIO_ENDPOINT")
    minio_access_key = os.getenv("MINIO_ACCESS_KEY")
    minio_secret_key = os.getenv("MINIO_SECRET_KEY")
    bucket_name = minio_bucket_name()

    s3_client = boto3.client(
        "s3",
        endpoint_url=f"http://{minio_endpoint}",
        aws_access_key_id=minio_access_key,
        aws_secret_access_key=minio_secret_key
    )

    try:
        s3_client.head_bucket(Bucket=bucket_name)
        print(f"Bucket '{bucket_name}' already exists.")
    except ClientError as e:
        if e.response['Error']['Code'] == '404':
            print(f"Bucket '{bucket_name}' not found. Creating it.")
            s3_client.create_bucket(Bucket=bucket_name)
            print(f"Bucket '{bucket_name}' created successfully.")
        else:
            print(f"Error checking for bucket: {e}")

def create_milvus_collection():
    """Creates the Milvus collection if it doesn't exist."""
    milvus_host = os.getenv("MILVUS_HOST")
    milvus_port = os.getenv("MILVUS_PORT")
    collection_name = "embeddings"

    try:
        connections.connect("default", host=milvus_host, port=milvus_port)

        if utility.has_collection(collection_name):
            print(f"Collection '{collection_name}' already exists.")
            return

        fields = [
            FieldSchema(name="id", dtype=DataType.VARCHAR, is_primary=True, max_length=64),
            FieldSchema(name="event_id", dtype=DataType.VARCHAR, max_length=64),
            FieldSchema(name="camera_id", dtype=DataType.VARCHAR, max_length=64),
            FieldSchema(name="timestamp", dtype=DataType.INT64),
            FieldSchema(name="event_type", dtype=DataType.VARCHAR, max_length=50),
            FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=512),
        ]
        schema = CollectionSchema(fields, description="Event embeddings")
        Collection(collection_name, schema)
        print(f"Collection '{collection_name}' created successfully.")

    except Exception as e:
        print(f"Error creating Milvus collection: {e}")
    finally:
        connections.disconnect("default")

def run_bootstrap():
    """Runs all bootstrap functions."""
    print("Running bootstrap...")
    create_minio_bucket()
    create_milvus_collection()
    print("Bootstrap finished.")
