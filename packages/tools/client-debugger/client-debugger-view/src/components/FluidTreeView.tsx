/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HasContainerId, FluidObjectTreeNode } from "@fluid-tools/client-debugger";
import { RenderSummaryTree } from "./RenderSumaryTree";
import { TreeDataView } from "./TreeDataView";
import { RenderLabel } from "./RenderLabel";

/**
 * {@link TreeView} input props.
 */
export interface FluidTreeViewProps extends HasContainerId {
	nodeKey: string | undefined;
	node: FluidObjectTreeNode;
}

/**
 * Render data with type VisualNodeKind.FluidTreeNode and render its children.
 */
export function FluidTreeView(props: FluidTreeViewProps): React.ReactElement {
	const { containerId, nodeKey, node } = props;

	const childNodes = Object.entries(node.children).map(([key, fluidObject]) => (
		<TreeDataView key={key} containerId={containerId} nodeKey={key} node={fluidObject} />
	));

	const header = (
		<RenderLabel
			nodeKey={nodeKey}
			nodeTypeMetadata={node.typeMetadata}
			nodeKind={node.nodeKind}
			itemSize={node.metadata?.size}
		/>
	);

	return <RenderSummaryTree header={header}>{childNodes}</RenderSummaryTree>;
}
