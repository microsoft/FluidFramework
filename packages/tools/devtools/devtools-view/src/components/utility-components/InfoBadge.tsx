/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { Info16Regular } from "@fluentui/react-icons";
import { Badge, Tooltip } from "@fluentui/react-components";

/**
 * {@link InfoBadge} input props.
 */
export interface InfoBadgeProps {
	/**
	 * Content to display in the tooltip pop-over.
	 */
	tooltipContent: React.ReactElement | string;
}

/**
 * Displays an "info" icon badge, which displays a tooltip with the provided text when hovered over.
 */
export function InfoBadge(props: InfoBadgeProps): React.ReactElement {
	const { tooltipContent } = props;

	return (
		<Tooltip content={tooltipContent} relationship="label">
			<Badge shape="circular" appearance="ghost" icon={<Info16Regular />} />
		</Tooltip>
	);
}
