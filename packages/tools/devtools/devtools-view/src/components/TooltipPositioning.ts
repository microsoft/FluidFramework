/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PositioningShorthand } from "@fluentui/react-components";

/**
 * Positions the Status information popover below its trigger without falling back over the page heading.
 */
export const statusInfoTooltipPositioning = {
	position: "below",
	align: "start",
	fallbackPositions: ["after-top", "before-top"],
} as const satisfies PositioningShorthand;
