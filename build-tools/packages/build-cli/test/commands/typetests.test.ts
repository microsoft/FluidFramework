/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert, expect } from "chai";

import {
	TypeTestConfigActions,
	VersionOptions,
	previousVersion,
	updateTypeTestConfiguration,
} from "../../src/commands/typetests";
import { PackageJson } from "@fluidframework/build-tools";

/**
 * A minimal test package.json. It defines only the required fields according to the type definition.
 */
const packageMinimal: PackageJson = {
	name: "packageMinimal",
	version: "2.0.0-internal.5.4.3",
	scripts: {},
};

/**
 * A test package.json with an enabled typeValidation node.
 */
const packageWithTypeValidation: PackageJson = {
	name: "packageWithTypeValidation",
	version: "2.0.0-internal.5.4.3",
	scripts: {},
	typeValidation: {
		broken: {
			"broken-package": {
				backCompat: false,
				forwardCompat: false,
			},
		},
		disabled: false,
	},
};

/**
 * A test package.json with an disabled typeValidation node.
 */
const packageWithTypeValidationDisabled: PackageJson = {
	name: "packageWithTypeValidationDisabled",
	version: "2.0.0-internal.5.4.3",
	scripts: {},
	typeValidation: {
		broken: {
			"broken-package": {
				backCompat: false,
				forwardCompat: false,
			},
		},
		disabled: true,
	},
};

const options: TypeTestConfigActions = {
	version: VersionOptions.Previous,
	resetBroken: true,
};

const optionsMatrix: Map<string, TypeTestConfigActions> = new Map([
	[
		"previousAndResetTrue",
		{
			version: VersionOptions.Previous,
			resetBroken: true,
		},
	],
	[
		"previousAndResetFalse",
		{
			version: VersionOptions.Previous,
			resetBroken: false,
		},
	],
	[
		"clearAndResetTrue",
		{
			version: VersionOptions.Clear,
			resetBroken: true,
		},
	],
	[
		"clearAndResetFalse",
		{
			version: VersionOptions.Clear,
			resetBroken: false,
		},
	],
	[
		"clearIfDisabledAndResetTrue",
		{
			version: VersionOptions.ClearIfDisabled,
			resetBroken: true,
		},
	],
	[
		"clearIfDisabledAndResetFalse",
		{
			version: VersionOptions.ClearIfDisabled,
			resetBroken: false,
		},
	],
]);

describe("typetests tests", () => {
	const testPackages = [
		packageMinimal,
		packageWithTypeValidation,
		packageWithTypeValidationDisabled,
	];

	describe("updateTypeTestConfiguration", () => {
		// for (const [name, options] of optionsMatrix.entries()) {
		// }
			it(`${name}: packageMinimal`, () => {
				const pkg = packageMinimal;
				updateTypeTestConfiguration(pkg, options);
				expect(pkg.typeValidation).to.be.undefined;
				expect(pkg.typeValidation?.broken).to.be.undefined;
				expect(pkg.typeValidation?.disabled).to.be.undefined;
			});

			it(`${name}: packageWithTypeValidation`, () => {
				const pkg = packageWithTypeValidation;
				updateTypeTestConfiguration(pkg, {
					version: VersionOptions.Previous,
					resetBroken: true,
				});
				expect(pkg.typeValidation).not.to.be.undefined;
				expect(pkg.typeValidation?.broken).to.be.empty;
				expect(pkg.typeValidation?.disabled).to.be.false;
			});

			it(`${name}: packageWithTypeValidationDisabled`, () => {
				const pkg = packageWithTypeValidation;
				updateTypeTestConfiguration(pkg, {
					version: VersionOptions.Previous,
					resetBroken: true,
				});
				expect(pkg.typeValidation).not.to.be.undefined;
				expect(pkg.typeValidation?.broken).to.be.empty;
				expect(pkg.typeValidation?.disabled).to.be.false;
			});
	});

	describe("previousVersion", () => {
		const cases: [string, string][] = [
			["1.3.3", "1.3.2"],
			["2.0.0", "1.0.0"],
			["4.5.12", "4.5.11"],
			["2.0.0-internal.1.1.0", "2.0.0-internal.1.0.0"],
			["2.0.0-internal.2.0.0", "2.0.0-internal.1.0.0"],
			["2.0.0-internal.3.2.2", "2.0.0-internal.3.2.1"],

			// These cases meet spec, but show cases that you might not want to use "previousVersion".
			// Fortunately if this is not the desired behaviors, all of these result in packages that won't exist,
			// so install will fail (assuming this is used to select a version of a package to install) and the bad version can't be merged.
			["0.4.1000", "0.4.999"],
			["0.4.2000", "0.4.1999"],
			["0.59.3000", "0.59.2999"],
			["2.0.0-internal.1.0.0", "2.0.0-internal.0.0.0"],
		];
		for (const [input, expected] of cases) {
			it(input, () => {
				assert.equal(previousVersion(input), expected);
			});
		}
	});

	describe("previousVersion", () => {});
});
