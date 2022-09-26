/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ISummaryContext } from "@fluidframework/driver-definitions";
import { UsageError } from "@fluidframework/driver-utils";
import * as api from "@fluidframework/protocol-definitions";
import { OdspDocumentStorageServiceBase } from "../odspDocumentStorageServiceBase";
import { ISnapshotContents } from "../odspPublicUtils";
import { IOdspSnapshot } from "../contracts";
import { convertOdspSnapshotToSnapshotTreeAndBlobs } from "../odspSnapshotParser";
import { parseCompactSnapshotResponse } from "../compactSnapshotParser";

/**
 * ODSP document storage service that works on a provided snapshot for all its processing.
 * Attempting to use unsupported actions/methods will result in errors being thrown.
 */
export class LocalOdspDocumentStorageService extends OdspDocumentStorageServiceBase {
    private snapshotTreeId: string | undefined;

    constructor(
        private readonly logger: ITelemetryLogger,
        private readonly localSnapshot: Uint8Array | string,
    ) {
        super();
    }

    private calledGetVersions = false;

    public async getVersions(blobid: string | null, count: number, _scenarioName?: string): Promise<api.IVersion[]> {
        assert(blobid === null, 0x342 /* Invalid usage. "blobid" should always be null */);
        assert(count === 1, 0x343 /* Invalid usage. "count" should always be 1 */);

        // No reason to re-parse the data since it will never change
        if (this.calledGetVersions) {
            return this.getSnapshotVersion();
        }
        this.calledGetVersions = true;

        let snapshotContents: ISnapshotContents;

        if (typeof this.localSnapshot === "string") {
            const content: IOdspSnapshot = JSON.parse(this.localSnapshot);
            snapshotContents = convertOdspSnapshotToSnapshotTreeAndBlobs(content);
        } else {
            snapshotContents = parseCompactSnapshotResponse(
                this.localSnapshot,
                this.logger);
        }

        this.snapshotTreeId = this.initializeFromSnapshot(snapshotContents);
        return this.getSnapshotVersion();
    }

    private getSnapshotVersion(): api.IVersion[] {
        return this.snapshotTreeId ? [{ id: this.snapshotTreeId, treeId: undefined! }] : [];
    }

    protected fetchTreeFromSnapshot(_id: string, _scenarioName?: string): never {
        this.throwUsageError("fetchTreeFromSnapshot");
    }

    protected fetchBlobFromStorage(_blobId: string, _evicted: boolean): never {
        this.throwUsageError("fetchBlobFromStorage");
    }

    public uploadSummaryWithContext(_summary: api.ISummaryTree, _context: ISummaryContext): never {
        this.throwUsageError("uploadSummaryWithContext");
    }

    public createBlob(_file: ArrayBufferLike): never {
        this.throwUsageError("createBlob");
    }

    private throwUsageError(methodName: string): never {
        const toThrow = new UsageError(`"${methodName}" is not supported by LocalOdspDocumentStorageService`);
        this.logger.sendErrorEvent({ eventName: "UnsupportedUsage" }, toThrow);
        throw toThrow;
    }
}
