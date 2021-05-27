export enum SnapshotType {
    Container = "container",
    Channel = "channel",
}

export interface ISummaryPayload {
    type: SnapshotType;
    entries: SnapshotTreeEntry[];
}

export interface ISnapshotResponse {
    id: string;
}

export type SnapshotTreeEntry = ISnapshotTreeValueEntry | ISnapshotTreeHandleEntry;

export interface ISnapshotTreeBaseEntry {
    path: string;
    type: "blob" | "tree" | "commit";
}

export interface ISnapshotTreeValueEntry extends ISnapshotTreeBaseEntry {
    value: SnapshotTreeValue;
    // Indicates that this tree entry is unreferenced. If this is not present, the tree entry is considered referenced.
    unreferenced?: true;
}

export interface ISnapshotTreeHandleEntry extends ISnapshotTreeBaseEntry {
    id: string;
}

export type SnapshotTreeValue = ISnapshotTree | ISnapshotBlob | ISnapshotCommit;

export interface ISnapshotTree {
    type: "tree";
    entries?: SnapshotTreeEntry[];
}

export interface ISnapshotBlob {
    type: "blob";
    content: string;
    encoding: "base64" | "utf-8";
}

export interface ISnapshotCommit {
    type: "commit";
    content: string;
}
