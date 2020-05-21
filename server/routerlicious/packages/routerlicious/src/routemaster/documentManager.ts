/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/common-utils";
import * as core from "@microsoft/fluid-server-services-core";

export class DocumentManager {
    public static async create(
        tenantId: string,
        documentId: string,
        collection: core.ICollection<core.IDocument>,
        deltas: core.ICollection<core.ISequencedOperationMessage>): Promise<DocumentManager> {
        const document = await collection.findOne({ documentId, tenantId });
        return new DocumentManager(document, collection, deltas);
    }

    private readonly activeForks: Set<string>;

    private constructor(
        private readonly document: core.IDocument,
        private readonly collection: core.ICollection<core.IDocument>,
        private readonly deltas: core.ICollection<core.ISequencedOperationMessage>) {
        const forks = document.forks || [];
        const filtered = forks
            .filter((value) => value.sequenceNumber !== undefined)
            .map((value) => value.documentId);
        this.activeForks = new Set(filtered);
    }

    /**
     * Returns the IDs for active forks. Which are those whose create fork message has been processed by the
     * route master.
     */
    public getActiveForks(): Set<string> {
        return this.activeForks;
    }

    public async activateFork(id: string, sequenceNumber: number): Promise<void> {
        // Add the fork to the list of active forks
        this.activeForks.add(id);

        // If fork is already active because we are reprocessing a message we can skip this step. But will assert
        // the sequence number is identical
        await this.collection.update(
            {
                "documentId": this.document.documentId,
                "forks.id": id,
                "tenantId": this.document.tenantId,
            },
            {
                "forks.$.sequenceNumber": sequenceNumber,
            },
            null);
    }

    public async getDeltas(from: number, to: number): Promise<core.ISequencedOperationMessage[]> {
        const finalLength = Math.max(0, to - from - 1);
        let result: core.ISequencedOperationMessage[] = [];
        const deferred = new Deferred<core.ISequencedOperationMessage[]>();

        const pollDeltas = () => {
            const query = {
                "documentId": this.document.documentId,
                "operation.sequenceNumber": {
                    $gt: from,
                    $lt: to,
                },
                "tenantId": this.document.tenantId,
            };

            const deltasP = this.deltas.find(query, { "operation.sequenceNumber": 1 });
            deltasP.then(
                (deltas) => {
                    result = result.concat(deltas);
                    if (result.length === finalLength) {
                        deferred.resolve(result);
                    } else {
                        setTimeout(() => pollDeltas(), 100);
                    }
                },
                (error) => {
                    deferred.reject(error);
                });
        };

        // Start polling for the full set of deltas
        pollDeltas();

        return deferred.promise;
    }
}
