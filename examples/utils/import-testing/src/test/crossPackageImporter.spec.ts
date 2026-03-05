/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeViewConfiguration } from "@fluidframework/tree";

import {
	AppState,
	Container,
	Dimensions,
	Position,
} from "../../lib-crosspackage/crossPackageSchemaExports.js";

/**
 * This test validates that objectAlpha/mapAlpha/optional schemas can be consumed
 * via .d.ts files produced in isolation (separate tsconfig compilation).
 *
 * The source is compiled by tsconfig.crossPackage.json into lib-crosspackage/,
 * and this test imports from those .d.ts files — not from the source directly.
 */
describe("cross-package schema consumption", () => {
	it("can consume objectAlpha/mapAlpha/optional schemas from .d.ts", () => {
		const _config = new TreeViewConfiguration({ schema: AppState });
		const _container = new Container({
			id: "test",
			position: new Position({ x: 0, y: 0 }),
			dimensions: new Dimensions({ width: 100, height: 100 }),
		});
	});
});
