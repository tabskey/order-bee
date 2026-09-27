import {
  RabbitMQContainer,
  StartedRabbitMQContainer,
} from '@testcontainers/rabbitmq';

export async function startTestBroker(): Promise<StartedRabbitMQContainer> {
  const container = await new RabbitMQContainer(
    'rabbitmq:3.13-management',
  ).start();
  process.env.RABBITMQ_URL = container.getAmqpUrl();
  return container;
}

export async function stopTestBroker(
  container: StartedRabbitMQContainer,
): Promise<void> {
  await container.stop();
}
