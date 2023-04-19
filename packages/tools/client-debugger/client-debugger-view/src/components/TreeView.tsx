/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { HasContainerId, VisualTreeNode } from "@fluid-tools/client-debugger";
// eslint-disable-next-line import/no-internal-modules
import { Tree, TreeItem, TreeItemLayout } from "@fluentui/react-components/unstable";
import { Divider } from "@fluentui/react-components";
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
		<Tree>
			<TreeItem>
				<TreeItemLayout>
					<Divider> {`${node.metadata}, ${node.nodeKind}`} </Divider>
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
