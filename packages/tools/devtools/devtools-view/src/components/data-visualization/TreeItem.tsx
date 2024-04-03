/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Tree as FluentTree,
	TreeItem as FluentTreeItem,
	TreeItemLayout as FluentTreeItemLayout,
	treeItemLevelToken,
	useTreeItemContext_unstable,
	useSubtreeContext_unstable,
} from "@fluentui/react-components";
import React from "react";

/**
 * Input to {@link TreeItem}
 */
export type TreeItemProps = React.PropsWithChildren<{
	/**
	 * Header label created by {@link TreeHeader}.
	 */
	header?: React.ReactElement | string;

	// TODO: startOpen
}>;

/**
 * Constructs a tree element from the provided header and child contents.
 *
 * Intended to be used inside an outer {@link @fluentui/react-components/unstable#Tree} context.
 */
export function RecursiveTreeItem(props: TreeItemProps): React.ReactElement {
	const { children, header } = props;
	const { level } = useSubtreeContext_unstable();
	const open = useTreeItemContext_unstable((ctx) => ctx.open || level === 1);

	return (
		<FluentTreeItem value={level} itemType="branch" style={{ [treeItemLevelToken]: level }}>
			<FluentTreeItemLayout>{header}</FluentTreeItemLayout>

			{open && (
				<FluentTree>
					<RecursiveTreeItem header={header}> {children} </RecursiveTreeItem>
				</FluentTree>
			)}
		</FluentTreeItem>
	);
}
