/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FileMode, IBlob, IAttachment, ITree, TreeEntry } from "./storage";
import { SummaryObject, SummaryType } from "./summary";


// duplicated this of common-utils
function unreachableCase(_: never, message = "Unreachable Case"): never {
	throw new Error(message);
}

/**
 * Take a summary object and returns its git mode.
 *
 * @param value - summary object
 * @returns the git mode of summary object
 */
export function getGitMode(value: SummaryObject): string {
	const type = value.type === SummaryType.Handle ? value.handleType : value.type;
	switch (type) {
		case SummaryType.Blob:
		case SummaryType.Attachment:
			return FileMode.File;
		case SummaryType.Tree:
			return FileMode.Directory;
		default:
			unreachableCase(type, `Unknown type: ${type}`);
	}
}

/**
 * Take a summary object and returns its type.
 *
 * @param value - summary object
 * @returns the type of summary object
 */
export function getGitType(value: SummaryObject): "blob" | "tree" {
	const type = value.type === SummaryType.Handle ? value.handleType : value.type;

	switch (type) {
		case SummaryType.Blob:
		case SummaryType.Attachment:
			return "blob";
		case SummaryType.Tree:
			return "tree";
		default:
			unreachableCase(type, `Unknown type: ${type}`);
	}
}

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
