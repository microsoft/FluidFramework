/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
	children: React.ReactElement[];
}>;

/**
 * Outlays the React element populated by components in {@link TreeDataView}.
 */
export function RenderSummaryTree(props: RenderSummaryTreeProps): React.ReactElement {
	const { header, children } = props;

	return (
		<Tree aria-label="Root-Tree" data-testid="expand-button">
			<TreeItem>
				<TreeItemLayout>{header}</TreeItemLayout>
				<Tree aria-label="Sub-Tree">
					{children?.map((child, index) => {
						return (
							// TODO: Wrap with <TreeItem>
							<div key={index}>{child}</div>
						);
					})}
				</Tree>
			</TreeItem>
		</Tree>
	);
}
