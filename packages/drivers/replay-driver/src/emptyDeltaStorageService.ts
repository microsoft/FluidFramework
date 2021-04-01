/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentDeltaStorageService, IReadPipe } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

export class EmptyDeltaStorageService implements IDocumentDeltaStorageService {
    /**
     * Returns ops from the list of ops generated till now.
     * @param from - Ops are returned from + 1.
     * @param to - Op are returned from to - 1.
     * @returns Array of ops requested by the user.
     */
    public get(
        from: number,
        to: number | undefined,
        abortSignal?: AbortSignal,
        cachedOnly?: boolean): IReadPipe<ISequencedDocumentMessage[]>
    {
        return { pop: async () => undefined };
    }
}
