/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @internal
 */
export type ExampleDriverService = "odsp" | "t9s" | "local";

export const isExampleDriverService = (value: unknown): value is ExampleDriverService =>
	typeof value === "string" && ["odsp", "t9s", "local"].includes(value);
