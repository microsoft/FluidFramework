/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Too restrictive for test suite hierarchy
/* eslint-disable max-nested-callbacks */

import { expect } from "chai";
import { describe, it } from "mocha";
import {
	createNode10EntrypointFileContent,
	optionDefaults,
	readArgValues,
} from "../../../library/commands/generateEntrypoints.js";

describe("generateEntrypoints", () => {
	it("readArgValues", () => {
		expect(readArgValues("", optionDefaults)).to.deep.equal(optionDefaults);

		expect(
			readArgValues("--outFileLegacyBeta legacy --outDir ./dist", optionDefaults),
		).to.deep.equal({
			...optionDefaults,
			outDir: "./dist",
			outFileLegacyBeta: "legacy",
		});

		expect(readArgValues("--outDir ./lib", optionDefaults)).to.deep.equal({
			...optionDefaults,
			outDir: "./lib",
		});
	});

	describe("generateNode10EntrypointFileContent", () => {
		describe("type-only", () => {
			it("dirPath: package root", () => {
				expect(
					createNode10EntrypointFileContent({
						dirPath: "",
						sourceTypeRelPath: "./lib/legacy.d.ts",
						isTypeOnly: true,
					}),
				).to.contain('export type * from "./lib/legacy.d.ts";\n');
			});

			it("dirPath: sub directory", () => {
				expect(
					createNode10EntrypointFileContent({
						dirPath: "rollups",
						sourceTypeRelPath: "./lib/legacy.d.ts",
						isTypeOnly: true,
					}),
				).to.contain('export type * from "../lib/legacy.d.ts";\n');
			});

			it("sourceTypeRelPath: nested", () => {
				expect(
					createNode10EntrypointFileContent({
						dirPath: "",
						sourceTypeRelPath: "./lib/legacy/alpha.d.ts",
						isTypeOnly: true,
					}),
				).to.contain('export type * from "./lib/legacy/alpha.d.ts";\n');
			});

			it("sourceTypeRelPath: file with leading .", () => {
				expect(
					createNode10EntrypointFileContent({
						dirPath: "",
						sourceTypeRelPath: ".foo.d.ts",
						isTypeOnly: true,
					}),
				).to.contain('export type * from "./.foo.d.ts";\n');
			});
		});

		describe("non-type-only", () => {
			it("dirPath: package root", () => {
				expect(
					createNode10EntrypointFileContent({
						dirPath: "",
						sourceTypeRelPath: "./lib/legacy.d.ts",
						isTypeOnly: false,
					}),
				).to.contain('export * from "./lib/legacy.js";\n');
			});

			it("dirPath: sub directory", () => {
				expect(
					createNode10EntrypointFileContent({
						dirPath: "rollups",
						sourceTypeRelPath: "./lib/legacy.d.ts",
						isTypeOnly: false,
					}),
				).to.contain('export * from "../lib/legacy.js";\n');
			});

			it("sourceTypeRelPath: nested", () => {
				expect(
					createNode10EntrypointFileContent({
						dirPath: "",
						sourceTypeRelPath: "./lib/legacy/alpha.d.ts",
						isTypeOnly: false,
					}),
				).to.contain('export * from "./lib/legacy/alpha.js";\n');
			});

			it("sourceTypeRelPath: file with leading .", () => {
				expect(
					createNode10EntrypointFileContent({
						dirPath: "",
						sourceTypeRelPath: ".foo.d.ts",
						isTypeOnly: false,
					}),
				).to.contain('export * from "./.foo.js";\n');
			});
		});
	});
});
