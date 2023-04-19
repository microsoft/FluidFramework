/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
// eslint-disable-next-line import/no-internal-modules
import { Tree, TreeItem, TreeItemLayout } from "@fluentui/react-components/unstable";
import { HasContainerId, FluidObjectTreeNode } from "@fluid-tools/client-debugger";
import { Divider } from "@fluentui/react-components";
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
		<Tree>
			<TreeItem>
				<TreeItemLayout>
					<Divider>{`${node.fluidObjectId} : 
							${node.metadata !== undefined ? `${node.metadata}` : ""}
							${node.nodeKind}`}</Divider>
				</TreeItemLayout>

				<Tree>
					{Object.entries(node.children).map(([key, fluidObject], index) => {
						return (
							<TreeDataView key={key} containerId={containerId} node={fluidObject} />
						);
					})}
				</Tree>
			</TreeItem>
		</Tree>
	);
}
