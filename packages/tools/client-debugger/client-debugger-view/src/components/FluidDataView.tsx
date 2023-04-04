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
import { Waiting } from "./Waiting";
import { waitingLabels } from "./WaitingLabels";

/**
 * {@link FluidDataView} input props.
 */
export interface FluidDataViewProps extends HasContainerId {
	node: VisualNode;
}

/**
 * Displays visual summary trees for DDS_s within the container.
 */
export function FluidDataView(props: FluidDataViewProps): React.ReactElement {
	const { containerId, node } = props;

	let view: React.ReactElement;
	switch (node.nodeKind) {
		/**
		 * Node with children.
		 */
		case VisualNodeKind.TreeNode:
			view = <TreeView containerId={containerId} node={node} />;
			break;
		/**
		 * FluidObjectNode with children.
		 */
		case VisualNodeKind.FluidTreeNode:
			view = <FluidTreeView containerId={containerId} node={node} />;
			break;
		/**
		 * Node with primitive value.
		 */
		case VisualNodeKind.ValueNode:
			view = <ValueView containerId={containerId} node={node} />;
			break;
		/**
		 * FluidObjectNode with primitive value.
		 */
		case VisualNodeKind.FluidValueNode:
			view = <FluidValueView containerId={containerId} node={node} />;
			break;
		/**
		 * Unknown data type.
		 */
		case VisualNodeKind.UnknownObjectNode:
			view = <UnknownDataView containerId={containerId} node={node} />;
			break;
		/**
		 * Unknown SharedObject data type.
		 */
		case VisualNodeKind.FluidUnknownObjectNode:
			view = <UnknownFluidObjectView containerId={containerId} node={node} />;
			break;
		/**
		 * POST request to FluidClientDebugger.
		 */
		case VisualNodeKind.FluidHandleNode:
			view = <FluidHandleView containerId={containerId} fluidObjectId={node.fluidObjectId} />;
			break;
		default:
			view = <Waiting label={waitingLabels.undefinedError} />;
			break;
	}

	return <>{view}</>;
}
