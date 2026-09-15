from __future__ import annotations

import json
import signal
import time
from typing import Callable

import pika

from .config import CONFIG
from .logging_setup import get_logger, log

STUDIO_EXCHANGE = "studio"
STUDIO_RETRY_EXCHANGE = "studio.retry"
RETRY_DELAYS_MS = [0, 5_000, 30_000, 120_000]
MAX_ATTEMPTS = len(RETRY_DELAYS_MS)

logger = get_logger("studio.queue")

PERMANENT_MARKERS = ("validation", "schema", "invalid", "not found", "unsupported", "moderation")


def is_permanent(error: BaseException) -> bool:
    message = f"{type(error).__name__}: {error}".lower()
    return any(marker in message for marker in PERMANENT_MARKERS)


class Consumer:
    def __init__(self, queue: str, handler: Callable[[dict], dict], prefetch: int | None = None) -> None:
        self.queue = queue
        self.handler = handler
        self.prefetch = prefetch or CONFIG.prefetch
        self.connection: pika.BlockingConnection | None = None
        self.channel = None
        self.stopping = False

    def _connect(self) -> None:
        parameters = pika.URLParameters(CONFIG.rabbitmq_url)
        parameters.heartbeat = 120
        parameters.blocked_connection_timeout = 300
        self.connection = pika.BlockingConnection(parameters)
        self.channel = self.connection.channel()
        self.channel.basic_qos(prefetch_count=self.prefetch)

    def _retry(self, message: dict, attempt: int) -> None:
        delay = RETRY_DELAYS_MS[min(attempt - 1, len(RETRY_DELAYS_MS) - 1)]
        payload = {**message, "attempt": attempt}
        self.channel.basic_publish(
            exchange=STUDIO_RETRY_EXCHANGE,
            routing_key=f"{delay}.{self.queue}",
            body=json.dumps(payload).encode(),
            properties=pika.BasicProperties(delivery_mode=2, content_type="application/json"),
        )
        log(logger, "warning", "studio.job.retry_scheduled", queue=self.queue, attempt=attempt, delay_ms=delay)

    def _on_message(self, channel, method, properties, body: bytes) -> None:
        started = time.time()
        try:
            message = json.loads(body)
        except json.JSONDecodeError:
            log(logger, "error", "studio.job.unparseable", queue=self.queue)
            channel.basic_nack(method.delivery_tag, requeue=False)
            return

        attempt = int(message.get("attempt", 1))
        try:
            self.handler(message)
            channel.basic_ack(method.delivery_tag)
            log(
                logger,
                "info",
                "studio.job.succeeded",
                queue=self.queue,
                attempt=attempt,
                duration_ms=int((time.time() - started) * 1000),
                production_id=message.get("productionId"),
            )
        except Exception as error:
            permanent = is_permanent(error)
            can_retry = not permanent and attempt < MAX_ATTEMPTS
            log(
                logger,
                "error",
                "studio.job.failed_retrying" if can_retry else "studio.job.failed_final",
                queue=self.queue,
                attempt=attempt,
                permanent=permanent,
                error=str(error),
                production_id=message.get("productionId"),
            )
            if can_retry:
                self._retry(message, attempt + 1)
                channel.basic_ack(method.delivery_tag)
            else:
                channel.basic_nack(method.delivery_tag, requeue=False)

    def run(self) -> None:
        signal.signal(signal.SIGTERM, self._stop)
        signal.signal(signal.SIGINT, self._stop)

        while not self.stopping:
            try:
                self._connect()
                self.channel.basic_consume(queue=self.queue, on_message_callback=self._on_message)
                log(logger, "info", "studio.consumer.started", queue=self.queue, prefetch=self.prefetch)
                self.channel.start_consuming()
            except pika.exceptions.AMQPError as error:
                if self.stopping:
                    break
                log(logger, "error", "studio.consumer.connection_lost", queue=self.queue, error=str(error))
                time.sleep(5)

    def _stop(self, *_args: object) -> None:
        self.stopping = True
        try:
            if self.channel is not None:
                self.channel.stop_consuming()
            if self.connection is not None:
                self.connection.close()
        finally:
            log(logger, "info", "studio.consumer.stopped", queue=self.queue)


def publish(queue: str, message: dict) -> None:
    parameters = pika.URLParameters(CONFIG.rabbitmq_url)
    connection = pika.BlockingConnection(parameters)
    try:
        channel = connection.channel()
        channel.basic_publish(
            exchange=STUDIO_EXCHANGE,
            routing_key=queue,
            body=json.dumps(message).encode(),
            properties=pika.BasicProperties(delivery_mode=2, content_type="application/json"),
        )
    finally:
        connection.close()
