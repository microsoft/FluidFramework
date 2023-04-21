/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HasContainerId, FluidObjectTreeNode } from "@fluid-tools/client-debugger";
import { TreeRenderHelper } from "./TreeRenderHelper";

/**
 * {@link TreeView} input props.
 */
export interface FluidTreeViewProps extends HasContainerId {
	node: FluidObjectTreeNode;
}

/**
 * Render data with type VisualNodeKind.FluidTreeNode and render its children.
 */
export function FluidTreeView(props: FluidTreeViewProps): React.ReactElement {
	const { containerId, node } = props;

	return <TreeRenderHelper containerId={containerId} node={node} />;
}
