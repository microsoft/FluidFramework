import { IConsumer, IProducer } from "./definitions";
import { KafkaNodeConsumer } from "./kafkaNodeConsumer";
import { KafkaNodeProducer } from "./kafkaNodeProducer";

export function createConsumer(
    type: string,
    endPoint: string,
    clientId: string,
    groupId: string,
    topic: string,
    autoCommit: boolean): IConsumer {
    return new KafkaNodeConsumer(endPoint, clientId, groupId, topic, autoCommit);
}

export function createProducer(
    type: string,
    endPoint: string,
    clientId: string,
    topic: string,
    maxKafkaMessageSize: number): IProducer {
    return new KafkaNodeProducer(endPoint, clientId, topic);
}
