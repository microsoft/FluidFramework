/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IsoDate } from "./date.js";

/**
 * @legacy
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
 * @legacy
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
 * @legacy
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
	encoding: "utf8" | "base64";
}

/**
 * @legacy
 * @alpha
 */
export interface IAttachment {
	id: string;
}

/**
 * @legacy
 * @alpha
 */
export interface ICreateBlobResponse {
	id: string;
}

/**
 * A tree entry wraps a path with a type of node.
 * @legacy
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
 * @legacy
 * @alpha
 */
export enum TreeEntry {
	Blob = "Blob",
	Tree = "Tree",
	Attachment = "Attachment",
}

/**
 * @legacy
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

	/**
	 * Represents the loading group to which the tree belongs to. Please refer to this readme for more context.
	 * {@link https://github.com/microsoft/FluidFramework/blob/main/packages/runtime/container-runtime/README.md | README}
	 * Also note that "groupId" is the same as "loadingGroupId" used elsewhere in the repo. The naming discrepancy is
	 * intentional to minimize snapshot/summary size.
	 */
	groupId?: string;
}

/**
 * @legacy
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

	/**
	 * Represents the loading group to which the snapshot tree belongs to. Please refer to this readme for more context.
	 * {@link https://github.com/microsoft/FluidFramework/blob/main/packages/runtime/container-runtime/README.md | README}
	 * Also note that "groupId" is the same as "loadingGroupId" used elsewhere in the repo. The naming discrepancy is
	 * intentional to minimize snapshot/summary size.
	 */
	groupId?: string;
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
 * @legacy
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
