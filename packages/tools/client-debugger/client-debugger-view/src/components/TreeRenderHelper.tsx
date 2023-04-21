import React from "react";
import { HasContainerId, VisualNode, VisualNodeKind } from "@fluid-tools/client-debugger";
// eslint-disable-next-line import/no-internal-modules
import { Tree, TreeItem, TreeItemLayout } from "@fluentui/react-components/unstable";
import { TreeDataView } from "./TreeDataView";
import { RenderLabel } from "./RenderLabel";

/**
 * TODO
 */
export interface TreeRenderHelperProps extends HasContainerId {
	nodeKey?: string | undefined;
	node: VisualNode;
}

/**
 * TODO
 */
export function TreeRenderHelper(props: TreeRenderHelperProps): React.ReactElement {
	const { containerId, nodeKey, node } = props;
	const itemSize = node.metadata?.size;

	return node.nodeKind === VisualNodeKind.TreeNode ||
		node.nodeKind === VisualNodeKind.FluidTreeNode ? (
		<Tree aria-label="Root-Tree">
			<TreeItem>
				<TreeItemLayout>
					<RenderLabel
						nodeKey={nodeKey}
						nodeTypeMetadata={node.typeMetadata}
						nodeKind={node.nodeKind}
						itemSize={itemSize}
					/>
				</TreeItemLayout>

				<Tree aria-label="Sub-Tree">
					{Object.entries(node.children).map(([key, fluidObject], index) => {
						return (
							<TreeDataView
								key={key}
								containerId={containerId}
								nodeKey={key}
								node={fluidObject}
							/>
						);
					})}
				</Tree>
			</TreeItem>
		</Tree>
	) : (
		<TreeItem>
			<TreeDataView containerId={containerId} nodeKey={nodeKey} node={node} />
		</TreeItem>
	);
}
