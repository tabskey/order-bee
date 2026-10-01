import {
  RabbitMQContainer,
  StartedRabbitMQContainer,
} from '@testcontainers/rabbitmq';

export async function startTestBroker(): Promise<StartedRabbitMQContainer> {
  // RabbitMQ can take >30s (the Testcontainers default) to boot on slower
  // Docker hosts, e.g. Docker Desktop on Windows.
  const container = await new RabbitMQContainer('rabbitmq:3.13-management')
    .withStartupTimeout(120000)
    .start();
  process.env.RABBITMQ_URL = container.getAmqpUrl();
  return container;
}

export async function stopTestBroker(
  container: StartedRabbitMQContainer,
): Promise<void> {
  await container.stop();
}
