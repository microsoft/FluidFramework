/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Utilities for using SharedTree with React.
 * @packageDocumentation
 */

export type {
	IReactTreeDataObject,
	TreeViewProps,
	SchemaIncompatibleProps,
} from "./reactSharedTreeView.js";
export {
	treeDataObject,
	treeDataObjectInternal,
	TreeViewComponent,
} from "./reactSharedTreeView.js";
export type {
	NodeRecord,
	PropTreeNode,
	PropTreeNodeRecord,
	PropTreeValue,
	UnwrapPropTreeNode,
	UnwrapPropTreeNodeRecord,
	WrapPropTreeNodeRecord,
	WrapNodes,
} from "./propNode.js";
export {
	toPropTreeNode,
	toPropTreeRecord,
	unwrapPropTreeNode,
	unwrapPropTreeRecord,
} from "./propNode.js";
export {
	useTree,
	usePropTreeNode,
	usePropTreeRecord,
	useTreeObservations,
	withTreeObservations,
} from "./useTree.js";
export { objectIdNumber } from "./simpleIdentifier.js";
