/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-null/no-null */

import {
    ICollection,
    IDocument,
} from "@microsoft/fluid-server-services-core";
import { IDeliCheckpoint } from "./checkpointContext";

// One time migration script per document for updating to latest schema.
// Eventually we can remove it along with legacy fields.
export async function migrateSchema(
    object: IDocument,
    collection: ICollection<IDocument>,
    epoch: number,
    term: number): Promise<IDocument> {
    if (object.version !== undefined) {
        return object;
    } else {
        const deliState: IDeliCheckpoint = {
            branchMap: object.branchMap,
            clients: object.clients,
            durableSequenceNumber: object.sequenceNumber,
            epoch,
            logOffset: object.logOffset,
            sequenceNumber: object.sequenceNumber,
            term,
            lastTicketedTimestamp: 0,
        };
        await collection.update(
            {
                documentId: object.documentId,
                tenantId: object.tenantId,
            },
            {
                version: "0.1",
                deli: JSON.stringify(deliState),
            },
            null);

        // Return the modified object so that we don't have to read it again from db.
        object.version = "0.1";
        object.deli = JSON.stringify(deliState);
        return object;
    }
}
