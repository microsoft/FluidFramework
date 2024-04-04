/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type HasContainerKey, VisualNodeKind } from "@fluidframework/devtools-core";
import React from "react";

import type { DataVisualizationTreeProps } from "./CommonInterfaces.js";
import { FluidHandleView } from "./FluidHandleView.js";
import { FluidTreeView } from "./FluidTreeView.js";
import { FluidValueView } from "./FluidValueView.js";
import { TreeView } from "./TreeView.js";
import { UnknownDataView } from "./UnknownDataView.js";
import { UnknownFluidObjectView } from "./UnknownFluidObjectView.js";
import { ValueView } from "./ValueView.js";

/**
 * {@link TreeDataView} input props.
 */
export interface TreeDataViewProps extends HasContainerKey, DataVisualizationTreeProps {
	// TODO
	root?: boolean;
}

/**
 * Displays visual summary trees for DDS_s within the container based on the current node's type.
 */
export function TreeDataView(props: TreeDataViewProps): React.ReactElement {
	const { containerKey, label, node, root } = props;

	switch (node.nodeKind) {
		/**
		 * Node with children.
		 */
		case VisualNodeKind.TreeNode: {
			return <TreeView containerKey={containerKey} label={label} node={node} root={root} />;
		}
		/**
		 * FluidObjectNode with children.
		 */
		case VisualNodeKind.FluidTreeNode: {
			return (
				<FluidTreeView containerKey={containerKey} label={label} node={node} root={root} />
			);
		}
		/**
		 * Node with primitive value.
		 */
		case VisualNodeKind.ValueNode: {
			return <ValueView label={label} node={node} containerKey={containerKey} root={root} />;
		}
		/**
		 * FluidObjectNode with primitive value.
		 */
		case VisualNodeKind.FluidValueNode: {
			return (
				<FluidValueView containerKey={containerKey} label={label} node={node} root={root} />
			);
		}
		/**
		 * Unknown data type.
		 */
		case VisualNodeKind.UnknownObjectNode: {
			return (
				<UnknownDataView
					label={label}
					node={node}
					containerKey={containerKey}
					root={root}
				/>
			);
		}
		/**
		 * Unknown SharedObject data type.
		 */
		case VisualNodeKind.FluidUnknownObjectNode: {
			return (
				<UnknownFluidObjectView
					label={label}
					node={node}
					containerKey={containerKey}
					root={root}
				/>
			);
		}
		/**
		 * POST request to FluidClientDebugger.
		 */
		case VisualNodeKind.FluidHandleNode: {
			return (
				<FluidHandleView
					containerKey={containerKey}
					fluidObjectId={node.fluidObjectId}
					label={label}
					root={root}
				/>
			);
		}
		default: {
			console.log("DevTools hit unknown data. This is NOT expected.");
			return <></>;
		}
	}
}
