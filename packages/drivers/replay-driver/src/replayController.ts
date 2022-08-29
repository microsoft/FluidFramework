/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentService,
    IDocumentStorageService,
    ISummaryContext,
} from "@fluidframework/driver-definitions";
import * as api from "@fluidframework/protocol-definitions";

/**
 * Partial implementation of IDocumentStorageService
 */
export abstract class ReadDocumentStorageServiceBase implements IDocumentStorageService {
    public abstract getVersions(versionId: string | null, count: number): Promise<api.IVersion[]>;
    public abstract getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree | null>;
    public abstract readBlob(blobId: string): Promise<ArrayBufferLike>;

    public async uploadSummaryWithContext(summary: api.ISummaryTree, context: ISummaryContext): Promise<string> {
        return Promise.reject(new Error("Invalid operation"));
    }

    public async createBlob(file: ArrayBufferLike): Promise<api.ICreateBlobResponse> {
        return Promise.reject(new Error("Invalid operation"));
    }

    public async downloadSummary(handle: api.ISummaryHandle): Promise<api.ISummaryTree> {
        return Promise.reject(new Error("Invalid operation"));
    }

    public get repositoryUrl(): string {
        throw new Error("Invalid operation");
    }
}

/**
 * Replay controller object
 * It controls where we start (snapshot, local file, no snapshots)
 * As well as dispatch of ops
 */
export abstract class ReplayController extends ReadDocumentStorageServiceBase {
    /**
     * Initialize reply controller
     * @param documentService - the real document service
     * @returns - Boolean, indicating if controller should be used.
     * If false is returned, caller should fallback to original storage.
     */
    public abstract initStorage(documentService: IDocumentService): Promise<boolean>;

    /**
     * Returns sequence number to start processing ops
     * Should be zero if not using snapshot, and snapshot seq# otherwise
     */
    public abstract getStartingOpSequence(): Promise<number>;

    /**
     * Returns last op number to fetch from current op
     * Note: this API is called while replay() is in progress - next batch of ops is downloaded in parallel
     * @param currentOp - current op
     */
    public abstract fetchTo(currentOp: number): number | undefined;

    /**
     * Returns true if no more ops should be processed (or downloaded for future processing).
     * It's called at end of each batch with latest op timestamp.
     * Also it's called when there are no more ops available (lastTimeStamp === undefined).
     * If false is returned and there are no more ops, request for more ops is made every 2 seconds.
     * Note: this API is called while replay() is in progress - next batch of ops is downloaded in parallel
     * @param currentOp - current op
     * @param lastTimeStamp - timestamp of last op (if more ops are available). Undefined otherwise.
     */
    public abstract isDoneFetch(currentOp: number, lastTimeStamp?: number): boolean;

    /**
     * Replay batch of ops
     * NOTE: new batch of ops is fetched (fetchTo() & isDoneFetch() APIs are called) while this call is in flights
     * @param emitter - callback to emit ops
     * @param fetchedOps - ops to process
     */
    public abstract replay(
        emitter: (op: api.ISequencedDocumentMessage[]) => void,
        fetchedOps: api.ISequencedDocumentMessage[]): Promise<void>;
}
