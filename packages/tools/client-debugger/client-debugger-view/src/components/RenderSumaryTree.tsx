import React from "react";
// eslint-disable-next-line import/no-internal-modules
import { Tree, TreeItem, TreeItemLayout } from "@fluentui/react-components/unstable";

/**
 * Input to {@link RenderSumaryTree}
 */
type RenderSummaryTreeProps = React.PropsWithChildren<{
	/**
	 * Header label created by {@link RenderLabel}.
	 */
	header: React.ReactElement | string;

	/**
	 * List of child React Elements populated by recursion.
	 */
	children: React.ReactElement<{ node: { children?: React.ReactElement } }>[];
}>;

/**
 * Outlays the React element populated by components in {@link TreeDataView}.
 */
export function RenderSummaryTree(props: RenderSummaryTreeProps): React.ReactElement {
	const { header, children } = props;

	return (
		<Tree aria-label="Root-Tree">
			<TreeItem>
				<TreeItemLayout>{header}</TreeItemLayout>
				<Tree aria-label="Sub-Tree">
					{children?.map((child, index) => {
						return (
							<div key={index}>
								{child.props.node.children ? (
									<> {child} </>
								) : (
									<TreeItem>{child}</TreeItem>
								)}
							</div>
						);
					})}
				</Tree>
			</TreeItem>
		</Tree>
	);
}
