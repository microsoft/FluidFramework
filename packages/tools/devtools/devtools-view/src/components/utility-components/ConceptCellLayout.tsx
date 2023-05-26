/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { Label, TableCellLayout } from "@fluentui/react-components";
import { InfoLabel } from "@fluentui/react-components/unstable";

/**
 * {@link ConceptCellLayout} input props.
 */
export type ConceptCellLayoutProps = React.PropsWithChildren<{
	/**
	 * Icon to display to the left of the label.
	 */
	icon: React.ReactElement;

	/**
	 * (Optional) If specified, will display an "info" badge to the right of the label.
	 * When clicked, a tooltip will be displayed with the provided contents.
	 */
	infoTooltipContent?: React.ReactElement | string;
}>;

/**
 * Helper component for rendering the contents of a Table Cell intended to represent some Fluid or Devtools concept.
 *
 * Displays child content, with an optional content on the leading side and an optional "info" badge on the trailing
 * side.
 */
export function ConceptCellLayout(props: ConceptCellLayoutProps): React.ReactElement {
	const { children, icon, infoTooltipContent } = props;

	return (
		<TableCellLayout media={icon}>
			{infoTooltipContent === undefined ? (
				<Label>{children}</Label>
			) : (
				<InfoLabel info={infoTooltipContent}>{children}</InfoLabel>
			)}
		</TableCellLayout>
	);
}
