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
 * Render data with type VisualNodeKind.FluidTreeNode and render its children.
 */
export function FluidTreeView(props: FluidTreeViewProps): React.ReactElement {
	const { containerId, node } = props;
	return (
		<Accordion
			header={
				<div>
					{`${node.fluidObjectId} : 
						${node.metadata !== undefined ? `${node.metadata}` : ""}
						${node.nodeKind}`}
				</div>
			}
		>
			{Object.entries(node.children).map(([key, fluidObject], index) => {
				return <TreeDataView key={key} containerId={containerId} node={fluidObject} />;
			})}
		</Accordion>
	);
}
