import * as winston from "winston";
import * as core from "../core";
import { BatchManager } from "../core-utils";
import { IContext, IPartitionLambda } from "../kafka-service/lambdas";
import * as utils from "../utils";

export class ScriptoriumLambda implements IPartitionLambda {
    private ioBatchManager: BatchManager<core.ISequencedOperationMessage>;

    constructor(private io: core.IPublisher, private collection: core.ICollection<any>, protected context: IContext) {
        this.io.on("error", (error) => {
            // After an IO error we need to recreate the lambda
            this.context.close(error);
        });

        this.ioBatchManager = new BatchManager<core.ISequencedOperationMessage>((documentId, work) => {
            // Add trace to each message before routing.
            work.map((value) => {
                if (value.operation.traces !== undefined) {
                    value.operation.traces.push( {service: "scriptorium", action: "end", timestamp: Date.now()});
                }
            });

            // Route the message to clients
            winston.verbose(`Routing to clients ${documentId}@${work[0].operation.sequenceNumber}:${work.length}`);
            this.io.to(documentId).emit("op", documentId, work.map((value) => value.operation));

            winston.verbose(`Inserting to mongodb ${documentId}@${work[0].operation.sequenceNumber}:${work.length}`);
            return this.collection.insertMany(work, false)
                .catch((error) => {
                    // Ignore duplicate key errors since a replay may cause us to attempt to insert a second time
                    if (error.name !== "MongoError" || error.code !== 11000) {
                        // Needs to be a full rejection here
                        return Promise.reject(error);
                    }
                });
        });
    }

    public handler(message: utils.kafkaConsumer.IMessage): void {
        const baseMessage = JSON.parse(message.value.toString()) as core.IMessage;
        if (baseMessage.type === core.SequencedOperationType) {
            const value = baseMessage as core.ISequencedOperationMessage;

            // Add trace.
            if (value.operation.traces !== undefined) {
                value.operation.traces.push( {service: "scriptorium", action: "start", timestamp: Date.now()});
            }

            // Batch up work to more efficiently send to socket.io and mongodb
            this.ioBatchManager.add(value.documentId, value);
        }
    }
}
