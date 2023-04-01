/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HasContainerId, VisualNode, VisualNodeKind } from "@fluid-tools/client-debugger";
import { FluidHandleView } from "./FluidHandleView";
import { Waiting } from "./Waiting";
import { TreeView } from "./TreeView";
import { ValueView } from "./ValueView";

/**
 * {@link FluidDataView} input props
 */
export interface FluidDataViewProps extends HasContainerId {
	containerId: string, 
	node: VisualNode;
}

/**
 * Displays visual summary trees for DDS_s within the container
 */
export function FluidDataView(props: FluidDataViewProps): React.ReactElement {
	const { containerId, node } = props;

	let view: React.ReactElement; 
	switch (node.nodeKind) {
		/**
		 * node with children 
		 * TreeNodeBase
		 */
		case VisualNodeKind.TreeNode: 
		case VisualNodeKind.FluidTreeNode:
			view = <TreeView containerId={containerId} node={node}/>
			break;
		/**
		 * node with primitive value 
		 * ValueNodeBase
		 */
		case VisualNodeKind.ValueNode:
		case VisualNodeKind.FluidValueNode:
			view = <ValueView containerId={containerId} node={node}/>
			break;
		/**
		 * unknown node type 
		 */
		case VisualNodeKind.FluidUnknownObjectNode:
		case VisualNodeKind.UnknownObjectNode: 
			view = <Waiting label="Waiting for container DDS data." />
			break	
		/**
		 * POST request to FluidClientDebugger 
		 */
		case VisualNodeKind.FluidHandleNode:
			view = <FluidHandleView containerId={containerId} fluidObjectId={node.fluidObjectId}/>
			break;
	}

	return (
		<>
			{view}
		</>
	);
}
