/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@fluidframework/driver-definitions";
import { IDatabaseManager } from "@fluidframework/server-services-core";

export class LocalDeltaStorageService implements api.IDocumentDeltaStorageService {
    constructor(
        private readonly tenantId: string,
        private readonly id: string,
        private readonly databaseManager: IDatabaseManager) {
    }

    public async get(from?: number, to?: number): Promise<api.IOpResult> {
        const query = { documentId: this.id, tenantId: this.tenantId };
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
        const messages = dbDeltas.map((delta) => delta.operation);
        return { messages, end: true };
    }
}
