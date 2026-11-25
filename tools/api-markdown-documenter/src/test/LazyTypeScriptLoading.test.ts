/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { ApiModel } from "@microsoft/api-extractor-model";
import { expect } from "chai";

import { transformApiModel } from "../index.js";

import {
	createInterface,
	createPackage,
	createProperty,
	createReferenceToken,
} from "./index.js";

/**
 * Checks when the documenter loads TypeScript while processing a generic base type.
 *
 * @remarks
 * This is a module-loading test, not a startup benchmark: it checks the module cache rather than relying on timing.
 */
function checkCompilerLoading(): void {
	const require = createRequire(import.meta.url);

	// The static import of the documenter has already run. Resolve TypeScript's filename without
	// requiring it so the probe can detect an eager import without causing one itself.
	const compilerPath = require.resolve("typescript");
	expect(require.cache[compilerPath], "after package import").to.be.undefined;

	const box = createInterface("Box", {
		typeParameters: { T: undefined },
		members: [createProperty("value", { type: "T" })],
	});
	const strings = createInterface("Strings", {
		bases: [[createReferenceToken("Box", "test-api!Box:interface"), "<string>"]],
	});
	const apiModel = new ApiModel();
	apiModel.addMember(createPackage("test-api", box, strings));

	// Both calls see `Strings extends Box<string>`. Its presence alone must not load TypeScript;
	// opting in asks the documenter to specialize the inherited `value: T` as `value: string`.
	transformApiModel({ apiModel });
	expect(require.cache[compilerPath], "after default transform").to.be.undefined;

	transformApiModel({ apiModel, includeInheritedMembers: true });
	expect(require.cache[compilerPath], "after opt-in generic transform").not.to.be.undefined;
}

// Mocha imports this module to register the test. The child runs the same file as its entry point
// so earlier tests cannot affect its module cache and a failed assertion exits the child with an error.
if (import.meta.main) {
	checkCompilerLoading();
} else {
	describe("TypeScript runtime loading", () => {
		it("loads the compiler only when a transform inspects inherited types", async () => {
			await promisify(execFile)(process.execPath, [fileURLToPath(import.meta.url)]);
		});
	});
}
