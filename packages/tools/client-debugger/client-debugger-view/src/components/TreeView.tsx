/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HasContainerId, VisualTreeNode } from "@fluid-tools/client-debugger";
import { FluidDataView } from "./FluidDataView";

/**
 * {@link TreeView} input props.
 */
export interface TreeViewProps extends HasContainerId {
	node: VisualTreeNode;
}

/**
 * Displays visual summary trees for DDS_s within the container.
 */
export function TreeView(props: TreeViewProps): React.ReactElement {
	const { containerId, node } = props;

	return (
		<div>
			{Object.entries(node.children).map(([key, fluidObject], index) => {
				return <FluidDataView key={key} containerId={containerId} node={fluidObject} />;
			})}
		</div>
	);
}
