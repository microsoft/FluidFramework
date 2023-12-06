/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	Package,
	// TaskConfig,
	// TaskDependencies,
	updatePackageJsonFile,
} from "@fluidframework/build-tools";

import { PackageCommand } from "../../BasePackageCommand";

export default class GeneratePackageTypes extends PackageCommand<typeof GeneratePackageTypes> {
	static readonly description = ``;
	protected async processPackage(pkg: Package): Promise<void> {
		updatePackageJsonFile(pkg.directory, (packageJson) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
			if ((packageJson.exports as any)?.["."]?.import?.types !== undefined) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
				(packageJson.exports as any)["."].import.types = "./lib/index.d.mts";
			}

			if (packageJson.scripts.api !== undefined) {
				packageJson.scripts[
					"api-extractor:rename-types"
				] = `renamer lib/** -f ".d.ts" -r ".d.mts" --force`;
				packageJson.scripts[
					"api-extractor:rewrite-type-imports"
				] = `replace-in-file '/from "\\.((.*?)(\\.mjs)?)";/g' 'from ".$2.mjs";' "lib/**/*.d.mts" --isRegex`;
			}

			packageJson.scripts["check:are-the-types-wrong"] = "attw --pack";

			if (packageJson.devDependencies !== undefined) {
				packageJson.devDependencies["@arethetypeswrong/cli"] = "^0.13.3";

				if (packageJson.scripts.api !== undefined) {
					packageJson.devDependencies.renamer = "^4.0.0";
					packageJson.devDependencies["replace-in-file"] = "^6.3.5";
				}
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const config: any | undefined = packageJson.fluidBuild?.tasks?.["build:docs"];

			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			if (config?.dependsOn !== undefined) {
				// (packageJson as any).fluidBuild.tasks["build:docs"].dependsOn = [
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
				config.dependsOn = [
					"...",
					"api-extractor:commonjs",
					"api-extractor:esnext",
					"api-extractor:rename-types",
					"api-extractor:rewrite-type-imports",
				];
			}
		});
	}
}
