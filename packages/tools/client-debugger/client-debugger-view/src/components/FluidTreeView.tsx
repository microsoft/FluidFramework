/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HasContainerId, FluidObjectTreeNode } from "@fluid-tools/client-debugger";
import { Tree } from "./Tree";
import { TreeDataView } from "./TreeDataView";
import { TreeHeader } from "./TreeHeader";
import { HasLabel } from "./CommonInterfaces";

/**
 * {@link TreeView} input props.
 */
export interface FluidTreeViewProps extends HasContainerId, HasLabel {
	node: FluidObjectTreeNode;
}

/**
 * Render data with type VisualNodeKind.FluidTreeNode and render its children.
 */
export function FluidTreeView(props: FluidTreeViewProps): React.ReactElement {
	const { containerId, label, node } = props;

	const childNodes = Object.entries(node.children).map(([key, fluidObject]) => (
		<TreeDataView key={key} containerId={containerId} label={key} node={fluidObject} />
	));

	const header = (
		<TreeHeader
			label={label}
			nodeTypeMetadata={node.typeMetadata}
			nodeKind={node.nodeKind}
			itemSize={node.metadata?.size}
		/>
	);

	return <Tree header={header}>{childNodes}</Tree>;
}
