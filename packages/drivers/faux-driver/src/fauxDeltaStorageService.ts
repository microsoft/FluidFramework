/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentDeltaStorageService } from "@microsoft/fluid-driver-definitions";
import * as api from "@microsoft/fluid-protocol-definitions";

/**
 * Provides access to the false delta storage.
 */
export class FauxDeltaStorageService implements IDocumentDeltaStorageService {

    constructor() {
    }

    public async get(
        from?: number,
        to?: number,
    ): Promise<api.ISequencedDocumentMessage[]> {
        // Do not allow container move forward
        return [];
    }
}
