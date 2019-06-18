/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@prague/container-definitions";
import { IDatabaseManager } from "@prague/services-core";

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
        const dbDeltas = await allDeltas.find(query, { "operation.sequenceNumber": 1 });
        return dbDeltas.map((delta) => delta.operation);
    }
}
