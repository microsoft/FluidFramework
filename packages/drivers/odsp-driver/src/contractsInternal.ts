/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";
import { ITelemetryProperties } from "@fluidframework/common-definitions";
import { TokenFetchOptions } from "@fluidframework/odsp-driver-definitions";

export interface ISnapshotContents {
    snapshotTree: ISnapshotTree;
    blobs: Map<string, ArrayBuffer>;
    ops: ISequencedDocumentMessage[];

    /**
     * Sequence number of the snapshot
     */
    sequenceNumber: number | undefined;

    /**
     * Sequence number for the latest op/snapshot for the file in ODSP
     */
    latestSequenceNumber: number | undefined;
}

export type InstrumentedStorageTokenFetcher = (
    options: TokenFetchOptions,
    name: string,
    alwaysRecordTokenFetchTelemetry?: boolean,
    telemetryProps?: ITelemetryProperties) => Promise<string | null>;
