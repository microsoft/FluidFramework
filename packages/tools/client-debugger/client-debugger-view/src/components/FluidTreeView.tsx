/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HasContainerId, FluidObjectTreeNode } from "@fluid-tools/client-debugger";
import { FluidDataView } from "./FluidDataView";

/**
 * {@link TreeView} input props.
 */
export interface FluidTreeViewProps extends HasContainerId {
	node: FluidObjectTreeNode;
}

/**
 * Displays visual summary trees for DDS_s within the container.
 */
export function FluidTreeView(props: FluidTreeViewProps): React.ReactElement {
	const { containerId, node } = props;

	return (
		<>
			{Object.entries(node.children).map(([key, fluidObject], index) => {
				return <FluidDataView key={key} containerId={containerId} node={fluidObject} />;
			})}
		</>
	);
}
