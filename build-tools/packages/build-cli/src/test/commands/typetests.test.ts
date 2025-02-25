/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, expect } from "chai";
import { describe, it } from "mocha";

import {
	VersionOptions,
	previousVersion,
	resetBrokenTests,
	updateTypeTestDependency,
} from "../../commands/typetests.js";
import {
	type ITypeValidationConfig,
	type PackageWithTypeTestSettings,
	defaultTypeValidationConfig,
} from "../../typeValidator/typeValidatorConfig.js";

/**
 * A minimal test package.json. It defines only the required fields according to the type definition.
 */
function packageMinimal(): PackageWithTypeTestSettings {
	return {
		name: "test-package",
		version: "6.0.0",
		scripts: {},
	};
}

/**
 * A test package.json with a typeValidation node.
 *
 * @param enabled - Set this to false to return a package with disabled type tests.
 */
function packageWithTypeValidation(enabled = true): PackageWithTypeTestSettings {
	return {
		...packageMinimal(),
		devDependencies: {
			"test-package-previous": "4.0.0",
		},
		typeValidation: {
			entrypoint: "legacy",
			broken: {
				"broken-api": {
					backCompat: false,
					forwardCompat: false,
				},
			},
			disabled: !enabled,
		},
	};
}

describe("typetests tests", () => {
	describe("updateTypeTestDependency", () => {
		it("does not remove unrelated dependencies", () => {
			const pkg: PackageWithTypeTestSettings = {
				...packageMinimal(),
				devDependencies: {
					"test-package-previous": "4.0.0",
					"other-dependency": "^1.0.0",
				},
			};
			updateTypeTestDependency(pkg, VersionOptions.Clear);
			expect(pkg.devDependencies).to.deep.equal({
				"other-dependency": "^1.0.0",
			});
		});

		describe("VersionOptions.Clear", () => {
			it("removes previous test package dependency", () => {
				const pkg = packageWithTypeValidation();
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				expect(pkg.devDependencies?.["test-package-previous"]).to.exist;
				updateTypeTestDependency(pkg, VersionOptions.Clear);
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				expect(pkg.devDependencies?.["test-package-previous"]).to.not.exist;
			});

			it("removes previous test package dependency when type tests are disabled", () => {
				const pkg = packageWithTypeValidation(/* enabled */ false);
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				expect(pkg.devDependencies?.["test-package-previous"]).to.exist;
				updateTypeTestDependency(pkg, VersionOptions.Clear);
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				expect(pkg.devDependencies?.["test-package-previous"]).to.not.exist;
			});
		});

		describe("VersionOptions.ClearIfDisabled", () => {
			it("leaves previous test package dependency when type tests are enabled", () => {
				const pkg = packageWithTypeValidation();
				const expected = packageWithTypeValidation();
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				expect(pkg.typeValidation?.disabled).is.false;
				updateTypeTestDependency(pkg, VersionOptions.ClearIfDisabled);
				expect(pkg).to.deep.equal(expected);
			});

			it("removes previous test package dependency when type tests are disabled", () => {
				const pkg = packageWithTypeValidation(/* enabled */ false);
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				expect(pkg.devDependencies?.["test-package-previous"]).to.exist;
				updateTypeTestDependency(pkg, VersionOptions.ClearIfDisabled);
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				expect(pkg.devDependencies?.["test-package-previous"]).to.not.exist;
			});
		});

		describe("VersionOptions.Previous", () => {
			it("sets previous version", () => {
				const pkg = packageWithTypeValidation();
				updateTypeTestDependency(pkg, VersionOptions.Previous);
				expect(pkg.devDependencies?.["test-package-previous"]).to.equal(
					"npm:test-package@5.0.0",
				);
			});

			it("sets previous version even without typeValidation node", () => {
				const pkg = packageMinimal();
				updateTypeTestDependency(pkg, VersionOptions.Previous);
				expect(pkg.devDependencies?.["test-package-previous"]).to.equal(
					"npm:test-package@5.0.0",
				);
			});

			it("removes previous test package dependency when type tests are disabled", () => {
				const pkg = packageWithTypeValidation(/* enabled */ false);
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				expect(pkg.devDependencies?.["test-package-previous"]).to.exist;
				updateTypeTestDependency(pkg, VersionOptions.Previous);
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				expect(pkg.devDependencies?.["test-package-previous"]).to.not.exist;
			});
		});
	});

	describe("resetBrokenTests", () => {
		it("empty", () => {
			const pkgJson: { typeValidation?: ITypeValidationConfig } = {
				typeValidation: defaultTypeValidationConfig,
			};
			resetBrokenTests(pkgJson);
			assert.deepEqual(pkgJson.typeValidation?.broken, {});
		});

		it("minimal", () => {
			const pkgJson: { typeValidation?: ITypeValidationConfig } = {
				typeValidation: {
					entrypoint: "legacy",
					broken: {
						"broken-api": {
							backCompat: false,
							forwardCompat: false,
						},
					},
				},
			};
			resetBrokenTests(pkgJson);
			assert.deepEqual(pkgJson, { typeValidation: { broken: {}, entrypoint: "legacy" } });
		});

		it("ignores packages with no typeValidation node", () => {
			const pkg = packageMinimal();
			const expected = packageMinimal();

			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			expect(pkg.typeValidation).to.not.exist;
			resetBrokenTests(pkg);
			expect(pkg).to.deep.equal(expected);
		});

		it("resets package with type tests", () => {
			const pkg = packageWithTypeValidation();
			resetBrokenTests(pkg);
			expect(pkg.typeValidation?.broken).to.deep.equal({});
		});

		it("resets even if type validation is disabled", () => {
			const pkg = packageWithTypeValidation(/* enabled */ false);
			resetBrokenTests(pkg);
			expect(pkg.typeValidation?.broken).to.deep.equal({});
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
