/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// import * as assert from "assert";
import { IDocumentDeltaStorageService } from "@microsoft/fluid-driver-definitions";
import * as api from "@microsoft/fluid-protocol-definitions";
// import { CreationServerMessagesHandler } from "./serverMessages";

/**
 * Provides access to the false delta storage.
 */
export class CreationDeltaStorageService implements IDocumentDeltaStorageService {

    // private readonly serverMessagesHandler: CreationServerMessagesHandler;
    constructor() {
        // this.serverMessagesHandler = CreationServerMessagesHandler.getInstance();
    }

    public async get(
        from?: number,
        to?: number,
    ): Promise<api.ISequencedDocumentMessage[]> {
        console.log("from ", from, "to =", to);
        return [];
    }
}
