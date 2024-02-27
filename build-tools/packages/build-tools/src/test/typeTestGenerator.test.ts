import { strict as assert } from "assert";
import * as utils from "../type-test-generator/typeTestUtils";
import { readJsonSync } from "fs-extra";
import * as path from "path";
import { PackageJson } from "../common/npmPackage";

describe("typeTestUtils", () => {
	describe("ensureDevDependencyExists", () => {
		const packageJsonPath = path.join(__dirname, "mockPackage.json");
		const packageObject: PackageJson = readJsonSync(packageJsonPath);
		it("Should not throw an error if dev dependency exists", () => {
			const previousPackageName = `${packageObject.name}-previous`;
			utils.ensureDevDependencyExists(packageObject, previousPackageName);
		});

		it("Should throw an error if dev dependency does not exist", () => {
			const previousPackageName = `${packageObject.name}-does-not-exist`;
			assert.throws(() => {
				utils.ensureDevDependencyExists(packageObject, previousPackageName);
			});
		});
	});

	describe("getPreviousPackageJsonPath", () => {
		it("Should throw an error", () => {
			const packageJsonPath = path.join(__dirname, "mockPackage.json");
			const packageObject: PackageJson = readJsonSync(packageJsonPath);
			const previousPackageName = `${packageObject.name}-previous`;
			const previousBasePath = path.join("node_modules", previousPackageName);
			assert.throws(() => {
				utils.getPreviousPackageJsonPath(previousBasePath);
			});
		});
	});
});
