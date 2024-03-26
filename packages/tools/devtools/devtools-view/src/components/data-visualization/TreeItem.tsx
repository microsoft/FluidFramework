/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Tree as FluentTree,
	TreeItem as FluentTreeItem,
	TreeItemLayout as FluentTreeItemLayout,
	treeItemLevelToken,
	useSubtreeContext_unstable,
	useTreeItemContext_unstable,
} from "@fluentui/react-components";
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
 * Constructs a tree element from the provided header and child contents.
 *
 * Intended to be used inside an outer {@link @fluentui/react-components/unstable#Tree} context.
 */
export function TreeItem(props: TreeItemProps): React.ReactElement {
	const { children, header } = props;
	const { level } = useSubtreeContext_unstable();

	const open = useTreeItemContext_unstable((ctx) => ctx.open || level === 1);

	return (
		<FluentTreeItem
			value={level}
			data-testid="tree-button"
			itemType="branch"
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
