/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
Compile-time only test — if this file compiles, the test passes. Not a .spec.ts, not run by mocha.
The schemas in crossPackageSchemaExports.ts are compiled by a separate tsconfig (tsconfig.crossPackage.json).
*/
import { TreeViewConfiguration } from "@fluidframework/tree";

/* eslint-disable import-x/no-internal-modules */
import {
	AppState,
	Container,
	Dimensions,
	Position,
} from "@fluid-example/import-testing/crossPackageSchema";
/* eslint-enable import-x/no-internal-modules */

const _config = new TreeViewConfiguration({ schema: AppState });
const _container = new Container({
	id: "test",
	position: new Position({ x: 0, y: 0 }),
	dimensions: new Dimensions({ width: 100, height: 100 }),
});
