/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDeltaStorageService,
    ISequencedDocumentMessage,
    ITokenProvider,
} from "@prague/container-definitions";

export class TestDeltaStorageService implements IDeltaStorageService {
    public get(
        tenantId: string,
        id: string,
        tokenProvider: ITokenProvider,
        from?: number,
        to?: number): Promise<ISequencedDocumentMessage[]> {

        return new Promise<ISequencedDocumentMessage[]>((resolve, reject) => {
            resolve([]);
        });
    }
}
