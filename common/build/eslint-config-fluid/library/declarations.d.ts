/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Type declarations for ESLint plugins that do not ship their own type definitions.
 */

/**
 * Type declaration for `eslint-plugin-no-only-tests`.
 */
declare module "eslint-plugin-no-only-tests" {
	import type { ESLint } from "eslint";
	const plugin: ESLint.Plugin;
	export default plugin;
}
