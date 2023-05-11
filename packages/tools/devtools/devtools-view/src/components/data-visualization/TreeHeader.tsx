/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { tokens } from "@fluentui/react-components";

import { Primitive } from "@fluid-experimental/devtools-core";

import { HasLabel } from "./CommonInterfaces";

/**
 * Input props to {@link TreeHeader}
 */
export interface TreeHeaderProps extends HasLabel {
	/**
	 * Type of the object.
	 */
	nodeTypeMetadata?: string | undefined;

	/**
	 * Primitive value of the node if node is {@link VisualNodeKind.FluidValueNode} or {@link VisualNodeKind.ValueNode}
	 */
	nodeValue?: Primitive;

	// TODO: metadata
}

/**
 * Renders the header of the item.
 */
export function TreeHeader(props: TreeHeaderProps): React.ReactElement {
	const { label, nodeTypeMetadata, nodeValue } = props;

	return (
		<span>
			{`${label} `}
			<span style={{ color: tokens.colorPaletteRedBorderActive, fontSize: "12px" }}>
				{nodeTypeMetadata === undefined ? "" : ` (${nodeTypeMetadata})`}
			</span>
			{nodeValue === undefined ? "" : `: ${String(nodeValue)}`}
		</span>
	);
}
