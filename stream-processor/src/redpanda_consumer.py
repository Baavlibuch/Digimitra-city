import json
import logging
import os

from kafka import KafkaConsumer

logger = logging.getLogger(__name__)


class RedpandaConsumer:
    def __init__(self, topic: str, handler_func, group_id: str):
        bootstrap = os.environ.get("REDPANDA_BOOTSTRAP")
        if not bootstrap:
            raise RuntimeError("REDPANDA_BOOTSTRAP environment variable is required")
        self.topic = topic
        self.handler_func = handler_func
        self.consumer = KafkaConsumer(
            topic,
            bootstrap_servers=bootstrap,
            auto_offset_reset="earliest",
            enable_auto_commit=True,
            group_id=group_id,
            value_deserializer=lambda x: json.loads(x.decode("utf-8")),
        )
        logger.info(
            "Redpanda consumer configured: topic=%s group_id=%s bootstrap=%s",
            topic,
            group_id,
            bootstrap,
        )

    def start_consuming(self):
        logger.info("Listening on topic=%s", self.topic)
        for message in self.consumer:
            self.handler_func(message.value)
