/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Package, PackageJson, updatePackageJsonFile } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import * as JSON5 from "json5";
import path from "node:path";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import type { TsConfigJson } from "type-fest";

import { PackageCommand } from "../../BasePackageCommand";

export default class UpdateProjectCommand extends PackageCommand<typeof UpdateProjectCommand> {
	static readonly description = `Updates a project.`;

	static readonly flags = {
		// apiTrimming: Flags.boolean({
		// 	description: "Enable API trimming in the package.",
		// }),
		newTsconfigs: Flags.boolean({
			description: "Enable new tsconfigs in the package.",
		}),
		ts2esm: Flags.boolean({
			description: "Enable ts2esm in the package.",
		}),
		tscMulti: Flags.boolean({
			description: "Enable tsc-multi in the package.",
		}),
		renameTypes: Flags.boolean({
			description: "Enable scripts to rename ESM types and rewrite imports.",
		}),
		attw: Flags.boolean({
			description: "Add are-the-types-wrong script and dependencies.",
		}),
		exports: Flags.boolean({
			description: "Add an exports field.",
		}),
		...PackageCommand.flags,
	};

	protected async processPackage(pkg: Package): Promise<void> {
		const { flags } = this;

		if (flags.newTsconfigs) {
			await this.newTsConfigs(pkg);
		}

		if (flags.tscMulti) {
			if (pkg.getScript("build:esnext") === undefined) {
				this.warning(`${pkg.nameColored} has no build:esnext script; skipping tscMulti.`);
			} else {
				await this.tscMulti(pkg);
			}
		}

		if (flags.renameTypes) {
			if (pkg.getScript("build:esnext") === undefined) {
				this.warning(`${pkg.nameColored} has no build:esnext script; skipping renameTypes.`);
			} else {
				await this.renameTypes(pkg);
			}
		}

		if (flags.attw) {
			await this.addAttw(pkg);
		}

		if (flags.ts2esm) {
			await this.addTs2Esm(pkg);
		}

		if (flags.exports) {
			await this.addExports(pkg);
		}
	}

	private async newTsConfigs(pkg: Package): Promise<void> {
		const context = await this.getContext();
		const repoRoot = context.repo.resolvedRoot;
		const projectTsConfigPath = path.resolve(pkg.directory, "tsconfig.json");
		// const tsConfigEsnextPath = path.resolve(pkg.directory, "tsconfig.esnext.json");
		const projectTestTsConfigPath = path.resolve(pkg.directory, "src/test/tsconfig.json");
		const pathToBaseConfig = path.resolve(
			repoRoot,
			"common/build/build-common/tsconfig.base.json",
		);
		const pathToCjsConfig = path.resolve(
			repoRoot,
			"common/build/build-common/tsconfig.cjs.json",
		);
		// const pathToEsmConfig = path.resolve(
		// 	repoRoot,
		// 	"common/build/build-common/tsconfig.esm.json",
		// );
		const pathToTestConfig = path.resolve(
			repoRoot,
			"common/build/build-common/tsconfig.test.json",
		);
		// const hasBuildEsnext = pkg.getScript("build:esnext") !== undefined;
		// get base compiler options
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
		const baseTsConfig = JSON5.parse(readFileSync(pathToBaseConfig, "utf8")) as TsConfigJson;

		// const updateTsConfigFromBase = (config: TsConfigJson): TsConfigJson => {
		// 	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		// 	(config as any).extends = [
		// 		path.relative(pkg.directory, pathToBaseConfig),
		// 		path.relative(pkg.directory, pathToTestConfig),
		// 	];

		// 	const keysToDelete =
		// 		config.compilerOptions === undefined
		// 			? []
		// 			: Object.keys(config.compilerOptions).filter((key) => {
		// 					const baseOptions = base.compilerOptions ?? {};
		// 					const baseHasKey = Object.hasOwn(baseOptions, key);
		// 					if (baseHasKey) {
		// 						this.log(`base has key: ${key}`);
		// 					}
		// 					return baseHasKey;
		// 			  });
		// 	for (const key of keysToDelete) {
		// 		// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
		// 		delete (config.compilerOptions as Record<string, object>)[key];
		// 	}

		// 	return config;
		// };

		// UPDATE MAIN PROJECT TSCONFIG
		if (existsSync(projectTsConfigPath)) {
			const projectTsConfig: TsConfigJson = JSON5.parse(
				readFileSync(projectTsConfigPath, "utf8"),
			);

			if (typeof projectTsConfig.extends !== "string") {
				this.log(
					`${pkg.nameColored}: Skipping because tsconfig already inherits from new configs.`,
				);
				return;
			}

			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
			(projectTsConfig as any).extends = [
				path.relative(pkg.directory, pathToBaseConfig),
				path.relative(pkg.directory, pathToCjsConfig),
			];

			const keysToDelete =
				projectTsConfig.compilerOptions === undefined
					? []
					: Object.keys(projectTsConfig.compilerOptions).filter((key) => {
							const base = baseTsConfig.compilerOptions ?? {};
							const baseHasKey = Object.hasOwn(base, key);
							return baseHasKey;
					  });
			for (const key of keysToDelete) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete (projectTsConfig.compilerOptions as Record<string, object>)[key];
			}

			writeFileSync(projectTsConfigPath, JSON.stringify(projectTsConfig, undefined, 2));
		}

		// UPDATE TEST TSCONFIG
		if (existsSync(projectTestTsConfigPath)) {
			const testTsConfig: TsConfigJson = JSON5.parse(
				readFileSync(projectTestTsConfigPath, "utf8"),
			);

			// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
			const baseTestTsConfig = JSON5.parse(
				readFileSync(pathToTestConfig, "utf8"),
			) as TsConfigJson;

			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
			(testTsConfig as any).extends = [
				path.relative(path.dirname(projectTestTsConfigPath), pathToBaseConfig),
				path.relative(path.dirname(projectTestTsConfigPath), pathToTestConfig),
			];

			const keysToDelete =
				testTsConfig.compilerOptions === undefined
					? []
					: Object.keys(testTsConfig.compilerOptions).filter((key) => {
							const base = baseTsConfig.compilerOptions ?? {};
							const baseTest = baseTestTsConfig.compilerOptions ?? {};
							const baseHasKey = Object.hasOwn(base, key) || Object.hasOwn(baseTest, key);
							return baseHasKey;
					  });
			for (const key of keysToDelete) {
				// skip some keys we always want to keep
				if (["types"].includes(key)) {
					continue;
				}
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete (testTsConfig.compilerOptions as Record<string, object>)[key];
			}

			writeFileSync(projectTestTsConfigPath, JSON.stringify(testTsConfig, undefined, 2));
		}
	}

	private async tscMulti(pkg: Package): Promise<void> {
		const context = await this.getContext();
		const repoRoot = context.repo.resolvedRoot;

		// const pathToMultiConfigCjs = path.resolve(
		// 	repoRoot,
		// 	"common/build/build-common/tsc-multi.cjs.json",
		// );
		const pathToMultiConfigEsm = path.resolve(
			repoRoot,
			"common/build/build-common/tsc-multi.esm.json",
		);

		updatePackageJsonFile(pkg.directory, (json) => {
			if (json.devDependencies?.["tsc-multi"] !== undefined) {
				this.log(`${pkg.nameColored}: Skipping tscMulti because it's already a dependency.`);
				return;
			}

			// ESM-only package
			if (json.type === "module" || pkg.getScript("build:esnext") === "tsc") {
				this.log(`${pkg.nameColored}: Skipping tscMulti because this is an ESM-only package`);
				return;
			}

			if (json.devDependencies !== undefined) {
				json.devDependencies["tsc-multi"] = "^1.1.0";
			}

			// if (Object.hasOwn(json.scripts, "tsc")) {
			// 	const relPath = path.relative(pkg.directory, pathToMultiConfigCjs);
			// 	json.scripts.tsc = `tsc-multi --config ${relPath}`;
			// 	json.main = "dist/index.cjs";
			// }

			if (Object.hasOwn(json.scripts, "build:esnext")) {
				const relPath = path.relative(pkg.directory, pathToMultiConfigEsm);
				json.scripts["build:esnext"] = `tsc-multi --config ${relPath}`;
				json.module = "lib/index.mjs";
			}

			// const pathToTscMultiTestConfig = path.resolve(
			// 	repoRoot,
			// 	"common/build/build-common/tsc-multi.test.json",
			// );
			// const TscMultiTestContent = readFileSync(pathToTscMultiTestConfig, "utf8");
			// if (Object.hasOwn(json.scripts, "build:test")) {
			// 	json.scripts["build:test"] = `tsc-multi --config ./tsc-multi.test.json`;
			// 	writeFileSync(path.join(pkg.directory, "tsc-multi.test.json"), TscMultiTestContent);
			// }

			json.types = "dist/index.d.ts";
			this.addExportsJson(json);

			const tsConfigEsnextPath = path.resolve(pkg.directory, "tsconfig.esnext.json");
			try {
				unlinkSync(tsConfigEsnextPath);
			} catch (error) {
				this.warning(`Couldn't delete ${tsConfigEsnextPath}: ${error}`);
			}
		});
	}

	private async addAttw(pkg: Package): Promise<void> {
		if (pkg.getScript("check:are-the-types-wrong") !== undefined) {
			return;
		}

		updatePackageJsonFile(pkg.directory, (packageJson) => {
			if (packageJson.devDependencies === undefined) {
				this.warning(`Package has no devDependencies: ${pkg.nameColored}`);
				return;
			}

			packageJson.scripts["check:are-the-types-wrong"] = "attw --pack";
			packageJson.devDependencies["@arethetypeswrong/cli"] = "^0.13.3";
		});
	}

	private async addTs2Esm(pkg: Package): Promise<void> {
		if (pkg.getScript("ts2esm") !== undefined) {
			return;
		}

		updatePackageJsonFile(pkg.directory, (packageJson) => {
			if (packageJson.devDependencies === undefined) {
				this.warning(`Package has no devDependencies: ${pkg.nameColored}`);
				return;
			}
			packageJson.scripts.ts2esm = "ts2esm ./tsconfig.json ./src/test/tsconfig.json";
			packageJson.devDependencies.ts2esm = "^1.1.0";
		});
	}

	private async addExports(pkg: Package): Promise<void> {
		updatePackageJsonFile(pkg.directory, (json) => this.addExportsJson(json));
	}

	private addExportsJson(json: PackageJson): void {
		if (json.exports !== undefined) {
			return;
		}

		// TODO: make this more intelligent if needed
		json.exports = {
			".": {
				import: {
					types: "./lib/index.d.mts",
					default: "./lib/index.mjs",
				},
				require: {
					types: "./dist/index.d.ts",
					default: "./dist/index.js",
				},
			},
		};
	}

	private async renameTypes(pkg: Package): Promise<void> {
		// const context = await this.getContext();
		// const repoRoot = context.repo.resolvedRoot;
		// const rewriteImportsConfigPath = path.relative(
		// 	pkg.directory,
		// 	path.resolve(
		// 		repoRoot,
		// 		"common/build/build-common/replace-in-file-rewrite-type-imports.cjs",
		// 	),
		// );

		// await this.addAttw(pkg);

		updatePackageJsonFile(pkg.directory, (packageJson) => {
			if (packageJson.devDependencies === undefined) {
				this.warning(`Package has no devDependencies: ${pkg.nameColored}`);
				return;
			}

			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
			if ((packageJson.exports as any)?.["."]?.import?.types !== undefined) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
				(packageJson.exports as any)["."].import.types = "./lib/index.d.mts";
			}

			packageJson.scripts["build:rename-types"] =
				`renamer "lib/**" -f .d.ts -r .d.mts --force`;
			// packageJson.scripts[
			// 	"build:rewrite-type-imports"
			// ] = `replace-in-file --configFile ${rewriteImportsConfigPath}`;

			packageJson.devDependencies.renamer = "^4.0.0";
			// packageJson.devDependencies["replace-in-file"] = "^6.3.5";

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			// const config: any | undefined = packageJson.fluidBuild?.tasks?.["build:docs"];

			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			// if (config?.dependsOn !== undefined) {
			// 	// (packageJson as any).fluidBuild.tasks["build:docs"].dependsOn = [
			// 	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			// 	config.dependsOn = [
			// 		"...",
			// 		"api-extractor:commonjs",
			// 		"api-extractor:esnext",
			// 		"build:rename-types",
			// 		"build:rewrite-type-imports",
			// 	];
			// }
		});
	}
}
