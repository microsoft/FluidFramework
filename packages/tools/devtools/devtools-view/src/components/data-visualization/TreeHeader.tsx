/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { tokens } from "@fluentui/react-components";
import React from "react";

import { InfoLabel } from "@fluentui/react-components/unstable";
import type { IToolTipContents } from "@fluidframework/devtools-core";
import { ThemeContext, ThemeOption } from "../../ThemeHelper.js";
import { TooltipContentsHelper } from "./TooltipContents.js";
import type { HasLabel } from "./CommonInterfaces.js";

/**
 * Input props to {@link TreeHeader}
 */
export interface TreeHeaderProps extends HasLabel {
	/**
	 * Type of the object.
	 */
	nodeTypeMetadata?: string | undefined;

	metadata?: string | undefined;

	/**
	 * Inline value to display alongside the metadata.
	 */
	inlineValue?: React.ReactElement | string;

	/**
	 * Visual Tree data rendered in the tooltip.
	 */
	tooltipContents?: IToolTipContents;
}

/**
 * Renders the header of the item.
 */
export function TreeHeader(props: TreeHeaderProps): React.ReactElement {
	const { label, nodeTypeMetadata, inlineValue, metadata, tooltipContents } = props;
	const { themeInfo } = React.useContext(ThemeContext);

	return (
		<div style={{ width: "auto" }}>
			{`${label}`}
			<span
				style={{
					color:
						themeInfo.name === ThemeOption.HighContrast
							? ""
							: tokens.colorPaletteRedBorderActive,
					fontSize: "10px",
				}}
			>
				{nodeTypeMetadata === undefined ? "" : ` (${nodeTypeMetadata})`}
			</span>
			<span
				style={{
					color:
						themeInfo.name === ThemeOption.HighContrast
							? ""
							: tokens.colorPalettePlatinumBorderActive,
					fontStyle: "oblique",
					fontSize: "10px",
				}}
			>
				{metadata === undefined ? "" : ` ${metadata}`}
			</span>

			{tooltipContents === undefined ? (
				""
			) : (
				<InfoLabel
					info={TooltipContentsHelper({ contents: tooltipContents })}
					style={{ whiteSpace: "nowrap" }}
				/>
			)}

			{inlineValue === undefined ? "" : ": "}
			{inlineValue}
		</div>
	);
}
