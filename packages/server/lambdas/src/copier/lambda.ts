/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    extractBoxcar,
    // ICollection,
    IContext,
    IKafkaMessage,
    IPartitionLambda,
    // ISequencedOperationMessage,
    // SequencedOperationType,
} from "@microsoft/fluid-server-services-core";
// import * as winston from "winston";

export class CopierLambda implements IPartitionLambda {
    // private pending = new Map<string, ISequencedOperationMessage[]>();
    // private pendingOffset: number;
    // private current = new Map<string, ISequencedOperationMessage[]>();

    constructor(
        // private opCollection: ICollection<any>,
        // private contentCollection: ICollection<any>,
        protected context: IContext) {
        console.log("lambda constructor");
    }

    public handler(message: IKafkaMessage): void {
        const boxcar = extractBoxcar(message);
        // tslint:disable-next-line: prefer-template
        console.log("copier got a message! at doc id: " + boxcar.documentId);

        // for (const baseMessage of boxcar.contents) {
        //     if (baseMessage.type === SequencedOperationType) {
        //         const value = baseMessage as ISequencedOperationMessage;

        //         // Remove traces and serialize content before writing to mongo.
        //         value.operation.traces = [];

        //         const topic = `${value.tenantId}/${value.documentId}`;
        //         if (!this.pending.has(topic)) {
        //             this.pending.set(topic, []);
        //         }

        //         this.pending.get(topic).push(value);
        //     }
        // }

        // this.pendingOffset = message.offset;
        // this.sendPending();
    }

    public close() {
        // this.pending.clear();
        // this.current.clear();

        return;
    }

    // private sendPending() {
        // If there is work currently being sent or we have no pending work return early
        // if (this.current.size > 0 || this.pending.size === 0) {
        //     return;
        // }

        // // Swap current and pending
        // const temp = this.current;
        // this.current = this.pending;
        // this.pending = temp;
        // const batchOffset = this.pendingOffset;

        // const allProcessed = [];

        // // Process all the batches + checkpoint
        // for (const [, messages] of this.current) {
        //     const processP = this.processMongoCore(messages);
        //     allProcessed.push(processP);
        // }

        // Promise.all(allProcessed).then(
        //     () => {
        //         this.current.clear();
        //         this.context.checkpoint(batchOffset);
        //         this.sendPending();
        //     },
        //     (error) => {
        //         winston.error(error);
        //         this.context.error(error, true);
        //     });
    // }

    // private async processMongoCore(messages: ISequencedOperationMessage[]): Promise<void> {
    //     const insertP = this.insertOp(messages);
    //     const updateP = this.updateSequenceNumber(messages);
    //     await Promise.all([insertP, updateP]);
    // }

    // private async insertOp(messages: ISequencedOperationMessage[]) {
    //     return this.opCollection
    //         .insertMany(messages, false)
    //         .catch((error) => {
    //             // Duplicate key errors are ignored since a replay may cause us to insert twice into Mongo.
    //             // All other errors result in a rejected promise.
    //             if (error.code !== 11000) {
    //                 // Needs to be a full rejection here
    //                 return Promise.reject(error);
    //             }
    //         });
    // }

    // private async updateSequenceNumber(messages: ISequencedOperationMessage[]) {
    //     // TODO: Temporary to back compat with local orderer.
    //     if (this.contentCollection === undefined) {
    //         return;
    //     }

    //     const allUpdates = [];
    //     for (const message of messages) {
    //         if (message.operation.contents === undefined) {
    //             const updateP = this.contentCollection.update(
    //                 {
    //                     "clientId": message.operation.clientId,
    //                     "documentId": message.documentId,
    //                     "op.clientSequenceNumber": message.operation.clientSequenceNumber,
    //                     "tenantId": message.tenantId,
    //                 },
    //                 {
    //                     sequenceNumber: message.operation.sequenceNumber,
    //                 },
    //                 null).catch((error) => {
    //                     // Same reason as insertOp.
    //                     if (error.code !== 11000) {
    //                         return Promise.reject(error);
    //                     }
    //                 });
    //             allUpdates.push(updateP);
    //         }
    //     }

    //     await Promise.all(allUpdates);
    // }
}
