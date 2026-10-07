/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InfoLabelProps, PositioningShorthand } from "@fluentui/react-components";
import type { ReactElement } from "react";

import { FluentReactComponents } from "../../FluentUi.cjs";

const { InfoLabel, makeStyles } = FluentReactComponents;

/**
 * Positions information content below its trigger.
 */
export const informationPositioning = {
	position: "below",
	align: "start",
	// Prevent a fallback above the button from covering the heading.
	pinned: true,
} satisfies PositioningShorthand;

const useStyles = makeStyles({
	information: {
		// Fluent resets inline widths when it calculates the available space.
		width: "max-content",
		whiteSpace: "normal",
	},
});

/**
 * {@link InformationLabel} input props.
 */
export type InformationLabelProps = Pick<InfoLabelProps, "children" | "style"> & {
	/**
	 * Content of the information popover.
	 */
	info: ReactElement | string;
};

/**
 * Displays a label whose information popover opens below its button.
 */
export function InformationLabel(props: InformationLabelProps): ReactElement {
	const { children, info, style } = props;
	const styles = useStyles();

	return (
		<InfoLabel
			info={{ children: info, className: styles.information }}
			infoButton={{ popover: { positioning: { ...informationPositioning, autoSize: true } } }}
			style={style}
		>
			{children}
		</InfoLabel>
	);
}
