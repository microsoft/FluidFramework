import { IConsumer, IProducer } from "@prague/services-core";
import { EventHubConsumer } from "./eventHubConsumer";
import { EventHubProducer } from "./eventHubProducer";

export function createConsumer(
    endPoint: string,
    clientId: string,
    groupId: string,
    topic: string,
    autoCommit: boolean,
    storageEndpoint: string,
    storageContainerName: string,
): IConsumer {
    return new EventHubConsumer(
        endPoint,
        clientId,
        groupId,
        topic,
        autoCommit,
        storageEndpoint,
        storageContainerName);
}

export function createProducer(endPoint: string, topic: string): IProducer {
    return new EventHubProducer(endPoint, topic);
}
