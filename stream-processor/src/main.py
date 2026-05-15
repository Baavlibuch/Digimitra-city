import logging
import os
import sys
import threading

from recording_store import RecordingStore
from redpanda_consumer import RedpandaConsumer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)

EVENTS_TOPIC = os.environ.get("EVENTS_TOPIC", "events")
CHUNKS_TOPIC = os.environ.get("CHUNKS_TOPIC", "region-1-chunks")
REDPANDA_BOOTSTRAP = os.environ.get("REDPANDA_BOOTSTRAP", "redpanda:9092")


class EventProcessor:
    """
    Consumes AI events and edge recording chunk metadata, persisting both to PostgreSQL.
    """

    def __init__(self):
        logger.info("Initializing stream processor (bootstrap=%s)", REDPANDA_BOOTSTRAP)
        self.store = RecordingStore()
        self.store.verify_connection()
        self.events_consumer = RedpandaConsumer(
            topic=EVENTS_TOPIC,
            handler_func=self.handle_event_message,
            group_id="stream-processor-events",
        )
        self.chunks_consumer = RedpandaConsumer(
            topic=CHUNKS_TOPIC,
            handler_func=self.handle_chunk_message,
            group_id="stream-processor-chunks",
        )
        logger.info(
            "Stream processor ready: events_topic=%s chunks_topic=%s",
            EVENTS_TOPIC,
            CHUNKS_TOPIC,
        )

    def handle_event_message(self, message: dict):
        logger.info("Recording event received: event_id=%s", message.get("event_id"))
        self.store.insert_event(message)

    def handle_chunk_message(self, message: dict):
        logger.info("Recording chunk received: key=%s", message.get("minio_key"))
        self.store.insert_recording_chunk(message)

    def _run_consumer(self, name: str, consumer: RedpandaConsumer):
        try:
            logger.info("Kafka consumer connected: %s", name)
            consumer.start_consuming()
        except Exception:
            logger.exception("Consumer %s terminated with error", name)
            raise

    def run(self):
        logger.info("Starting stream processor consumer threads...")
        threads = [
            threading.Thread(
                target=self._run_consumer,
                args=("events", self.events_consumer),
                daemon=True,
            ),
            threading.Thread(
                target=self._run_consumer,
                args=("chunks", self.chunks_consumer),
                daemon=True,
            ),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()


if __name__ == "__main__":
    try:
        processor = EventProcessor()
        processor.run()
    except Exception:
        logger.exception("Stream processor failed to start")
        sys.exit(1)
