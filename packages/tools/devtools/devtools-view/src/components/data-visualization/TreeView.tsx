/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { HasContainerId, VisualTreeNode } from "@fluid-experimental/devtools-core";

import { DataVisualizationTreeProps } from "./CommonInterfaces";
import { TreeDataView } from "./TreeDataView";
import { TreeHeader } from "./TreeHeader";
import { TreeItem } from "./TreeItem";

/**
 * {@link TreeView} input props.
 */
export interface TreeViewProps extends HasContainerId, DataVisualizationTreeProps<VisualTreeNode> {}

/**
 * Render data with type VisualNodeKind.TreeNode and render its children.
 */
export function TreeView(props: TreeViewProps): React.ReactElement {
	const { containerId, label, node } = props;

	const childNodes = Object.entries(node.children).map(([key, fluidObject]) => (
		<TreeDataView key={key} containerId={containerId} label={key} node={fluidObject} />
	));

	const header = <TreeHeader label={label} nodeTypeMetadata={node.typeMetadata} />;

	return <TreeItem header={header}>{childNodes}</TreeItem>;
}
