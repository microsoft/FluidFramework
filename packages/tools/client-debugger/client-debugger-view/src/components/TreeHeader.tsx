/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { Primitive } from "@fluid-tools/client-debugger";
// eslint-disable-next-line import/no-internal-modules
import { TreeItemLayout } from "@fluentui/react-components/unstable";
import { tokens } from "@fluentui/react-components";

/**
 * Input props to {@link TreeHeader}
 */
export interface TreeHeaderProps {
	/**
	 * Key of the child node from Record {@link VisauTree}.
	 */
	label: string;

	/**
	 * Type of the object.
	 */
	nodeTypeMetadata?: string | undefined;

	/**
	 * Nodekinds to filter rendering pattern in {@link TreeDataView}.
	 */
	nodeKind?: string;

	/**
	 * Size of the children inside the data.
	 */
	itemSize?: Primitive;

	/**
	 * Primitive value of the node if node is {@link VisualNodeKind.FluidValueNode} or {@link VisualNodeKind.ValueNode}
	 */
	nodeValue?: Primitive;
}

/**
 * Renders the header of the item.
 */
export function TreeHeader(props: TreeHeaderProps): React.ReactElement {
	const { label, nodeTypeMetadata, nodeKind, itemSize, nodeValue } = props;

	return nodeValue !== undefined ? (
		<TreeItemLayout style={{ marginLeft: "25px" }}>
			{`${label}`}
			<span style={{ color: tokens.colorPaletteRedBorderActive, fontSize: "12px" }}>
				({nodeTypeMetadata})
			</span>
			{`: ${String(nodeValue)}`}
		</TreeItemLayout>
	) : (
		<TreeItemLayout>
			{`${label === undefined ? nodeTypeMetadata : label}`}
			<span style={{ color: tokens.colorPaletteRedBorderActive, fontSize: "12px" }}>
				({nodeTypeMetadata === undefined ? nodeKind : nodeTypeMetadata})
			</span>
			{`${
				itemSize === undefined
					? ""
					: `${String(itemSize)} ${itemSize === 1 ? "item" : "items"}`
			}`}
		</TreeItemLayout>
	);
}
