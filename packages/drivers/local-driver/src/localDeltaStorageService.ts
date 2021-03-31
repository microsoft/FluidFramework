/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IDatabaseManager } from "@fluidframework/server-services-core";
import { pipeFromOps } from "@fluidframework/driver-utils";

export class LocalDeltaStorageService implements api.IDocumentDeltaStorageService {
    constructor(
        private readonly tenantId: string,
        private readonly id: string,
        private readonly databaseManager: IDatabaseManager) {
    }

    public get(
        from: number,
        to: number | undefined,
        cachedOnly?: boolean,
        abortSignal?: AbortSignal): api.IReadPipe<ISequencedDocumentMessage[]> {
            return pipeFromOps(this.getCore(from, to));
    }

    private async getCore(from: number, to?: number) {
        const query = { documentId: this.id, tenantId: this.tenantId };
        query["operation.sequenceNumber"] = {};
        query["operation.sequenceNumber"].$gt = from;
        if (to !== undefined) {
            query["operation.sequenceNumber"].$lt = to;
        }

        const allDeltas = await this.databaseManager.getDeltaCollection(this.tenantId, this.id);
        const dbDeltas = await allDeltas.find(query, { "operation.sequenceNumber": 1 });
        const messages = dbDeltas.map((delta) => delta.operation);
        return messages;
    }
}
