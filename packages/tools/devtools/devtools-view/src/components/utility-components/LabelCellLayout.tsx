/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { InfoLabel, Label, TableCellLayout } from "@fluentui/react-components";
import type { PropsWithChildren, ReactElement } from "react";

/**
 * {@link LabelCellLayout} input props.
 */
export type LabelCellLayoutProps = PropsWithChildren<{
	/**
	 * Icon to display to the left of the label.
	 */
	icon: ReactElement;

	/**
	 * (Optional) If specified, will display an "info" badge to the right of the label.
	 * When clicked, a tooltip will be displayed with the provided contents.
	 */
	infoTooltipContent?: ReactElement | string;
}>;

/**
 * Helper component for rendering the contents of a Table Cell containing a label with an optional icon and
 * "info" tooltip.
 *
 * Displays child content, with an optional content on the leading side and an optional "info" badge on the trailing
 * side.
 */
export function LabelCellLayout(props: LabelCellLayoutProps): ReactElement {
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
