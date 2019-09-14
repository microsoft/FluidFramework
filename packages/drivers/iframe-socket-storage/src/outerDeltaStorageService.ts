/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentDeltaStorageService, ISequencedDocumentMessage,
} from "@prague/protocol-definitions";

/**
 * A simple class to return for the delta storage service
 */
export class OuterDeltaStorageService implements IDocumentDeltaStorageService {

    constructor(private readonly deltaStorage: IDocumentDeltaStorageService) {

    }

    public getOuterDocumentDeltaStorageProxy(): IDocumentDeltaStorageService {
        // deltaStorageProxy
        const customGet = async (from?: number, to?: number) => {
            const val = this.deltaStorage.get(from, to);
            return val;
        };

        const deltaStorageProxy: IDocumentDeltaStorageService = {
            get: customGet,
        };

        return deltaStorageProxy;
    }

    /**
     * Returns ops from the list of ops generated till now.
     * @param from - Ops are returned from + 1.
     * @param to - Op are returned from to - 1.
     * @returns Array of ops requested by the user.
     */
    public get(from?: number, to?: number): Promise<ISequencedDocumentMessage[]> {
        throw new Error("OuterDocumentService.get not implemented");
    }
}
