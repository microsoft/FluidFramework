import * as utils from "../type-test-generator/typeTestUtils";
import { readJsonSync } from "fs-extra";
import { PackageJson } from "../common/npmPackage";

describe("typeTestUtils", () => {
	describe("ensureDevDependencyExists", () => {
		it.only("Should not throw an error if dev dependency exists", () => {
			const packageObject: PackageJson = readJsonSync("mockPackage.json");
			const previousPackageName = `${packageObject.name}-previous`;
			utils.ensureDevDependencyExists(packageObject, previousPackageName);
		});
	});
});
