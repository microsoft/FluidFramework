/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IPragueGraphSummaryPayload {
    type: "container" | "channel";
    message: string;
    sequenceNumber: number;
    entries: PragueGraphSummaryTreeEntry[];
}

export interface IWriteSummaryResponse {
    id: string;
}

export type PragueGraphSummaryTreeEntry = IPragueGraphSummaryTreeValueEntry | IPragueGraphSummaryTreeHandleEntry;

export interface IPragueGraphSummaryTreeBaseEntry {
    path: string;
    type: "blob" | "tree" | "commit";
}

export interface IPragueGraphSummaryTreeValueEntry extends IPragueGraphSummaryTreeBaseEntry {
    value: PragueGraphSummaryTreeValue;
    // Indicates that this tree entry is unreferenced. If this is not present, the tree entry is considered referenced.
    unreferenced?: true;
}

export interface IPragueGraphSummaryTreeHandleEntry extends IPragueGraphSummaryTreeBaseEntry {
    id: string;
}

export type PragueGraphSummaryTreeValue = IPragueGraphSummaryTree | IPragueGraphSummaryBlob;

export interface IPragueGraphSummaryTree {
    type: "tree";
    entries?: PragueGraphSummaryTreeEntry[];
}

export interface IPragueGraphSummaryBlob {
    type: "blob";
    content: string;
    encoding: "base64" | "utf-8";
}
