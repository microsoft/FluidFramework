/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
// eslint-disable-next-line import/no-internal-modules
import { Tree as FluentTree, TreeItem, TreeItemLayout } from "@fluentui/react-components/unstable";

/**
 * Input to {@link Tree}
 */
type TreeProps = React.PropsWithChildren<{
	/**
	 * Header label created by {@link TreeHeader}.
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
export function Tree(props: TreeProps): React.ReactElement {
	const { header, children } = props;

	return (
		<FluentTree aria-label="Root-Tree" data-testid="expand-button">
			<TreeItem>
				<TreeItemLayout>{header}</TreeItemLayout>
				<FluentTree aria-label="Sub-Tree">
					{React.Children?.map(children, (child, index) => {
						return (
							// TODO: Wrap with <TreeItem>
							<div key={index}>{child}</div>
						);
					})}
				</FluentTree>
			</TreeItem>
		</FluentTree>
	);
}
