/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HasContainerId, FluidObjectTreeNode } from "@fluid-tools/client-debugger";
import { Accordion } from "./utility-components/";
import { TreeDataView } from "./TreeDataView";

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
	// Accordion header:  fluidObjectId, metadata, typeMetadata
	// Accordion children: (all of the rendered TreeDataView nodes)
	return (
		<Accordion
			key={containerId}
			header={<div>{`${node.fluidObjectId}, ${node.metadata}, ${node.typeMetadata}`}</div>}
			className="FluidTreeView"
		>
			{Object.entries(node.children).map(([key, fluidObject], index) => {
				return <TreeDataView key={key} containerId={containerId} node={fluidObject} />;
			})}
		</Accordion>
	);
}
