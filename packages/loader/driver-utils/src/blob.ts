/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FileMode,
	IBlob,
	IAttachment,
	ITree,
	TreeEntry,
} from "@fluidframework/protocol-definitions";

/**
 * Basic implementation of a blob ITreeEntry
 */
export class BlobTreeEntry {
	public readonly mode = FileMode.File;
	public readonly type = TreeEntry.Blob;
	public readonly value: IBlob;

	/**
	 * Creates a blob ITreeEntry
	 * @param path - path of entry
	 * @param contents - blob contents
	 * @param encoding - encoding of contents; defaults to utf-8
	 */
	constructor(
		public readonly path: string,
		contents: string,
		encoding: "utf-8" | "base64" = "utf-8",
	) {
		this.value = { contents, encoding };
	}
}

/**
 * Basic implementation of a tree ITreeEntry
 */
export class TreeTreeEntry {
	public readonly mode = FileMode.Directory;
	public readonly type = TreeEntry.Tree;

	/**
	 * Creates a tree ITreeEntry
	 * @param path - path of entry
	 * @param value - subtree
	 */
	constructor(public readonly path: string, public readonly value: ITree) {}
}

/**
 * Basic implementation of an attachment ITreeEntry
 */
export class AttachmentTreeEntry {
	public readonly mode = FileMode.File;
	public readonly type = TreeEntry.Attachment;
	public readonly value: IAttachment;

	/**
	 * Creates an attachment ITreeEntry
	 * @param path - path of entry
	 * @param id - id of external blob attachment
	 */
	constructor(public readonly path: string, public readonly id: string) {
		this.value = { id };
	}
}
