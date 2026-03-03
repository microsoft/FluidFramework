/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { createOdspMiddlewares } from "./odspMiddlewares.js";
export { createExampleDriverServiceWebpackPlugin } from "./webpackSpecifiedService.js";

export const exampleWebpackDefaults = {
	performance: { hints: false as const },
};
