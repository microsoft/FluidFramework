/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Tooltip, makeStyles, tokens } from "@fluentui/react-components";
import { Info20Regular } from "@fluentui/react-icons";
import type { VisualChildNode } from "@fluidframework/devtools-core/internal";
import React from "react";

import { ThemeContext, ThemeOption } from "../../ThemeHelper.js";

import type { HasLabel } from "./CommonInterfaces.js";
import { ToolTipContentsView } from "./ToolTipContentsView.js";

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
	tooltipContents?: string | Record<string, VisualChildNode>;
}

const getStyles = makeStyles({
	tooltip: {
		color: tokens.colorNeutralForeground1Hover,
		minWidth: "1000px",
	},
	iconContainer: {
		paddingLeft: "3px",
		paddingRight: "3px",
		paddingBottom: "2px",
		verticalAlign: "middle",
	},
	inlineValue: {
		whiteSpace: "pre-wrap",
	},
});

/**
 * Renders the header of the item.
 */
export function TreeHeader(props: TreeHeaderProps): React.ReactElement {
	const { label, nodeTypeMetadata, inlineValue, metadata, tooltipContents } = props;
	const { themeInfo } = React.useContext(ThemeContext);

	const styles = getStyles();

	return (
		<div>
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
			{tooltipContents !== undefined && (
				<Tooltip
					content={{
						children: <ToolTipContentsView contents={tooltipContents} />,
						className: styles.tooltip,
					}}
					relationship="description"
				>
					<Info20Regular className={styles.iconContainer} />
				</Tooltip>
			)}
			{inlineValue !== undefined && (
				<span className={styles.inlineValue}>: {inlineValue}</span>
			)}
		</div>
	);
}
