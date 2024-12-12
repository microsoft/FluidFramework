/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Note: This file includes APIs from `indexCommonApi.ts` along with legacy-alpha and deprecated APIs.
 *
 * Consider adding only legacy-alpha or deprecated APIs that should be exported from `@fluidframework/tree` but not from `fluid-framework`.
 *
 * For APIs meant be to exported from `fluid-framework`, consider adding them to `indexCommonApi.ts`.
 */

// eslint-disable-next-line no-restricted-syntax
export * from "./indexCommonApi.js";

export {
	SharedTree,
	configuredSharedTree,
} from "./treeFactory.js";

export type {
	/**
	 * @deprecated Deprecated in `@fluidframework/tree`. Consider importing from `fluid-framework` or `@fluidframework/core-interfaces` instead.
	 */
	Listeners,
	/**
	 * @deprecated Deprecated in `@fluidframework/tree`. Consider importing from `fluid-framework` or `@fluidframework/core-interfaces` instead.
	 */
	IsListener,
	/**
	 * @deprecated Deprecated in `@fluidframework/tree`. Consider importing from `fluid-framework` or `@fluidframework/core-interfaces` instead.
	 */
	Listenable,
	/**
	 * @deprecated Deprecated in `@fluidframework/tree`. Consider importing from `fluid-framework` or `@fluidframework/core-interfaces` instead.
	 */
	Off,
} from "@fluidframework/core-interfaces";
