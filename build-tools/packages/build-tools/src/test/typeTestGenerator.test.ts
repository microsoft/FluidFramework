import { strict as assert } from "assert";
import * as utils from "../type-test-generator/typeTestUtils";
import { readJsonSync } from "fs-extra";
import * as path from "path";
import { PackageJson } from "../common/npmPackage";

describe("typeTestUtils", () => {
	describe("ensureDevDependencyExists", () => {
		it("Should not throw an error if dev dependency exists", () => {
			const packageJsonPath = path.join(__dirname, "mockPackage.json");
			const packageObject: PackageJson = readJsonSync(packageJsonPath);
			const previousPackageName = `${packageObject.name}-previous`;
			utils.ensureDevDependencyExists(packageObject, previousPackageName);
		});

		it("Should throw an error if dev dependency does not exist", () => {
			const packageJsonPath = path.join(__dirname, "mockPackage.json");
			const packageObject: PackageJson = readJsonSync(packageJsonPath);
			const previousPackageName = `${packageObject.name}-does-not-exist`;
			assert.throws(() => {
				utils.ensureDevDependencyExists(packageObject, previousPackageName);
			});
		});
	});
});
