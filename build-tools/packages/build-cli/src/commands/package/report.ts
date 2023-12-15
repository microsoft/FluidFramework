/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Package, PackageJson } from "@fluidframework/build-tools";
import { Flags, ux } from "@oclif/core";
import * as JSON5 from "json5";
import path from "node:path";
import type { TsConfigJson } from "type-fest";
import { PackageCommand } from "../../BasePackageCommand";
import { existsSync, readFileSync } from "fs-extra";

// import chalk from "chalk";

interface PackageMetadata extends Record<string, string | boolean | undefined> {
	// package: Package;
	scope: string;
	name: string;
	scopedName: string;
	typeField: "commonjs" | "module" | "n/a";
	private: boolean;
	buildsCJS?: boolean;
	buildsESM?: boolean;
	buildsTests?: boolean;
	hasApiScript?: boolean;
	hasDocsFluidBuildTasks?: boolean;
	hasExportsField?: boolean;
	hasAlphaExport?: boolean;
	hasTscMultiDep?: boolean;
	hasRenameTypesScript?: boolean;
	runsTests?: boolean;
	usesNewTsConfigs?: boolean;
	usesTscMulti?: boolean;
}

export default class PackageReportCommand extends PackageCommand<typeof PackageReportCommand> {
	static readonly description = "";

	static readonly flags = {
		...PackageCommand.flags,
		csv: Flags.boolean({
			description: "Format output as csv.",
			helpGroup: "GLOBAL",
			exclusive: ["json"],
			required: false,
			default: false,
		}),
		quiet: Flags.boolean({
			description: "Disable all logging.",
			helpGroup: "LOGGING",
			exclusive: ["verbose"],
			required: false,
			default: true,
			hidden: true,
		}),
	};

	static readonly enableJsonFlag = true;

	private readonly packageMetadata: Record<string, string | boolean | undefined>[] = [];

	protected async processPackage(pkg: Package): Promise<void> {
		// eslint-disable-next-line prefer-destructuring
		const packageJson: PackageJson = pkg.packageJson;
		const tsConfigPath = path.resolve(pkg.directory, "tsconfig.json");
		let tsconfig: TsConfigJson | undefined;
		if (existsSync(tsConfigPath)) {
			tsconfig = JSON5.parse(readFileSync(tsConfigPath, "utf8"));
		}

		const usesNewTsConfigs =
			tsconfig?.extends !== "@fluidframework/build-common/ts-common-config.json";

		const exportsField = packageJson.exports;
		const hasAlphaExport = Object.hasOwn((exportsField as object) ?? {}, "./alpha");

		const metadata: PackageMetadata = {
			// package: pkg,
			scope: pkg.scope,
			name: pkg.nameUnscoped,
			scopedName: pkg.name,
			typeField: packageJson.type ?? "n/a",
			private: packageJson.private ?? false,
			buildsCJS:
				packageJson.type === "commonjs" ||
				pkg.getScript("tsc") === "tsc" ||
				pkg.getScript("tsc")?.includes(".cjs."),
			buildsESM: pkg.getScript("build:esnext") !== undefined || packageJson.type === "module",
			buildsTests: pkg.getScript("build:test") !== undefined,
			hasApiScript: pkg.getScript("api") !== undefined,
			hasDocsFluidBuildTasks: Object.hasOwn(
				packageJson.fluidBuild?.tasks ?? {},
				"build:docs",
			),
			hasExportsField: Object.hasOwn(packageJson, "exports"),
			hasAlphaExport,
			hasTscMultiDep: Object.hasOwn(packageJson.devDependencies ?? {}, "tsc-multi"),
			hasRenameTypesScript: pkg.getScript("build:rename-types") !== undefined,
			runsTests: pkg.getScript("test") !== undefined,
			usesTscMulti: pkg.getScript("tsc")?.includes("tsc-multi"),
			usesNewTsConfigs,
		};
		this.packageMetadata.push(metadata);
	}

	public async run(): Promise<Record<string, string | boolean | undefined>[]> {
		// Calls processPackage on all packages.
		await super.run();

		this.packageMetadata.sort((a, b) => {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			return a.scopedName! < b.scopedName! ? -1 : a.scopedName === b.scopedName ? 0 : 1;
		});

		ux.table(
			this.packageMetadata,
			{
				scope: {},
				name: {},
				typeField: {
					header: "Type",
				},
				private: {},
				buildsCJS: {
					header: "CJS",
					minWidth: 5,
				},
				buildsESM: {
					header: "ESM",
					minWidth: 5,
				},
				buildsTests: {
					minWidth: 5,
				},
				runsTests: {
					minWidth: 5,
				},
				hasApiScript: {},
				hasDocsFluidBuildTasks: {},
				hasExportsField: {
					header: "exports",
					minWidth: 5,
				},
				hasAlphaExport: {},
				usesNewTsConfigs: {},
				hasTscMultiDep: {
					minWidth: 5,
				},
				usesTscMulti: {
					minWidth: 5,
				},
				hasRenameTypesScript: {},
			},
			{
				...this.flags, // parsed flags
			},
		);

		return this.packageMetadata;
	}
}
