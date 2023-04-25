import React from "react";
// eslint-disable-next-line import/no-internal-modules
import { Tree, TreeItem, TreeItemLayout } from "@fluentui/react-components/unstable";

/**
 * TODO
 */
type RenderSummaryTreeProps = React.PropsWithChildren<{
	header: React.ReactElement | string;
	children: JSX.Element[];
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

				<Tree aria-label="Sub-Tree">
					{children?.map((child, index) => {
						return <div key={index}>{child}</div>;
					})}
				</Tree>
			</TreeItem>
		</Tree>
	);
}
