import logging
import os
import threading

from redpanda_consumer import RedpandaConsumer
from database import Database

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

EVENTS_TOPIC = os.environ.get("EVENTS_TOPIC", "events")
CHUNKS_TOPIC = os.environ.get("CHUNKS_TOPIC", "region-1-chunks")


class EventProcessor:
    """
    Consumes AI events and edge recording chunk metadata, persisting both to PostgreSQL.
    """

    def __init__(self):
        self.database = Database()
        self.events_consumer = RedpandaConsumer(
            topic=EVENTS_TOPIC,
            handler_func=self.handle_event_message,
        )
        self.chunks_consumer = RedpandaConsumer(
            topic=CHUNKS_TOPIC,
            handler_func=self.handle_chunk_message,
        )

    def handle_event_message(self, message: dict):
        logger.info("Processing event: %s", message.get("event_id"))
        self.database.insert_event(message)

    def handle_chunk_message(self, message: dict):
        logger.info("Processing recording chunk: %s", message.get("minio_key"))
        self.database.insert_recording_chunk(message)

    def _run_consumer(self, name: str, consumer: RedpandaConsumer):
        try:
            logger.info("Starting consumer thread: %s", name)
            consumer.start_consuming()
        except Exception:
            logger.exception("Consumer %s terminated with error", name)

    def run(self):
        logger.info(
            "Starting Stream Processor (events_topic=%s chunks_topic=%s)...",
            EVENTS_TOPIC,
            CHUNKS_TOPIC,
        )
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
    processor = EventProcessor()
    processor.run()
