/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert, expect } from "chai";
import { PackageJson } from "@fluidframework/build-tools";

import {
	VersionOptions,
	applyTypeTestVersionOptions,
	previousVersion,
	resetBrokenTests,
} from "../../src/commands/typetests";

/**
 * A minimal test package.json. It defines only the required fields according to the type definition.
 */
function packageMinimal(): PackageJson {
	return {
		name: "test-package",
		version: "2.0.0-internal.6.0.0",
		scripts: {},
	};
}

/**
 * A test package.json with an enabled typeValidation node.
 */
function packageWithTypeValidation(): PackageJson {
	return {
		...packageMinimal(),
		devDependencies: {
			"test-package-previous": "npm:test-package@2.0.0-internal.4.0.0",
			"another-dependency": "^1.0.0",
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
}

/**
 * A test package.json with a disabled typeValidation node.
 */
function packageWithTypeValidationDisabled(): PackageJson {
	return {
		...packageMinimal(),
		devDependencies: {
			"test-package-previous": "npm:test-package@2.0.0-internal.4.0.0",
			"another-dependency": "^1.0.0",
		},
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
}

describe("typetests tests", () => {
	describe("applyTypeTestVersionOptions", () => {
		describe("VersionOptions.Clear", () => {
			it("removes previous test package dependency", () => {
				const pkg = packageWithTypeValidation();
				applyTypeTestVersionOptions(pkg, VersionOptions.Clear);
				expect(pkg.devDependencies?.["test-package-previous"]).not.to.exist;
			});

			it("removes previous test package dependency when type tests are disabled", () => {
				const pkg = packageWithTypeValidationDisabled();
				applyTypeTestVersionOptions(pkg, VersionOptions.Clear);
				expect(pkg.devDependencies?.["test-package-previous"]).not.to.exist;
			});
		});

		describe("VersionOptions.ClearIfDisabled", () => {
			it("leaves dependency when type tests are not disabled", () => {
				const pkg = packageWithTypeValidation();
				applyTypeTestVersionOptions(pkg, VersionOptions.ClearIfDisabled);
				expect(pkg.devDependencies?.["test-package-previous"]).to.equal(
					"npm:test-package@2.0.0-internal.4.0.0",
				);
			});

			it("removes previous test package dependency when type tests are disabled", () => {
				const pkg = packageWithTypeValidationDisabled();
				applyTypeTestVersionOptions(pkg, VersionOptions.ClearIfDisabled);
				expect(pkg.devDependencies?.["test-package-previous"]).not.to.exist;
			});
		});

		describe("VersionOptions.Previous", () => {
			it("sets previous version", () => {
				const pkg = packageWithTypeValidation();
				applyTypeTestVersionOptions(pkg, VersionOptions.Previous);
				expect(pkg.devDependencies?.["test-package-previous"]).to.equal(
					"npm:test-package@2.0.0-internal.5.0.0",
				);
			});

			it("sets previous version even without typeValidation node", () => {
				const pkg = packageMinimal();
				applyTypeTestVersionOptions(pkg, VersionOptions.Previous);
				expect(pkg.devDependencies?.["test-package-previous"]).to.equal(
					"npm:test-package@2.0.0-internal.5.0.0",
				);
			});

			it("removes previous test package dependency when type tests are disabled", () => {
				const pkg = packageWithTypeValidationDisabled();
				applyTypeTestVersionOptions(pkg, VersionOptions.Previous);
				expect(pkg.devDependencies?.["test-package-previous"]).not.to.exist;
			});
		});
	});

	describe("resetBrokenTests", () => {
		it(`ignores packages with no typeValidation node`, () => {
			const pkg = packageMinimal();
			resetBrokenTests(pkg, true);
			expect(pkg.typeValidation).to.not.exist;
		});

		it(`resets package with type tests`, () => {
			const pkg = packageWithTypeValidation();
			resetBrokenTests(pkg, true);
			expect(pkg.typeValidation?.broken).to.be.empty;
		});

		it(`resets even if type validation is disabled`, () => {
			const pkg = packageWithTypeValidationDisabled();
			resetBrokenTests(pkg, true);
			expect(pkg.typeValidation?.broken).to.be.empty;
		});

		it(`no effect when reset=false`, () => {
			const pkg = packageWithTypeValidation();
			resetBrokenTests(pkg, false);
			assert.deepEqual(pkg.typeValidation, {
				broken: {
					"broken-package": {
						backCompat: false,
						forwardCompat: false,
					},
				},
				disabled: false,
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
