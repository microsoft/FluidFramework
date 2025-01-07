/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Object representing a node within a summary tree.
 *
 * @remarks
 * If any particular node is an {@link ISummaryTree}, it can contain additional `SummaryObject`s as its children.
 * @public
 */
export type SummaryObject = ISummaryTree | ISummaryBlob | ISummaryHandle | ISummaryAttachment;

/**
 * The root of the summary tree.
 * @legacy
 * @alpha
 */
export type SummaryTree = ISummaryTree | ISummaryHandle;

/**
 * Type tag used to distinguish different types of nodes in a {@link ISummaryTree}.
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace SummaryType {
	/**
	 * @internal
	 */
	export type Tree = 1;
	/**
	 * @internal
	 */
	export type Blob = 2;
	/**
	 * @internal
	 */
	export type Handle = 3;
	/**
	 * @internal
	 */
	export type Attachment = 4;

	/**
	 * Represents a sub-tree in the summary.
	 * @public
	 */
	export const Tree: Tree = 1 as const;

	/**
	 * Represents a blob of data that is added to the summary.
	 * Such as the user data that is added to the DDS or metadata added by runtime
	 * such as data store / channel attributes.
	 * @public
	 */
	export const Blob: Blob = 2 as const;

	/**
	 * Path to a summary tree object from the last successful summary.
	 * @public
	 */
	export const Handle: Handle = 3 as const;

	/**
	 * Unique identifier to larger blobs uploaded outside of the summary.
	 * Ex. DDS has large images or video that will be uploaded by the BlobManager and
	 * receive an Id that can be used in the summary.
	 * @public
	 */
	export const Attachment: Attachment = 4 as const;
}

/**
 * {@inheritDoc (SummaryType:namespace)}
 * @public
 */
export type SummaryType =
	| SummaryType.Attachment
	| SummaryType.Blob
	| SummaryType.Handle
	| SummaryType.Tree;

/**
 * Summary type that {@link ISummaryHandle} points to.
 *
 * @remarks
 * Summary handles are often used to point to summary tree objects contained within older summaries, thus avoiding
 * the need to re-send the entire subtree if summary object has not changed.
 * @public
 */
export type SummaryTypeNoHandle = SummaryType.Tree | SummaryType.Blob | SummaryType.Attachment;

/**
 * Path to a summary tree object from the last successful summary indicating the summary object hasn't
 * changed since it was uploaded.
 *
 * Special characters include '/'. '/' is used as a separator between different parts of the path as a way to traverse
 * different nodes in the previous summary/snapshot tree.
 *
 * Note, our algorithms use encodeURIComponent and decodeURIComponent to handle special characters in the path. If a string
 * causes this path to fail, the id will be invalid.
 *
 * @example
 * To illustrate, if a DataStore did not change since last summary, the framework runtime will use a handle for the
 * entire DataStore instead of re-sending the entire subtree. The same concept applies for a DDS.
 * An example of a handle string generated when the DDS did not change would be: '/.channels/<DataStoreId>/.channels/<DDSId>'.
 * An example of a handle string generated when the DataStore did not change would be: '/.channels/<DataStoreId>'.
 * An example of a handle string generated when the DDS blob did not change would be: `/.channels/<DataStoreId>/.channels/<DDSId>/<BlobId>`.
 * An example of a handle string generated when the DataStore .attributes blob did not change would be: `/.channels/<DataStoreId>/.attributes`.
 * @public
 */
export interface ISummaryHandle {
	type: SummaryType.Handle;

	/**
	 * Type of Summary Handle (SummaryType.Handle is not supported).
	 */
	handleType: SummaryTypeNoHandle;

	/**
	 * Unique path that identifies the corresponding sub-tree in a previous summary.
	 */
	handle: string;
}

/**
 * String or Binary data to be uploaded to the server as part of the container's Summary.
 *
 * @remarks
 * Note: Already uploaded blobs would be referenced by an {@link ISummaryAttachment}.
 * Additional information can be found here: {@link https://github.com/microsoft/FluidFramework/issues/6568}
 *
 * @example
 * "content": "\{ \"pkg\":\"[\\\"OfficeRootComponent\\\",\\\"LastEditedComponent\\\"]\",
 *                    \"summaryFormatVersion\":2,\"isRootDataStore\":false \}"
 * @public
 */
export interface ISummaryBlob {
	type: SummaryType.Blob;
	content: string | Uint8Array;
}

/**
 * Unique identifier for blobs uploaded outside of the summary.
 *
 * @remarks
 *
 * Attachment Blobs are uploaded and downloaded separately and do not take part of the snapshot payload.
 * The ID gets returned from the backend after the attachment has been uploaded.
 * Additional information can be found here: {@link https://github.com/microsoft/FluidFramework/issues/6374}
 *
 * @example
 * "id": "bQAQKARDdMdTgqICmBa_ZB86YXwGP"
 * @public
 */
export interface ISummaryAttachment {
	type: SummaryType.Attachment;
	id: string;
}

/**
 * Tree Node data structure with children that are nodes of SummaryObject type:
 * Blob, Handle, Attachment or another Tree.
 * @public
 */
export interface ISummaryTree {
	type: SummaryType.Tree;

	/**
	 * The object containing all the tree's {@link SummaryObject} children.
	 *
	 * @param path - The key to store the SummaryObject at in the current summary tree being generated. Should not contain any "/" characters and should not change when encodeURIComponent is called on it.
	 */
	tree: { [path: string]: SummaryObject };

	/**
	 * Indicates that this tree entry is unreferenced.
	 * If this is not present, the tree entry is considered referenced.
	 */
	unreferenced?: true;

	/**
	 * Represents the loading group to which the summary tree belongs to. Please refer to this readme for more context.
	 * {@link https://github.com/microsoft/FluidFramework/blob/main/packages/runtime/container-runtime/README.md | README}
	 * Also note that "groupId" is the same as "loadingGroupId" used elsewhere in the repo. The naming discrepancy is
	 * intentional to minimize snapshot/summary size.
	 */
	groupId?: string;
}
