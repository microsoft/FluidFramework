/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HasContainerId, TreeNodeBase } from "@fluid-tools/client-debugger";
import { FluidDataView } from "./FluidDataView";

/**
 * {@link TreeView} input props
 */
export interface TreeViewProps extends HasContainerId {
	containerId: string;
	node: TreeNodeBase;
}

/**
 * Displays visual summary trees for DDS_s within the container
 */
export function TreeView(props: TreeViewProps): React.ReactElement {
	const { containerId, node } = props;

	console.log(containerId, node);

	return (
		<>
			{Object.entries(node).map(([_, fluidObject], index) => {
				return <FluidDataView containerId={containerId} node={fluidObject} />;
			})}
		</>
	);
}
