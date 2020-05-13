/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// import assert from "assert";
import { IDocumentDeltaStorageService } from "@microsoft/fluid-driver-definitions";
import api from "@microsoft/fluid-protocol-definitions";
import { CreationServerMessagesHandler } from ".";

/**
 * Provides access to the false delta storage.
 */
export class CreationDeltaStorageService implements IDocumentDeltaStorageService {
    constructor(private readonly serverMessagesHandler: CreationServerMessagesHandler) {
    }

    public async get(
        from?: number,
        to?: number,
    ): Promise<api.ISequencedDocumentMessage[]> {
        return this.serverMessagesHandler.queuedMessages.slice(from, to);
    }
}
