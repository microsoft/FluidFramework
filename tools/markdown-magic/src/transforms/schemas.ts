/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface HeadingOptions {
	includeHeading: boolean;
}

export const packageSchema = {
	packageJsonPath: { type: "string", default: "./package.json" },
} as const;

export const headingSchema = {
	includeHeading: { type: "boolean", default: true },
} as const;
