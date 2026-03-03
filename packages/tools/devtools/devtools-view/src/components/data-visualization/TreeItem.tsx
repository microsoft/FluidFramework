/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Tree as FluentTree,
	TreeItem as FluentTreeItem,
	TreeItemLayout as FluentTreeItemLayout,
} from "@fluentui/react-components";
import { Children, type PropsWithChildren, type ReactElement } from "react";
/**
 * Input to {@link TreeItem}
 */
export type TreeItemProps = PropsWithChildren<{
	/**
	 * Header label created by {@link TreeHeader}.
	 */
	header: ReactElement | string;

	// TODO: startOpen
}>;

/**
 * Constructs a tree element from the provided header and child contents.
 *
 * Intended to be used inside an outer {@link @fluentui/react-components#Tree} context.
 */
export function TreeItem(props: TreeItemProps): ReactElement {
	const { children, header } = props;

	const itemType = Children.count(children) === 0 ? "leaf" : "branch";

	return (
		<FluentTreeItem itemType={itemType} tabIndex={0}>
			<FluentTreeItemLayout>{header}</FluentTreeItemLayout>

			<FluentTree>{children}</FluentTree>
		</FluentTreeItem>
	);
}
