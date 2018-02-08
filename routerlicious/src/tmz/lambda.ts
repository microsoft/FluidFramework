import * as core from "../core";
import { IContext } from "../kafka-service/lambdas";
import { SequencedLambda } from "../kafka-service/sequencedLambda";
import * as utils from "../utils";
import { TmzRunner } from "./runner";

export class TmzLambda extends SequencedLambda {
    constructor(context: IContext, private runner: TmzRunner, tmzRunningP: Promise<void>) {
        super(context);

        // If TMZ stops due to an error notify the context
        tmzRunningP.catch((error) => {
            context.error(error, true);
        });
    }

    protected async handlerCore(message: utils.kafkaConsumer.IMessage): Promise<void> {
        const baseMessage = JSON.parse(message.value.toString()) as core.IMessage;
        if (baseMessage.type === core.SequencedOperationType) {
            const documentId = (baseMessage as core.ISequencedOperationMessage).documentId;
            await this.runner.trackDocument(documentId);
        }

        this.context.checkpoint(message.offset);
    }
}
