/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { type Package, type PackageJson, typeOnly } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { PackageName } from "@rushstack/node-core-library";
import * as changeCase from "change-case";
import { mkdirSync, readJson, rmSync, writeFileSync } from "fs-extra";
import * as resolve from "resolve.exports";
import { PackageCommand } from "../../BasePackageCommand";
import { ApiLevel, ensureDevDependencyExists, knownApiLevels } from "../../library";
import {
	generateCompatibilityTestCases,
	initializeProjectsAndLoadFiles,
	typeDataFromFile,
} from "../../typeTestUtils";
import { unscopedPackageNameString } from "./entrypoints";

export default class GenerateTypetestsCommand extends PackageCommand<
	typeof GenerateTypetestsCommand
> {
	static readonly description = "Generates type tests for a package or group of packages.";

	static readonly flags = {
		level: Flags.string({
			description: "What API level to generate tests for.",
			default: ApiLevel.internal,
			options: knownApiLevels,
		}),
		outDir: Flags.directory({
			description: "Where to emit the type tests file.",
			default: "./src/test/types",
		}),
		outFile: Flags.string({
			description: `File name for the generated type tests. The pattern '${unscopedPackageNameString}' within the value will be replaced with the unscoped name of this package in PascalCase.`,
			default: `validate${unscopedPackageNameString}Previous.generated.ts`,
		}),
		publicFallback: Flags.boolean({
			description:
				"Use the public entrypoint as a fallback if the API at the requested level is not found.",
			default: false,
		}),
		...PackageCommand.flags,
	} as const;

	protected async processPackage(pkg: Package): Promise<void> {
		const { outDir, outFile } = this.flags;

		// This cast is safe because oclif has already ensured only known ApiLevel values get to this point.
		const level = this.flags.level as ApiLevel;
		const fallbackLevel = this.flags.publicFallback ? ApiLevel.public : undefined;

		// Do not check that file exists before opening:
		// Doing so is a time of use vs time of check issue so opening the file could fail anyway.
		// Do not catch error from opening file since the default behavior is fine (exits process with error showing useful message)
		const currentPackageJson = pkg.packageJson;
		const previousPackageName = `${currentPackageJson.name}-previous`;
		const previousBasePath = path.join(pkg.directory, "node_modules", previousPackageName);
		const previousPackageJsonPath = path.join(previousBasePath, "package.json");

		ensureDevDependencyExists(currentPackageJson, previousPackageName);
		this.verbose(`Reading package.json at ${previousPackageJsonPath}`);
		const previousPackageJson = (await readJson(previousPackageJsonPath)) as PackageJson;
		// Set the name in the JSON to the calculated previous package name, since the name in the previous package.json is
		// the same as current.
		previousPackageJson.name = previousPackageName;

		const typeTestOutputFile = getTypeTestFilePath(pkg, outDir, outFile);
		if (currentPackageJson.typeValidation?.disabled === true) {
			this.info("skipping type test generation because they are disabled in package.json");
			rmSync(
				typeTestOutputFile,
				// force means to ignore the error if the file does not exist.
				{ force: true },
			);
			this.verbose(`Deleted file: ${typeTestOutputFile}`);
			this.exit(0);
		}

		const { typesPath: currentTypesPathRelative, levelUsed: currentPackageLevel } =
			getTypesPathWithFallback(currentPackageJson, level, fallbackLevel);
		const currentTypesPath = path.join(pkg.directory, currentTypesPathRelative);
		this.verbose(
			`Found ${currentPackageLevel} type definitions for ${currentPackageJson.name}: ${currentTypesPath}`,
		);

		const { typesPath: previousTypesPathRelative, levelUsed: previousPackageLevel } =
			getTypesPathWithFallback(previousPackageJson, level, fallbackLevel);
		const previousTypesPath = path.join(previousBasePath, previousTypesPathRelative);
		this.verbose(
			`Found ${previousPackageLevel} type definitions for ${previousPackageJson.name}: ${previousTypesPath}`,
		);

		const { currentFile, previousFile } = initializeProjectsAndLoadFiles(
			currentTypesPath,
			pkg.directory,
			previousTypesPath,
			previousBasePath,
		);

		this.verbose(`Loaded source file for current version: ${currentFile.getFilePath()}`);
		this.verbose(`Loaded source file for previous version: ${previousFile.getFilePath()}`);

		const currentTypeMap = typeDataFromFile(currentFile);
		const previousData = [...typeDataFromFile(previousFile).values()];

		// eslint-disable-next-line unicorn/consistent-function-scoping
		function compareString(a: string, b: string): number {
			return a > b ? 1 : a < b ? -1 : 0;
		}
		previousData.sort((a, b) => compareString(a.name, b.name));

		const fileHeader: string[] = [
			`
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by fluid-type-test-generator in @fluidframework/build-tools.
 */

import type * as old from "${previousPackageName}${
				previousPackageLevel === ApiLevel.public ? "" : `/${previousPackageLevel}`
			}";
import type * as current from "../../index.js";
		`.trim(),
			typeOnly,
		];

		const testCases = generateCompatibilityTestCases(
			previousData,
			currentTypeMap,
			currentPackageJson,
			fileHeader,
		);

		mkdirSync("./src/test/types", { recursive: true });

		writeFileSync(typeTestOutputFile, testCases.join("\n"));
		console.log(`generated ${path.resolve(typeTestOutputFile)}`);
	}
}

/**
 * Tries to find the path to types for a given API level, falling back to another API level (typically public) if the
 * requested one is not found. The paths returned are relative to the package.
 */
function getTypesPathWithFallback(
	packageJson: PackageJson,
	level: ApiLevel,
	fallbackLevel?: ApiLevel,
): { typesPath: string; levelUsed: ApiLevel } {
	let chosenLevel: ApiLevel = level;
	// First try the requested paths, but fall back to public otherwise if configured.
	let typesPath: string | undefined = getTypesPathFromPackage(packageJson, level);

	if (typesPath === undefined) {
		// Try the public types if configured to do so. If public types are found adjust the level accordingly.
		typesPath =
			fallbackLevel === undefined
				? undefined
				: getTypesPathFromPackage(packageJson, fallbackLevel);
		if (typesPath === undefined) {
			throw new Error(`No type definitions found for ${packageJson.name}`);
		}
		chosenLevel = fallbackLevel ?? level;
	}
	return { typesPath: typesPath, levelUsed: chosenLevel };
}

/**
 * Finds the path to the types of a package using the package's export map.
 * If the path is found, it is returned. Otherwise, an error is thrown.
 *
 * This implementation uses resolve.exports to resolve the path to types for a level.
 *
 * @param packageJson - The package.json object to check for types paths.
 * @param level - An API level to get types paths for.
 * @returns A package relative path to the types.
 */
function getTypesPathFromPackage(packageJson: PackageJson, level: ApiLevel): string {
	// resolve.exports sets some conditions by default, so the ones we supply supplement the defaults. For clarity the
	// applied conditions are noted in comments.
	const exports =
		// First try to resolve with the "import" condition, assuming the package is either ESM-only or dual-format.
		// conditions: ["default", "types", "import", "node"]
		resolve.exports(packageJson, `./${level}`, { conditions: ["types"] }) ??
		// If nothing is found when using the "import" condition, try the "require" condition. It may be possible to do this
		// in a single call to resolve.exports, but the documentation is a little unclear. This seems a safe, if inelegant
		// solution.
		// conditions: ["default", "types", "require", "node"]
		resolve.exports(packageJson, `./${level}`, { conditions: ["types"], require: true });

	const typesPath =
		exports === undefined || exports.length === 0
			? packageJson.types ?? packageJson.typings
			: exports[0];

	if (typesPath === undefined) {
		throw new Error(
			`No types could be found in exports or types/typings field: ${packageJson.name}`,
		);
	}
	return typesPath;
}

/**
 * Calculates the file path for type validation tests.
 *
 * @param pkg - The package whose type tests are being generated.
 * @param outDir - The output directory for generated tests.
 * @param outDir - The output directory for generated tests.
 *
 * @returns The path to write generated files to.
 */
function getTypeTestFilePath(pkg: Package, outDir: string, outFile: string): string {
	return path.join(
		pkg.directory,
		outDir,
		outFile.includes(unscopedPackageNameString)
			? outFile.replace(
					unscopedPackageNameString,
					changeCase.pascalCase(PackageName.getUnscopedName(pkg.name)),
				)
			: outFile,
	);
}
