import { IConsumer, IProducer } from "./definitions";
import { KafkaNodeConsumer } from "./kafkaNodeConsumer";
import { KafkaNodeProducer } from "./kafkaNodeProducer";
import { KafkaRestConsumer } from "./kafkaRestConsumer";
import { KafkaRestProducer } from "./kafkaRestProducer";

export function createConsumer(
    type: string,
    endPoint: string,
    clientId: string,
    groupId: string,
    topic: string,
    autoCommit: boolean): IConsumer {
    return type === "kafka-rest"
        ? new KafkaRestConsumer(endPoint, groupId, topic, autoCommit)
        : new KafkaNodeConsumer(endPoint, clientId, groupId, topic, autoCommit);
}

export function createProducer(type: string, endPoint: string, clientId: string, topic: string): IProducer {
    return type === "kafka-rest"
        ? new KafkaRestProducer(endPoint, topic)
        : new KafkaNodeProducer(endPoint, clientId, topic);
}
