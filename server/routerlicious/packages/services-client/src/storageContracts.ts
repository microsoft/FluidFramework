/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IWholeSummaryPayload {
    type: "container" | "channel";
    message: string;
    sequenceNumber: number;
    entries: WholeSummaryTreeEntry[];
}

export interface IWriteSummaryResponse {
    id: string;
}

export type WholeSummaryTreeEntry = IWholeSummaryTreeValueEntry | IWholeSummaryTreeHandleEntry;

export interface IWholeSummaryTreeBaseEntry {
    path: string;
    type: "blob" | "tree" | "commit";
}

export interface IWholeSummaryTreeValueEntry extends IWholeSummaryTreeBaseEntry {
    value: WholeSummaryTreeValue;
    // Indicates that this tree entry is unreferenced. If this is not present, the tree entry is considered referenced.
    unreferenced?: true;
}

export interface IWholeSummaryTreeHandleEntry extends IWholeSummaryTreeBaseEntry {
    id: string;
}

export type WholeSummaryTreeValue = IWholeSummaryTree | IWholeSummaryBlob;

export interface IWholeSummaryTree {
    type: "tree";
    entries?: WholeSummaryTreeEntry[];
}

export interface IWholeSummaryBlob {
    type: "blob";
    content: string;
    encoding: "base64" | "utf-8";
}
