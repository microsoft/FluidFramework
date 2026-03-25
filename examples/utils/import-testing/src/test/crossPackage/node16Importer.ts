/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import-x/no-internal-modules */
import {
	AppState,
	Container,
	Dimensions,
	Position,
} from "@fluid-example/import-testing/crossPackageSchema/node16";
/*
Compile-time test for cross-package schema consumption where schemaDefinitions.d.ts
was generated under Node16 module resolution.

Each tree export tier has its own JS entrypoint, so TypeScript correctly
resolves import paths in .d.ts files. These imports should compile without error.
*/
import { TreeViewConfiguration } from "@fluidframework/tree";

/* eslint-enable import-x/no-internal-modules */

const _config = new TreeViewConfiguration({ schema: AppState });
const _container = new Container({
	id: "test",
	position: new Position({ x: 0, y: 0 }),
	dimensions: new Dimensions({ width: 100, height: 100 }),
});
