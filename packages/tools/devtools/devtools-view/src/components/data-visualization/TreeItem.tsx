/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import {
	Tree as FluentTree,
	TreeItem as FluentTreeItem,
	TreeItemLayout as FluentTreeItemLayout,
} from "@fluentui/react-components/unstable";

/**
 * Input to {@link TreeItem}
 */
export type TreeItemProps = React.PropsWithChildren<{
	/**
	 * Header label created by {@link TreeHeader}.
	 */
	header: React.ReactElement | string;

	// TODO: startOpen
}>;

/**
 * Constructs a tree element from the provided header and child contents.
 *
 * Intended to be used inside an outer {@link @fluentui/react-components/unstable#Tree} context.
 */
export function TreeItem(props: TreeItemProps): React.ReactElement {
	const { children, header } = props;

	const isLeaf = React.Children.count(children) === 0;

	return (
		<FluentTreeItem leaf={isLeaf} data-testid="tree-button">
			<FluentTreeItemLayout>{header}</FluentTreeItemLayout>

			<FluentTree>{children}</FluentTree>
		</FluentTreeItem>
	);
}
