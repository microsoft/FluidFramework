/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { HasContainerId, VisualTreeNode } from "@fluid-tools/client-debugger";
import { RenderSummaryTree } from "./RenderSumaryTree";
import { TreeDataView } from "./TreeDataView";
import { RenderLabel } from "./RenderLabel";

/**
 * {@link TreeView} input props.
 */
export interface TreeViewProps extends HasContainerId {
	label: string;
	node: VisualTreeNode;
}

/**
 * Render data with type VisualNodeKind.TreeNode and render its children.
 */
export function TreeView(props: TreeViewProps): React.ReactElement {
	const { containerId, label, node } = props;

	const childNodes = Object.entries(node.children).map(([key, fluidObject]) => (
		<TreeDataView key={key} containerId={containerId} label={key} node={fluidObject} />
	));

	const header = (
		<RenderLabel
			label={label}
			nodeTypeMetadata={node.typeMetadata}
			nodeKind={node.nodeKind}
			itemSize={node.metadata?.size}
		/>
	);

	return <RenderSummaryTree header={header}>{childNodes}</RenderSummaryTree>;
}
