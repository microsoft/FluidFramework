/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { HasContainerId, VisualTreeNode } from "@fluid-tools/client-debugger";
import { Accordion } from "./utility-components/";
import { TreeDataView } from "./TreeDataView";

/**
 * {@link TreeView} input props.
 */
export interface TreeViewProps extends HasContainerId {
	node: VisualTreeNode;
}

/**
 * Render data with type VisualNodeKind.TreeNode and render its children.
 */
export function TreeView(props: TreeViewProps): React.ReactElement {
	const { containerId, node } = props;

	return (
		<Accordion header={<div>{`${node.metadata}, ${node.nodeKind}`}</div>}>
			{Object.entries(node.children).map(([key, fluidObject], index) => {
				return <TreeDataView key={key} containerId={containerId} node={fluidObject} />;
			})}
		</Accordion>
	);
}
