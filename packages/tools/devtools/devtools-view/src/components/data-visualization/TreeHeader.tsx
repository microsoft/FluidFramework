/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { tokens } from "@fluentui/react-components";

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
	 * Inline value to display alongside the metadata.
	 */
	inlineValue?: React.ReactElement | string;

	// TODO: metadata
}

/**
 * Renders the header of the item.
 */
export function TreeHeader(props: TreeHeaderProps): React.ReactElement {
	const { label, nodeTypeMetadata, inlineValue } = props;

	return (
		<div style={{ width: "auto" }}>
			{`${label}`}
			<span style={{ color: tokens.colorPaletteRedBorderActive, fontSize: "10px" }}>
				{nodeTypeMetadata === undefined ? "" : ` (${nodeTypeMetadata})`}
			</span>
			{inlineValue === undefined ? "" : ": "}
			{inlineValue}
		</div>
	);
}
