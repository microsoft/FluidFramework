import { IDataBlob, MessageType } from "@prague/runtime-definitions";
import * as winston from "winston";
import * as core from "../core";
import { IContext } from "../kafka-service/lambdas";
import { SequencedLambda } from "../kafka-service/sequencedLambda";
import * as utils from "../utils";

export class RotographLambda extends SequencedLambda {
    private taskQueueMap = new Map<string, string>();
    constructor(
        private permissions: any,
        protected context: IContext) {
        super(context);
        // Make a map of every task and their intended queue.
        // tslint:disable-next-line:forin
        for (const queueName in this.permissions) {
            for (const task of this.permissions[queueName]) {
                this.taskQueueMap.set(task, queueName);
            }
        }
    }

    protected async handlerCore(message: utils.IMessage): Promise<void> {
        const messageContent = message.value.toString();
        const parsedMessage = utils.safelyParseJSON(messageContent);
        if (parsedMessage === undefined) {
            winston.error(`Invalid JSON input: ${messageContent}`);
            return;
        }

        const baseMessage = parsedMessage as core.IMessage;
        if (baseMessage.type === core.SequencedOperationType) {
            const sequencedMessage = baseMessage as core.ISequencedOperationMessage;
            if (sequencedMessage.operation.type === MessageType.BlobUploaded) {
                this.blobHandler(sequencedMessage.operation.contents as IDataBlob);
            }
        }
        this.context.checkpoint(message.offset);
    }

    private async blobHandler(message: IDataBlob) {
        console.log(message);
    }
}
