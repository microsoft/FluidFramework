import React from "react";
// eslint-disable-next-line import/no-internal-modules
import { Tree, TreeItem, TreeItemLayout } from "@fluentui/react-components/unstable";

/**
 * TODO
 */
type RenderSummaryTreeProps = React.PropsWithChildren<{
	header: React.ReactElement | string;
	children: React.ReactElement<{ node: { children?: React.ReactElement } }>[];
}>;

/**
 * TODO
 */
export function RenderSummaryTree(props: RenderSummaryTreeProps): React.ReactElement {
	const { header, children } = props;

	return (
		<Tree aria-label="Root-Tree">
			<TreeItem>
				<TreeItemLayout>{header}</TreeItemLayout>

				{console.log("children:", children)}

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
