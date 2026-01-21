import os
import json
from kafka import KafkaConsumer

from tenacity import retry, stop_after_attempt, wait_fixed, retry_if_exception_type
from kafka.errors import NoBrokersAvailable

class RedpandaConsumer:
    def __init__(self, topic, handler_func):
        self.topic = topic
        self.handler_func = handler_func
        self.consumer = self._create_consumer()

    @retry(stop=stop_after_attempt(10), wait=wait_fixed(5), retry=retry_if_exception_type(NoBrokersAvailable))
    def _create_consumer(self):
        return KafkaConsumer(
            self.topic,
            bootstrap_servers=os.environ.get("REDPANDA_BOOTSTRAP"),
            auto_offset_reset='earliest',
            enable_auto_commit=True,
            group_id='my-group',
            value_deserializer=lambda x: json.loads(x.decode('utf-8')))

    def start_consuming(self):
        for message in self.consumer:
            self.handler_func(message.value)
