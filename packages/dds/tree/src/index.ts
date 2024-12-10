/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
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
