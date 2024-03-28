/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Tooltip, tokens } from "@fluentui/react-components";
import { DocumentEdit20Regular } from "@fluentui/react-icons";
import React from "react";
import { ThemeContext } from "../../ThemeHelper.js";
/**
 * Renders the header of the item.
 */
export function TreeHeader(props) {
	const { label, nodeTypeMetadata, inlineValue, metadata, sharedTreeSchemaData } = props;
	const { themeInfo } = React.useContext(ThemeContext);
	console.log("ValueView", sharedTreeSchemaData);
	return React.createElement(
		"div",
		{ style: { width: "auto" } },
		`${label}`,
		React.createElement(
			"span",
			{
				style: {
					color:
						themeInfo.name === "High Contrast" /* ThemeOption.HighContrast */
							? ""
							: tokens.colorPaletteRedBorderActive,
					fontSize: "10px",
				},
			},
			nodeTypeMetadata === undefined ? "" : ` (${nodeTypeMetadata})`,
		),
		React.createElement(
			"span",
			{
				style: {
					color:
						themeInfo.name === "High Contrast" /* ThemeOption.HighContrast */
							? ""
							: tokens.colorPalettePlatinumBorderActive,
					fontStyle: "oblique",
					fontSize: "10px",
				},
			},
			metadata === undefined ? "" : ` ${metadata}`,
		),
		sharedTreeSchemaData === undefined
			? ""
			: React.createElement(
					Tooltip,
					{ content: JSON.stringify(sharedTreeSchemaData), relationship: "description" },
					React.createElement(
						"span",
						{
							style: {
								color:
									themeInfo.name ===
									"High Contrast" /* ThemeOption.HighContrast */
										? ""
										: tokens.colorPalettePlatinumBorderActive,
								fontStyle: "oblique",
								fontSize: "10px",
							},
						},
						React.createElement(DocumentEdit20Regular, null),
					),
			  ),
		inlineValue === undefined ? "" : ": ",
		inlineValue,
	);
}
//# sourceMappingURL=TreeHeader.js.map
