/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { type HasContainerKey, type FluidObjectTreeNode } from "@fluid-experimental/devtools-core";

import { type DataVisualizationTreeProps } from "./CommonInterfaces";
import { TreeDataView } from "./TreeDataView";
import { TreeHeader } from "./TreeHeader";
import { TreeItem } from "./TreeItem";

/**
 * {@link TreeView} input props.
 */
export interface FluidTreeViewProps
	extends HasContainerKey,
		DataVisualizationTreeProps<FluidObjectTreeNode> {}

/**
 * Render data with type VisualNodeKind.FluidTreeNode and render its children.
 */
export function FluidTreeView(props: FluidTreeViewProps): React.ReactElement {
	const { containerKey, label, node } = props;

	const childNodes = Object.entries(node.children).map(([key, fluidObject]) => (
		<TreeDataView key={key} containerKey={containerKey} label={key} node={fluidObject} />
	));

	const metadata = JSON.stringify(node.metadata);
	const header = (
		<TreeHeader label={label} nodeTypeMetadata={node.typeMetadata} metadata={metadata} />
	);

	return <TreeItem header={header}>{childNodes}</TreeItem>;
}
