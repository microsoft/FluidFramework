/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert, expect } from "chai";
import clonedeep from "lodash.clonedeep";

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
	name: "test-package",
	version: "2.0.0-internal.6.0.0",
	scripts: {},
};

/**
 * A test package.json with an enabled typeValidation node.
 */
const packageWithTypeValidation: PackageJson = {
	name: "test-package",
	version: "2.0.0-internal.6.0.0",
	scripts: {},
	devDependencies: {
		"test-package-previous": "npm:test-package@2.0.0-internal.4.0.0",
	},
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
	name: "test-package",
	version: "2.0.0-internal.6.0.0",
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
	describe("updateTypeTestConfiguration", () => {
		const testPackages = [
			packageMinimal,
			packageWithTypeValidation,
			packageWithTypeValidationDisabled,
		];

		describe("previousAndResetTrue", () => {
			const name = "previousAndResetTrue";
			const options = optionsMatrix.get(name)!;
			it(`packageMinimal`, () => {
				const pkg = clonedeep(packageMinimal);
				updateTypeTestConfiguration(pkg, options);
				expect(pkg.typeValidation).to.be.undefined;
				expect(pkg.typeValidation?.broken).to.be.undefined;
				expect(pkg.typeValidation?.disabled).to.be.undefined;
				expect(pkg.devDependencies?.["test-package-previous"]).to.exist;
				expect(pkg.devDependencies?.["test-package-previous"]).to.equal(
					"npm:test-package@2.0.0-internal.5.0.0",
				);
			});

			it(`packageWithTypeValidation`, () => {
				const pkg = clonedeep(packageWithTypeValidation);
				updateTypeTestConfiguration(pkg, options);
				expect(pkg.typeValidation).not.to.be.undefined;
				expect(pkg.typeValidation?.broken).to.be.empty;
				expect(pkg.typeValidation?.disabled).to.be.false;
				expect(pkg.devDependencies?.["test-package-previous"]).to.exist;
				expect(pkg.devDependencies?.["test-package-previous"]).to.equal(
					"npm:test-package@2.0.0-internal.5.0.0",
				);
			});

			it(`packageWithTypeValidationDisabled`, () => {
				const pkg = clonedeep(packageWithTypeValidationDisabled);
				updateTypeTestConfiguration(pkg, options);
				expect(pkg.typeValidation).not.to.be.undefined;
				expect(pkg.typeValidation?.broken).to.be.empty;
				expect(pkg.typeValidation?.disabled).to.be.true;
				expect(pkg.devDependencies?.["test-package-previous"]).not.to.exist;
			});
		});

		describe("previousAndResetFalse", () => {
			const name = "previousAndResetFalse";
			const options = optionsMatrix.get(name)!;
			it(`packageMinimal`, () => {
				const pkg = clonedeep(packageMinimal);
				updateTypeTestConfiguration(pkg, options);

				expect(pkg.typeValidation).to.be.undefined;
				expect(pkg.typeValidation?.broken).to.be.undefined;
				expect(pkg.typeValidation?.disabled).to.be.undefined;
				expect(pkg.devDependencies?.["test-package-previous"]).to.exist;
				expect(pkg.devDependencies?.["test-package-previous"]).to.equal(
					"npm:test-package@2.0.0-internal.5.0.0",
				);
			});

			it(`packageWithTypeValidation`, () => {
				const pkg = clonedeep(packageWithTypeValidation);
				updateTypeTestConfiguration(pkg, options);
				expect(pkg.typeValidation).not.to.be.undefined;
				expect(pkg.typeValidation?.broken).not.to.be.empty;
				expect(pkg.typeValidation?.disabled).to.be.false;
				expect(pkg.devDependencies?.["test-package-previous"]).to.exist;
				expect(pkg.devDependencies?.["test-package-previous"]).to.equal(
					"npm:test-package@2.0.0-internal.5.0.0",
				);
			});

			it(`packageWithTypeValidationDisabled`, () => {
				const pkg = clonedeep(packageWithTypeValidationDisabled);
				updateTypeTestConfiguration(pkg, options);
				expect(pkg.typeValidation).not.to.be.undefined;
				expect(pkg.typeValidation?.broken).to.exist;
				expect(pkg.typeValidation?.broken["broken-package"]).to.exist;
				expect(pkg.typeValidation?.disabled).to.be.true;
				expect(pkg.devDependencies?.["test-package-previous"]).not.to.exist;
			});
		});

		describe("clearAndResetTrue", () => {
			const name = "clearAndResetTrue";
			const options = optionsMatrix.get(name)!;
			it(`packageMinimal`, () => {
				const pkg = clonedeep(packageMinimal);
				updateTypeTestConfiguration(pkg, options);
				expect(pkg.typeValidation).to.be.undefined;
				expect(pkg.typeValidation?.broken).to.be.undefined;
				expect(pkg.typeValidation?.disabled).to.be.undefined;
				expect(pkg.devDependencies?.["test-package-previous"]).not.to.exist;
			});

			it(`packageWithTypeValidation`, () => {
				const pkg = clonedeep(packageWithTypeValidation);
				updateTypeTestConfiguration(pkg, options);
				expect(pkg.typeValidation).not.to.be.undefined;
				expect(pkg.typeValidation?.broken).to.be.empty;
				expect(pkg.typeValidation?.disabled).to.be.false;
				expect(pkg.devDependencies?.["test-package-previous"]).not.to.exist;
			});

			it(`packageWithTypeValidationDisabled`, () => {
				const pkg = clonedeep(packageWithTypeValidationDisabled);
				updateTypeTestConfiguration(pkg, options);
				expect(pkg.typeValidation).not.to.be.undefined;
				expect(pkg.typeValidation?.broken).to.be.empty;
				expect(pkg.typeValidation?.disabled).to.be.true;
				expect(pkg.devDependencies?.["test-package-previous"]).not.to.exist;
			});
		});

		describe("clearAndResetFalse", () => {
			const name = "clearAndResetFalse";
			const options = optionsMatrix.get(name)!;
			it(`packageMinimal`, () => {
				const pkg = clonedeep(packageMinimal);
				updateTypeTestConfiguration(pkg, options);
				expect(pkg.typeValidation).to.be.undefined;
				expect(pkg.typeValidation?.broken).to.be.undefined;
				expect(pkg.typeValidation?.disabled).to.be.undefined;
				expect(pkg.devDependencies?.["test-package-previous"]).not.to.exist;
			});

			it(`packageWithTypeValidation`, () => {
				const pkg = clonedeep(packageWithTypeValidation);
				updateTypeTestConfiguration(pkg, options);
				expect(pkg.typeValidation).not.to.be.undefined;
				expect(pkg.typeValidation?.broken).to.exist;
				expect(pkg.typeValidation?.broken["broken-package"]).to.exist;
				expect(pkg.typeValidation?.disabled).to.be.false;
				expect(pkg.devDependencies).to.exist;
				expect(pkg.devDependencies?.["test-package-previous"]).not.to.exist;
			});

			it(`packageWithTypeValidationDisabled`, () => {
				const pkg = clonedeep(packageWithTypeValidationDisabled);
				updateTypeTestConfiguration(pkg, options);
				expect(pkg.typeValidation).not.to.be.undefined;
				expect(pkg.typeValidation?.broken).to.exist;
				expect(pkg.typeValidation?.broken["broken-package"]).to.exist;
				expect(pkg.typeValidation?.disabled).to.be.true;
				expect(pkg.devDependencies?.["test-package-previous"]).not.to.exist;
			});
		});

		describe("clearIfDisabledAndResetTrue", () => {
			const name = "clearIfDisabledAndResetTrue";
			const options = optionsMatrix.get(name)!;
			it(`packageMinimal`, () => {
				const pkg = clonedeep(packageMinimal);
				updateTypeTestConfiguration(pkg, options);
				expect(pkg.typeValidation).to.be.undefined;
				expect(pkg.typeValidation?.broken).to.be.undefined;
				expect(pkg.typeValidation?.disabled).to.be.undefined;
				expect(pkg.devDependencies?.["test-package-previous"]).not.to.exist;
			});

			it(`packageWithTypeValidation`, () => {
				const pkg = clonedeep(packageWithTypeValidation);
				updateTypeTestConfiguration(pkg, options);
				expect(pkg.typeValidation).not.to.be.undefined;
				expect(pkg.typeValidation?.broken).to.be.empty;
				expect(pkg.typeValidation?.disabled).to.be.false;
				expect(pkg.devDependencies).to.exist;
				expect(pkg.devDependencies?.["test-package-previous"]).to.equal(
					"npm:test-package@2.0.0-internal.4.0.0",
				);
			});

			it(`packageWithTypeValidationDisabled`, () => {
				const pkg = clonedeep(packageWithTypeValidationDisabled);
				updateTypeTestConfiguration(pkg, options);
				expect(pkg.typeValidation).not.to.be.undefined;
				expect(pkg.typeValidation?.broken).to.be.empty;
				expect(pkg.typeValidation?.disabled).to.be.true;
				expect(pkg.devDependencies?.["test-package-previous"]).not.to.exist;
			});
		});

		describe("clearIfDisabledAndResetFalse", () => {
			const name = "clearIfDisabledAndResetFalse";
			const options = optionsMatrix.get(name)!;
			it(`packageMinimal`, () => {
				const pkg = clonedeep(packageMinimal);
				updateTypeTestConfiguration(pkg, options);
				expect(pkg.typeValidation).to.be.undefined;
				expect(pkg.typeValidation?.broken).to.be.undefined;
				expect(pkg.typeValidation?.disabled).to.be.undefined;
				expect(pkg.devDependencies?.["test-package-previous"]).not.to.exist;
			});

			it(`packageWithTypeValidation`, () => {
				const pkg = clonedeep(packageWithTypeValidation);
				updateTypeTestConfiguration(pkg, options);
				expect(pkg.typeValidation).not.to.be.undefined;
				expect(pkg.typeValidation?.broken).to.exist;
				expect(pkg.typeValidation?.broken["broken-package"]).to.exist;
				expect(pkg.typeValidation?.disabled).to.be.false;
				expect(pkg.devDependencies?.["test-package-previous"]).to.exist;
				expect(pkg.devDependencies?.["test-package-previous"]).to.equal(
					"npm:test-package@2.0.0-internal.4.0.0",
				);
			});

			it(`packageWithTypeValidationDisabled`, () => {
				const pkg = clonedeep(packageWithTypeValidationDisabled);
				updateTypeTestConfiguration(pkg, options);
				expect(pkg.typeValidation).not.to.be.undefined;
				expect(pkg.typeValidation?.broken).to.exist;
				expect(pkg.typeValidation?.broken["broken-package"]).to.exist;
				expect(pkg.typeValidation?.disabled).to.be.true;
				expect(pkg.devDependencies?.["test-package-previous"]).not.to.exist;
			});
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
});
