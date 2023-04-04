/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HasContainerId, TreeNodeBase } from "@fluid-tools/client-debugger";
import { FluidDataView } from "./FluidDataView";

/**
 * {@link TreeView} input props.
 */
export interface TreeViewProps extends HasContainerId {
	node: TreeNodeBase;
}

/**
 * Displays visual summary trees for DDS_s within the container.
 */
export function TreeView(props: TreeViewProps): React.ReactElement {
	const { containerId, node } = props;

	return (
		<>
			{Object.entries(node).map(([key, fluidObject], index) => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				return <FluidDataView key={key} containerId={containerId} node={fluidObject} />;
			})}
		</>
	);
}
