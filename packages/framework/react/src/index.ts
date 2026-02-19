/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Utilities for using SharedTree with React.
 * @packageDocumentation
 */

export type {
	IsMappableObjectType,
	NodeRecord,
	PropTreeNode,
	PropTreeNodeRecord,
	PropTreeValue,
	UnwrapPropTreeNode,
	UnwrapPropTreeNodeRecord,
	WrapNodes,
	WrapPropTreeNodeRecord,
} from "./propNode.js";
export {
	toPropTreeNode,
	toPropTreeRecord,
	unwrapPropTreeNode,
	unwrapPropTreeRecord,
} from "./propNode.js";
export type {
	IReactTreeDataObject,
	SchemaIncompatibleProps,
	TreeViewProps,
} from "./reactSharedTreeView.js";
export {
	TreeViewComponent,
	treeDataObject,
	treeDataObjectInternal,
} from "./reactSharedTreeView.js";
export { objectIdNumber } from "./simpleIdentifier.js";
export type { ObservationOptions } from "./useObservation.js";
export {
	usePropTreeNode,
	usePropTreeRecord,
	useTree,
	useTreeObservations,
	withMemoizedTreeObservations,
	withTreeObservations,
} from "./useTree.js";
