/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
Compile-time only test — if this file compiles, the test passes.

This tests the TS 5.9 bundler-mode import path normalization bug:
When tree's export tiers all point to the same JS module (lib/index.js),
TS 5.9's bundler emitter normalizes import("@fluidframework/tree/alpha")
to import("@fluidframework/tree") in the provider's .d.ts output.
Since ObjectNodeSchema is alpha-only and not in the public tier,
the consumer can't resolve it, causing:
TS2322: Type 'typeof AppState' is not assignable to type 'ImplicitFieldSchema'.

The provider's .d.ts is built by tsconfig.crossPackage.bundler.json using
TS 5.9 + moduleResolution: "bundler" to trigger the normalization.
This file consumes those .d.ts files and verifies the types still work.
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

const _config = new TreeViewConfiguration({ schema: AppState });
const _container = new Container({
	id: "test",
	position: new Position({ x: 0, y: 0 }),
	dimensions: new Dimensions({ width: 100, height: 100 }),
});
