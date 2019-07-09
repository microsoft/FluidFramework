/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage, ITree } from "@prague/container-definitions";
import { SharedMap } from "@prague/map";
import { IComponentRuntime, IObjectStorageService } from "@prague/runtime-definitions";

/**
 * Inking data structure.
 */
export abstract class BaseStream extends SharedMap {
    /**
     * Create a new Stream.
     *
     * @param runtime - The runtime the Stream will attach to
     * @param id - UUID for the stream
     */
    constructor(runtime: IComponentRuntime, id: string, type: string) {
        super(id, runtime, type);
    }

    /**
     * Initialize the stream with a snapshot from the given storage.
     *
     * @param minimumSequenceNumber - Not used
     * @param headerOrigin - Not used
     * @param storage - Storage service to read from
     */
    protected abstract async loadContent(
        minimumSequenceNumber: number,
        headerOrigin: string,
        storage: IObjectStorageService,
    ): Promise<void>;

    /**
     * Get a snapshot of the current content as an ITree.
     */
    protected abstract snapshotContent(): ITree;

    /**
     * Apply a delta to the snapshot.
     *
     * @param message - The message containing the delta to apply
     * @param local - Whether the message is local
     */
    protected abstract processContent(message: ISequencedDocumentMessage, local: boolean);
}
