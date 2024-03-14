/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { Label, TableCellLayout } from "@fluentui/react-components";
// Allow use of unstable API
// eslint-disable-next-line import/no-internal-modules
import { InfoLabel } from "@fluentui/react-components/unstable";

/**
 * {@link LabelCellLayout} input props.
 */
export type LabelCellLayoutProps = React.PropsWithChildren<{
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
 * Helper component for rendering the contents of a Table Cell containing a label with an optional icon and
 * "info" tooltip.
 *
 * Displays child content, with an optional content on the leading side and an optional "info" badge on the trailing
 * side.
 */
export function LabelCellLayout(props: LabelCellLayoutProps): React.ReactElement {
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
