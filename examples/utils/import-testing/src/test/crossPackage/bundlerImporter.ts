/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
Compile-time test for cross-package schema consumption via bundler resolution.

Currently a disabled test: @ts-expect-error documents known failures caused by a
TypeScript type resolution bug that ignores tree's exports type override and generates
invalid import paths. Bundler resolution (TS 5.6+) exacerbates the issue. Fixing tree's
exports (giving each tier its own JS entrypoint) will resolve these — at which point the
@ts-expect-error lines should be removed.
*/
import { TreeViewConfiguration } from "@fluidframework/tree";

/* eslint-disable import-x/no-internal-modules */
import {
	AppState,
	Container,
	Dimensions,
	Position,
} from "@fluid-example/import-testing/crossPackageSchema/bundler";
/* eslint-enable import-x/no-internal-modules */

// @ts-expect-error TS2322: typeof AppState not assignable to ImplicitFieldSchema
const _config = new TreeViewConfiguration({ schema: AppState });
// @ts-expect-error TS2554: Expected 0 arguments — constructor type info lost
const _container = new Container({
	id: "test",
	// @ts-expect-error TS2554: Expected 0 arguments
	position: new Position({ x: 0, y: 0 }),
	// @ts-expect-error TS2554: Expected 0 arguments
	dimensions: new Dimensions({ width: 100, height: 100 }),
});
