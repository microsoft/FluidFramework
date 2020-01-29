/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// import * as assert from "assert";
import { IDocumentDeltaStorageService } from "@microsoft/fluid-driver-definitions";
import * as api from "@microsoft/fluid-protocol-definitions";

/**
 * Provides access to the false delta storage.
 */
export class CreationDeltaStorageService implements IDocumentDeltaStorageService {

    constructor() {
    }

    public async get(
        from?: number,
        to?: number,
    ): Promise<api.ISequencedDocumentMessage[]> {
        return [];
    }
}
