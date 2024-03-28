/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HasContainerKey, VisualTreeNode } from "@fluidframework/devtools-core";
import React from "react";

import type { DataVisualizationTreeProps } from "./CommonInterfaces.js";
import { TreeDataView } from "./TreeDataView.js";
import { TreeHeader } from "./TreeHeader.js";
import { TreeItem } from "./TreeItem.js";

/**
 * {@link TreeView} input props.
 */
export interface TreeViewProps
	extends HasContainerKey,
		DataVisualizationTreeProps<VisualTreeNode> {}

/**
 * Render data with type VisualNodeKind.TreeNode and render its children.
 */
export function TreeView(props: TreeViewProps): React.ReactElement {
	const { containerKey, label, node } = props;
	const metadata = JSON.stringify(node.metadata);

	const childNodes = Object.entries(node.children).map(([key, fluidObject]) => (
		<TreeDataView key={key} containerKey={containerKey} label={key} node={fluidObject} />
	));

	const header = (
		<TreeHeader label={label} nodeTypeMetadata={node.typeMetadata} metadata={metadata} />
	);

	return <TreeItem header={header}>{childNodes}</TreeItem>;
}
