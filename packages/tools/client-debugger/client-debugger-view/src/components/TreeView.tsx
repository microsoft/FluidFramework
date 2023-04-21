/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { HasContainerId, VisualTreeNode } from "@fluid-tools/client-debugger";
import { TreeRenderHelper } from "./TreeRenderHelper";

/**
 * {@link TreeView} input props.
 */
export interface TreeViewProps extends HasContainerId {
	nodeKey: string | undefined;
	node: VisualTreeNode;
}

/**
 * Render data with type VisualNodeKind.TreeNode and render its children.
 */
export function TreeView(props: TreeViewProps): React.ReactElement {
	const { containerId, nodeKey, node } = props;

	return <TreeRenderHelper containerId={containerId} nodeKey={nodeKey} node={node} />;
}
