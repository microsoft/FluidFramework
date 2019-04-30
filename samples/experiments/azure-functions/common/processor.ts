import { Context } from "@azure/functions";
import { IBoxcarMessage, BoxcarType, IKafkaMessage, IPartitionLambda } from "@prague/services-core";
import * as safeStringify from "json-stringify-safe";

export async function processAll(eventHubMessages: any[], context: Context, lambda: IPartitionLambda) {
    const partitionContext = context.bindingData.partitionContext;

    context.log(`Processed message ${safeStringify(eventHubMessages)}`);
    context.log(`Processed message ${safeStringify(context)}`);

    eventHubMessages.forEach((message, index) => {
        const systemProperties = context.bindingData.systemPropertiesArray[index];

        const boxcarMessage: IBoxcarMessage = {
            contents: [message],
            documentId: message.documentId,
            tenantId: message.tenantId,
            type: BoxcarType,
        };

        const kafkaMessage: IKafkaMessage = {
            highWaterOffset: systemProperties.SequenceNumber,
            key: systemProperties.PartitionKey,
            offset: systemProperties.SequenceNumber,
            partition: parseInt(partitionContext.runtimeInformation.partitionId, 10),
            topic: partitionContext.eventhubPath,
            value: boxcarMessage,
        };

        context.log(`Processed message ${safeStringify(message)}`);
        lambda.handler(kafkaMessage);
    });
}
