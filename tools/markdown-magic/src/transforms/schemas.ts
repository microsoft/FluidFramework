/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Controls whether a transform includes its section heading.
 */
export interface HeadingOptions {
	/**
	 * Whether generated content starts with a heading.
	 */
	includeHeading: boolean;

	/**
	 * The context heading level from which generated heading levels are derived.
	 *
	 * @defaultValue The heading level inferred from the generated region's position.
	 */
	headingLevel?: number;
}

/**
 * Defines the optional heading context for transforms that generate heading hierarchies.
 */
export const headingLevelSchema = {
	headingLevel: { type: "integer", minimum: 1, maximum: 6 },
} as const;

/**
 * Defines the package metadata path option shared by package transforms.
 */
export const packageSchema = {
	packageJsonPath: { type: "string", default: "./package.json" },
} as const;

/**
 * Defines the heading option shared by section transforms.
 */
export const headingSchema = {
	includeHeading: { type: "boolean", default: true },
	...headingLevelSchema,
} as const;
