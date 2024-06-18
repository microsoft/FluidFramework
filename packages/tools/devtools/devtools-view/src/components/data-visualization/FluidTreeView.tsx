/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	FluidObjectTreeNode,
	HasContainerKey,
} from "@fluidframework/devtools-core/internal";
import React from "react";

import type { DataVisualizationTreeProps } from "./CommonInterfaces.js";
import { TreeDataView } from "./TreeDataView.js";
import { TreeHeader } from "./TreeHeader.js";
import { TreeItem } from "./TreeItem.js";

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
		<TreeHeader
			label={label}
			nodeTypeMetadata={node.typeMetadata}
			metadata={metadata}
			tooltipContents={node.tooltipContents}
		/>
	);

	return <TreeItem header={header}>{childNodes}</TreeItem>;
}
