/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HasContainerId, VisualNode, VisualNodeKind } from "@fluid-tools/client-debugger";
import { FluidHandleView } from "./FluidHandleView";
import { TreeView } from "./TreeView";
import { FluidTreeView } from "./FluidTreeView";
import { ValueView } from "./ValueView";
import { FluidValueView } from "./FluidValueView";
import { UnknownFluidObjectView } from "./UnknownFluidObjectView";
import { UnknownDataView } from "./UnknownDataView";

/**
 * {@link TreeDataView} input props.
 */
export interface TreeDataViewProps extends HasContainerId {
	node: VisualNode;
}

/**
 * Displays visual summary trees for DDS_s within the container based on the current node's type.
 */
export function TreeDataView(props: TreeDataViewProps): React.ReactElement {
	const { containerId, node } = props;
	switch (node.nodeKind) {
		/**
		 * Node with children.
		 */
		case VisualNodeKind.TreeNode:
			return <TreeView containerId={containerId} node={node} />;
		/**
		 * FluidObjectNode with children.
		 */
		case VisualNodeKind.FluidTreeNode:
			return <FluidTreeView containerId={containerId} node={node} />;
		/**
		 * Node with primitive value.
		 */
		case VisualNodeKind.ValueNode:
			return <ValueView node={node} />;
		/**
		 * FluidObjectNode with primitive value.
		 */
		case VisualNodeKind.FluidValueNode:
			return <FluidValueView node={node} />;
		/**
		 * Unknown data type.
		 */
		case VisualNodeKind.UnknownObjectNode:
			return <UnknownDataView node={node} />;
		/**
		 * Unknown SharedObject data type.
		 */
		case VisualNodeKind.FluidUnknownObjectNode:
			return <UnknownFluidObjectView node={node} />;
		/**
		 * POST request to FluidClientDebugger.
		 */
		case VisualNodeKind.FluidHandleNode:
			return <FluidHandleView containerId={containerId} fluidObjectId={node.fluidObjectId} />;
		default:
			{
				console.log("DevTools hit unknown data. This is NOT expected.");
			}
			return <div>{`Unknown ${JSON.stringify(node)}`}</div>;
	}
}
