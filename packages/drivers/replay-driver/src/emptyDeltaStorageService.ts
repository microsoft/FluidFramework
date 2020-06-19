/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentDeltaStorageService } from "@fluidframework/driver-definitions";
import * as api from "@fluidframework/protocol-definitions";

export class EmptyDeltaStorageService implements IDocumentDeltaStorageService {
    /**
     * Returns ops from the list of ops generated till now.
     * @param from - Ops are returned from + 1.
     * @param to - Op are returned from to - 1.
     * @returns Array of ops requested by the user.
     */
    public async get(from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]> {
        return [];
    }
}
