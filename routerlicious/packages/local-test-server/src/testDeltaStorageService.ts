// tslint:disable-next-line:no-submodule-imports
import { IDatabaseManager } from "@prague/routerlicious/dist/core";
import * as api from "@prague/runtime-definitions";

export class TestDeltaStorageService implements api.IDocumentDeltaStorageService {
    constructor(
        private tenantId: string,
        private id: string,
        private databaseManager: IDatabaseManager) {
    }

    public async get(from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]> {
        const query = { documentId: this.id, tenantId: this.tenantId };
        /* tslint:disable:no-unsafe-any */
        if (from !== undefined || to !== undefined) {
            query["operation.sequenceNumber"] = {};

            if (from !== undefined) {
                query["operation.sequenceNumber"].$gt = from;
            }

            if (to !== undefined) {
                query["operation.sequenceNumber"].$lt = to;
            }
        }

        const allDeltas = await this.databaseManager.getDeltaCollection(this.tenantId, this.id);
        const deltas = await allDeltas.find(query, { "operation.sequenceNumber": 1 });
        const deltaMsgs: api.ISequencedDocumentMessage[] = [];
        deltas.forEach((delta) => {
            const operation = delta.operation as api.ISequencedDocumentMessage;
            // Temporary workaround to handle old deltas where content type is object.
            if (typeof operation.contents === "string") {
                operation.contents = JSON.parse(operation.contents);
            }
            deltaMsgs.push(operation);
        });

        return deltaMsgs;
    }
}
