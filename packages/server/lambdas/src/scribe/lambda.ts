import { MessageType } from "@prague/container-definitions";
import {
    extractBoxcar,
    IContext,
    IKafkaMessage,
    IPartitionLambda,
    ISequencedOperationMessage,
    SequencedOperationType,
} from "@prague/services-core";
import * as _ from "lodash";
import * as winston from "winston";

// Temporary measure. We currently always run with verbose winston output so setting a simple flag to conditionally
// enable/disable as part of bringing up this service.
const verboseOutput = false;

export class ScribeLambda implements IPartitionLambda {
    constructor(private context: IContext) {
    }

    public handler(message: IKafkaMessage): void {
        const boxcar = extractBoxcar(message);

        for (const baseMessage of boxcar.contents) {
            if (baseMessage.type === SequencedOperationType) {
                const value = baseMessage as ISequencedOperationMessage;

                const target = `${value.tenantId}/${value.documentId}`;
                let context: string = "";

                if (value.operation.type === MessageType.Propose) {
                    context = value.operation.contents;
                }

                if (verboseOutput) {
                    winston.info(`${target}:${value.operation.clientId} ${value.operation.type} ${context}`);
                }
            }
        }

        this.context.checkpoint(message.offset);
    }

    public close() {
        return;
    }
}
