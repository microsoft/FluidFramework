/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Tree as FluentTree,
	TreeItem as FluentTreeItem,
	TreeItemLayout as FluentTreeItemLayout,
	treeItemLevelToken,
	useTreeItem_unstable,
} from "@fluentui/react-components/unstable";
import React from "react";

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
 * TODO
 */
export declare const useSubtreeContext_unstable: () => SubtreeContextValue;

/**
 * TODO
 */
export interface SubtreeContextValue {
	contextType: "subtree";
	level: number;
}

/**
 * Constructs a tree element from the provided header and child contents.
 *
 * Intended to be used inside an outer {@link @fluentui/react-components/unstable#Tree} context.
 */
export function TreeItem(props: TreeItemProps): React.ReactElement {
	const { children, header } = props;

	// TODO: Need level.
	const { level } = useSubtreeContext_unstable();

	// TODO: Need open or closed boolean state.
	const open = true;

	const isLeaf = React.Children.count(children) === 0;

	return (
		<FluentTreeItem
			value={level}
			leaf={isLeaf}
			data-testid="tree-button"
			style={{ [treeItemLevelToken]: level }}
		>
			<FluentTreeItemLayout>{header}</FluentTreeItemLayout>
			{open && (
				<FluentTree>
					<TreeItem header={header} />
				</FluentTree>
			)}

			<FluentTree>{children}</FluentTree>
		</FluentTreeItem>
	);
}

/**
 * TODO
 */
export function InlineStylingTreeItemLevel(props: TreeItemProps): React.ReactElement {
	const { header } = props;

	return (
		<FluentTree>
			<TreeItem header={header} />
		</FluentTree>
	);
}
