/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
Compile-time test for cross-package schema consumption via bundler resolution.
*/
import { TreeViewConfiguration } from "@fluidframework/tree";

/* eslint-disable import-x/no-internal-modules */
import {
	AppState,
	Container,
	Dimensions,
	Position,
} from "@fluid-example/import-testing/crossPackageSchemaBundler";
/* eslint-enable import-x/no-internal-modules */

// @ts-expect-error: typeof AppState is not assignable to ImplicitFieldSchema due to normalized import paths
const _config = new TreeViewConfiguration({ schema: AppState });
// @ts-expect-error: constructor args not recognized due to normalized import paths
const _container = new Container({
	id: "test",
	// @ts-expect-error: constructor args not recognized due to normalized import paths
	position: new Position({ x: 0, y: 0 }),
	// @ts-expect-error: constructor args not recognized due to normalized import paths
	dimensions: new Dimensions({ width: 100, height: 100 }),
});
