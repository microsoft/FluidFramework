/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HasContainerId, VisualNode, VisualNodeKind } from "@fluid-experimental/devtools-core";
import { FluidHandleView } from "./FluidHandleView";
import { TreeView } from "./TreeView";
import { FluidTreeView } from "./FluidTreeView";
import { ValueView } from "./ValueView";
import { FluidValueView } from "./FluidValueView";
import { UnknownFluidObjectView } from "./UnknownFluidObjectView";
import { UnknownDataView } from "./UnknownDataView";
import { HasLabel } from "./CommonInterfaces";

/**
 * {@link TreeDataView} input props.
 */
export interface TreeDataViewProps extends HasContainerId, HasLabel {
	node: VisualNode;
}

/**
 * Displays visual summary trees for DDS_s within the container based on the current node's type.
 */
export function TreeDataView(props: TreeDataViewProps): React.ReactElement {
	const { containerId, label, node } = props;

	switch (node.nodeKind) {
		/**
		 * Node with children.
		 */
		case VisualNodeKind.TreeNode:
			return <TreeView containerId={containerId} label={label} node={node} />;
		/**
		 * FluidObjectNode with children.
		 */
		case VisualNodeKind.FluidTreeNode:
			return <FluidTreeView containerId={containerId} label={label} node={node} />;
		/**
		 * Node with primitive value.
		 */
		case VisualNodeKind.ValueNode:
			return <ValueView label={label} node={node} />;
		/**
		 * FluidObjectNode with primitive value.
		 */
		case VisualNodeKind.FluidValueNode:
			return <FluidValueView label={label} node={node} />;
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
			return (
				<FluidHandleView
					containerId={containerId}
					fluidObjectId={node.fluidObjectId}
					label={label}
				/>
			);
		default:
			{
				console.log("DevTools hit unknown data. This is NOT expected.");
			}
			return <div>{`Unknown ${JSON.stringify(node)}`}</div>;
	}
}
