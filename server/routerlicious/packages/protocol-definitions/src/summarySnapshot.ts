/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export enum SummarySnapshotType {
    Container = "container",
    Channel = "channel",
}

export interface ISummarySnapshotPayload {
    type: SummarySnapshotType;
    entries: SummarySnapshotTreeEntry[];
}

export interface ISummarySnapshotResponse {
    id: string;
}

export type SummarySnapshotTreeEntry = ISummarySnapshotTreeValueEntry | ISummarySnapshotTreeHandleEntry;

export interface ISummarySnapshotTreeBaseEntry {
    path: string;
    type: "blob" | "tree" | "commit";
}

export interface ISummarySnapshotTreeValueEntry extends ISummarySnapshotTreeBaseEntry {
    value: SummarySnapshotTreeValue;
    // Indicates that this tree entry is unreferenced. If this is not present, the tree entry is considered referenced.
    unreferenced?: true;
}

export interface ISummarySnapshotTreeHandleEntry extends ISummarySnapshotTreeBaseEntry {
    id: string;
}

export type SummarySnapshotTreeValue = ISummarySnapshotTree | ISummarySnapshotBlob | ISummarySnapshotCommit;

export interface ISummarySnapshotTree {
    type: "tree";
    entries?: SummarySnapshotTreeEntry[];
}

export interface ISummarySnapshotBlob {
    type: "blob";
    content: string;
    encoding: "base64" | "utf-8";
}

export interface ISummarySnapshotCommit {
    type: "commit";
    content: string;
}
