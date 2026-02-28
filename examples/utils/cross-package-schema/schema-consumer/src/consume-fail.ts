/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Failing } from "@fluid-example/cross-package-schema-provider";
import { TreeViewConfiguration } from "@fluidframework/tree";

/**
 * This file demonstrates the FAILING import path. It imports from Failing
 * module that has an invalid \@fluidframework/tree import in .d.ts file.
 */
export const appConfig = new TreeViewConfiguration({
	// @ts-expect-error - Type 'typeof AppState' is not assignable to type 'ImplicitFieldSchema'.
	schema: Failing.AppState,
});
