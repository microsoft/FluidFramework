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
}

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
} as const;
