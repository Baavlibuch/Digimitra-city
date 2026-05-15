
import os
import uuid
import time
import logging
import threading
from datetime import datetime

import cv2
import torch
from ultralytics import YOLO
from transformers import XCLIPProcessor, XCLIPModel
from kafka import KafkaProducer
from minio import Minio
from pymilvus import MilvusClient
import json

from shared.minio_config import minio_bucket_name

# --- Configuration ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

VIDEO_DIR = os.getenv("VIDEO_DIR", "/data/videos")
CHUNK_SECONDS = int(os.getenv("CHUNK_SECONDS", 10))
HLS_OUT_DIR = os.getenv("HLS_OUT_DIR", "/hls")

# Service Connections
REDPANDA_BOOTSTRAP = os.getenv("REDPANDA_BOOTSTRAP", "redpanda:9092")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MILVUS_HOST = os.getenv("MILVUS_HOST", "milvus")
MILVUS_PORT = int(os.getenv("MILVUS_PORT", 19530))

# Topics
EVENTS_TOPIC = "region-1-events"
CHUNKS_TOPIC = "region-1-chunks"

# --- GPU Check ---
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
logger.info(f"Using device: {DEVICE}")

# --- Service Clients ---

def get_redpanda_producer():
    return KafkaProducer(
        bootstrap_servers=REDPANDA_BOOTSTRAP,
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )

def get_minio_client():
    return Minio(
        endpoint=MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=False
    )

def get_milvus_client():
    # MilvusClient uses `uri` only; host=/port= leave the default http://localhost:19530.
    return MilvusClient(uri=f"http://{MILVUS_HOST}:{MILVUS_PORT}")

# --- Main Application Logic ---

def process_camera_feed(camera_id: str, video_file: str):
    logger.info(f"[{camera_id}] Starting processing for: {video_file}")

    # 1. Initialize Clients and Models
    try:
        redpanda_producer = get_redpanda_producer()
        minio_client = get_minio_client()
        milvus_client = get_milvus_client()
        detection_model = YOLO('yolov8n.pt')
        detection_model.to(DEVICE)

        embedding_model = XCLIPModel.from_pretrained("microsoft/xclip-base-patch32").to(DEVICE)
        embedding_processor = XCLIPProcessor.from_pretrained("microsoft/xclip-base-patch32")

    except Exception as e:
        logger.error(f"[{camera_id}] Failed to initialize clients or model: {e}")
        return

    # 2. Video Processing Loop
    cap = cv2.VideoCapture(os.path.join(VIDEO_DIR, video_file))
    if not cap.isOpened():
        logger.error(f"[{camera_id}] Error opening video file.")
        return

    fps = cap.get(cv2.CAP_PROP_FPS)
    chunk_frame_count = int(fps * CHUNK_SECONDS)
    frame_index = 0
    
    while cap.isOpened():
        chunk_start_time = datetime.now()
        chunk_path = f"{camera_id}/{chunk_start_time.isoformat()}.mp4"
        out = cv2.VideoWriter(chunk_path, cv2.VideoWriter_fourcc(*'mp4v'), fps, (int(cap.get(3)), int(cap.get(4))))
        
        frames_in_chunk = 0
        detected_in_chunk = False
        frames_for_embedding = []

        for _ in range(chunk_frame_count):
            ret, frame = cap.read()
            if not ret:
                break

            out.write(frame)
            frames_in_chunk += 1
            frames_for_embedding.append(frame)

            if frame_index % 5 == 0:
                results = detection_model(frame, device=DEVICE)
                if results and results[0].boxes:
                    detected_in_chunk = True
                    for box in results[0].boxes:
                        event_id = str(uuid.uuid4())

                        # Generate embedding
                        inputs = embedding_processor(videos=frames_for_embedding, return_tensors="pt").to(DEVICE)
                        with torch.no_grad():
                            embedding = embedding_model.get_video_features(**inputs).cpu().numpy().tolist()[0]

                        # Insert into Milvus
                        milvus_client.insert(
                            collection_name="events", 
                            data=[{"embedding": embedding, "event_id": event_id, "camera_id": camera_id, "timestamp": int(datetime.now().timestamp())}]
                        )

                        event_data = {
                            "event_id": event_id,
                            "camera_id": camera_id,
                            "start_time": datetime.now().isoformat(),
                            "event_type": detection_model.names[int(box.cls)],
                            "confidence": float(box.conf),
                            "embedding_id": event_id,
                        }
                        redpanda_producer.send(EVENTS_TOPIC, event_data)
            frame_index += 1

        out.release()
        
        if frames_in_chunk > 0 and detected_in_chunk:
            try:
                minio_client.fput_object(minio_bucket_name(), chunk_path, chunk_path)
                file_size = None
                try:
                    file_size = os.path.getsize(chunk_path)
                except OSError:
                    pass
                chunk_data = {
                    "chunk_id": str(uuid.uuid4()),
                    "camera_id": camera_id,
                    "start_time": chunk_start_time.isoformat(),
                    "end_time": datetime.now().isoformat(),
                    "minio_key": chunk_path,
                    "bucket": minio_bucket_name(),
                    "file_size_bytes": file_size,
                }
                redpanda_producer.send(CHUNKS_TOPIC, chunk_data)
                logger.info(f"[{camera_id}] Uploaded chunk: {chunk_path}")
            except Exception as e:
                logger.error(f"[{camera_id}] Failed to upload chunk {chunk_path}: {e}")

        if not ret:
            break

    cap.release()
    logger.info(f"[{camera_id}] Finished processing video.")


if __name__ == "__main__":
    logger.info("Starting Edge Agent...")
    
    try:
        minio_client = get_minio_client()
        bucket = minio_bucket_name()
        if not minio_client.bucket_exists(bucket):
            minio_client.make_bucket(bucket)
            logger.info("Created MinIO bucket: %s", bucket)
    except Exception as e:
        logger.error(f"Could not create MinIO bucket: {e}")

    video_files = os.listdir(VIDEO_DIR)
    threads = []

    if not video_files:
        logger.warning(f"No video files found in {VIDEO_DIR}.")
    
    for video_file in video_files:
        if not video_file.endswith(".mp4"):
            continue

        camera_id = os.path.splitext(video_file)[0]
        thread = threading.Thread(target=process_camera_feed, args=(camera_id, video_file))
        threads.append(thread)
        thread.start()

    for thread in threads:
        thread.join()

    logger.info("Edge Agent processing complete.")
