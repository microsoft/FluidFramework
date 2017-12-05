import * as core from "../core";
import { Deferred } from "../core-utils";

export class DocumentManager {
    public static async Create(
        id: string,
        collection: core.ICollection<core.IDocument>,
        deltas: core.ICollection<core.ISequencedOperationMessage>): Promise<DocumentManager> {

        const document = await collection.findOne({ _id: id });
        return new DocumentManager(document, collection, deltas);
    }

    private activeForks: Set<string>;
    private sequenceNumber: number;

    private constructor(
        private document: core.IDocument,
        private collection: core.ICollection<core.IDocument>,
        private deltas: core.ICollection<core.ISequencedOperationMessage>) {

        const forks = document.forks || [];
        const filtered = forks
            .filter((value) => value.sequenceNumber !== undefined)
            .map((value) => value.id);
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
                "_id": this.document._id,
                "forks.id": id,
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
                "documentId": this.document._id,
                "operation.sequenceNumber": {
                    $gt: from,
                    $lt: to,
                },
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

    /**
     * Tracks the last forwarded message for the document
     */
    public trackForward(sequenceNumber: number) {
        this.sequenceNumber = sequenceNumber;
    }
}
