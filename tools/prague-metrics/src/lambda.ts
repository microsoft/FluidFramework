import * as core from "@prague/routerlicious/dist/core";
import { IContext, IPartitionLambda } from "@prague/routerlicious/dist/kafka-service/lambdas";
import * as utils from "@prague/routerlicious/dist/utils";
import * as aria from "aria-nodejs-sdk";

export class MetricsLambda implements IPartitionLambda {
    constructor(
        private logger: aria.AWTLogger,
        private eventName: string,
        private environment: string,
        private context: IContext) {
    }

    public handler(rawMessage: utils.IMessage): void {
        const baseMessage = JSON.parse(rawMessage.value.toString()) as core.IMessage;

        // Exit out early for unknown messages
        if (baseMessage.type !== core.RawOperationType) {
            return;
        }

        // Update and retrieve the minimum sequence number
        const message = baseMessage as core.IRawOperationMessage;
        const userId = message.user && message.user.id ? message.user.id : "anonymous";

        const event = new aria.AWTEventProperties();
        event.setName(this.eventName);
        event.setTimestamp(message.timestamp);
        event.setProperty("tenantId", message.tenantId, aria.AWTPropertyType.String);
        event.setProperty("documentId", message.documentId, aria.AWTPropertyType.String);
        event.setProperty("userId", userId, aria.AWTPropertyType.String);
        event.setProperty("environment", this.environment, aria.AWTPropertyType.String);
        event.setProperty("clientId", message.clientId, aria.AWTPropertyType.String);
        this.logger.logEvent(event);

        this.context.checkpoint(rawMessage.offset);
    }

    public close() {
        return;
    }
}
