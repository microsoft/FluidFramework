/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentStorageService,
    ISequencedDocumentMessage,
    ISnapshotTree,
    IVersion,
} from "@prague/container-definitions";

export interface IReplayController {
    /**
     * IDocumentStorageService.getVersions() intercept
     */
    getVersions(
        documentStorageService: IDocumentStorageService,
        versionId: string,
        count: number): Promise<IVersion[]>;

    /**
     * IDocumentStorageService.getSnapshotTree() intercept
     */
    getSnapshotTree(
        documentStorageService: IDocumentStorageService,
        version?: IVersion): Promise<ISnapshotTree | null>;

    /**
     * Returns sequence number to start processing ops
     * Should be zero if not using snapshot, and snapshot seq# otherwise
     */
    getStartingOpSequence(): Promise<number>;

    /**
     * Returns last op number to fetch from current op
     * Note: this API is called while replay() is in progress - next batch of ops is downloaded in parallel
     * @param currentOp - current op
     */
    fetchTo(currentOp: number): number;

    /**
     * Returns true if no more ops should be processed (or downloaded for future processing).
     * It's called at end of each batch with latest op timestamp.
     * Also it's called when there are no more ops available (lastTimeStamp === undefined).
     * If false is returned and there are no more ops, request for more ops is made every 2 seconds.
     * Note: this API is called while replay() is in progress - next batch of ops is downloaded in parallel
     * @param currentOp - current op
     * @param lastTimeStamp - timestamp of last op (if more ops are available). Undefined otherwise.
     */
    isDoneFetch(currentOp: number, lastTimeStamp?: number): boolean;

    /**
     * Replay batch of ops
     * NOTE: new batch of ops is fetched (fetchTo() & isDoneFetch() APIs are called) while this call is in flights
     * @param emitter - callback to emit ops
     * @param fetchedOps - ops to process
     */
    replay(emitter: (op: ISequencedDocumentMessage) => void, fetchedOps: ISequencedDocumentMessage[]): Promise<void>;
}
