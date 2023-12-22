/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoDate } from "./date";

/**
 * @alpha
 */
export interface IDocumentAttributes {
	/**
	 * Sequence number at which the snapshot was taken
	 */
	sequenceNumber: number;

	/**
	 * Minimum sequence number when the snapshot was taken
	 */
	minimumSequenceNumber: number;
}

/**
 * @alpha
 */
export enum FileMode {
	File = "100644",
	Executable = "100755",
	Directory = "040000",
	Symlink = "120000",
}

/**
 * Raw blob stored within the tree.
 * @alpha
 */
export interface IBlob {
	/**
	 * Contents of the blob
	 */
	contents: string;

	/**
	 * The encoding of the contents string
	 */
	// eslint-disable-next-line unicorn/text-encoding-identifier-case
	encoding: "utf-8" | "base64";
}

/**
 * @alpha
 */
export interface IAttachment {
	id: string;
}

/**
 * @alpha
 */
export interface ICreateBlobResponse {
	id: string;
}

/**
 * A tree entry wraps a path with a type of node.
 * @alpha
 */
export type ITreeEntry = {
	/**
	 * Path to the object
	 */
	path: string;

	/**
	 * The file mode; one of 100644 for file (blob), 100755 for executable (blob), 040000 for subdirectory (tree)
	 * or 120000 for a blob that specifies the path of a symlink
	 */
	mode: FileMode;
} & (
	| {
			type: TreeEntry.Blob;
			value: IBlob;
	  }
	| {
			type: TreeEntry.Tree;
			value: ITree;
	  }
	| {
			type: TreeEntry.Attachment;
			value: IAttachment;
	  }
);

/**
 * Type of entries that can be stored in a tree.
 * @alpha
 */
export enum TreeEntry {
	Blob = "Blob",
	Tree = "Tree",
	Attachment = "Attachment",
}

/**
 * @alpha
 */
export interface ITree {
	entries: ITreeEntry[];

	/**
	 * Unique ID representing all entries in the tree. Can be used to optimize snapshotting in the case
	 * it is known that the `ITree` has already been created and stored
	 */
	id?: string;

	/**
	 * Indicates that this tree is unreferenced. If this is not present, the tree is considered referenced.
	 */
	unreferenced?: true;
}

/**
 * @alpha
 */
export interface ISnapshotTree {
	id?: string;
	blobs: { [path: string]: string };
	trees: { [path: string]: ISnapshotTree };

	/**
	 * Indicates that this tree is unreferenced. If this is not present, the tree is considered referenced.
	 */
	unreferenced?: true;
}

/**
 * @internal
 */
export interface ISnapshotTreeEx extends ISnapshotTree {
	id: string;
	trees: { [path: string]: ISnapshotTreeEx };
}

/**
 * Represents a version of the snapshot of a data store.
 * @alpha
 */
export interface IVersion {
	/**
	 * Version ID
	 */
	id: string;

	/**
	 * Tree ID for this version of the snapshot
	 */
	treeId: string;

	/**
	 * Time when snapshot was generated.
	 */
	date?: IsoDate;
}
