/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import {
	type BrokenCompatTypes,
	type Logger,
	type Package,
	type PackageJson,
	type TestCaseTypeData,
	type TypeData,
	buildTestCase,
	getFullTypeName,
	getNodeTypeData,
	getTypeTestPreviousPackageDetails,
	typeOnly,
} from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { PackageName } from "@rushstack/node-core-library";
import * as changeCase from "change-case";
import { mkdirSync, readJson, rmSync, writeFileSync } from "fs-extra";
import * as resolve from "resolve.exports";
import { ModuleKind, Project, type SourceFile } from "ts-morph";
import { PackageCommand } from "../../BasePackageCommand";
import type { PackageSelectionDefault } from "../../flags";
import { ApiLevel, ensureDevDependencyExists, knownApiLevels } from "../../library";
import { unscopedPackageNameString } from "./entrypoints";

export default class GenerateTypetestsCommand extends PackageCommand<
	typeof GenerateTypetestsCommand
> {
	static readonly description = "Generates type tests for a package or group of packages.";

	static readonly flags = {
		level: Flags.custom<ApiLevel>({
			description: "What API level to generate tests for.",
			default: ApiLevel.internal,
			options: knownApiLevels,
		})(),
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

	protected defaultSelection = "dir" as PackageSelectionDefault;

	protected async processPackage(pkg: Package): Promise<void> {
		const { level, outDir, outFile } = this.flags;
		const fallbackLevel = this.flags.publicFallback ? ApiLevel.public : undefined;

		// Do not check that file exists before opening:
		// Doing so is a time of use vs time of check issue so opening the file could fail anyway.
		// Do not catch error from opening file since the default behavior is fine (exits process with error showing useful message)
		const currentPackageJson = pkg.packageJson;
		const { name: previousPackageName, packageJsonPath: previousPackageJsonPath } =
			getTypeTestPreviousPackageDetails(pkg);
		const previousBasePath = path.dirname(previousPackageJsonPath);

		const typeTestOutputFile = getTypeTestFilePath(pkg, outDir, outFile);
		if (currentPackageJson.typeValidation?.disabled === true) {
			this.info(
				"Skipping type test generation because typeValidation.disabled is true in package.json",
			);
			rmSync(
				typeTestOutputFile,
				// force means to ignore the error if the file does not exist.
				{ force: true },
			);
			this.verbose(`Deleted file: ${typeTestOutputFile}`);

			// Early exit; no error.
			return;
		}

		ensureDevDependencyExists(currentPackageJson, previousPackageName);
		this.verbose(`Reading package.json at ${previousPackageJsonPath}`);
		const previousPackageJson = (await readJson(previousPackageJsonPath)) as PackageJson;
		// Set the name in the JSON to the calculated previous package name, since the name in the previous package.json is
		// the same as current. This enables us to pass the package.json object to more general functions but ensure those
		// functions use the correct name. For example, when we write the `import { foo } from <PACKAGE>/internal`
		// statements into the type test file, we need to use the previous version name.
		previousPackageJson.name = previousPackageName;

		const { typesPath: currentTypesPathRelative, levelUsed: currentPackageLevel } =
			getTypesPathWithFallback(currentPackageJson, level, this.logger, fallbackLevel);
		const currentTypesPath = path.resolve(path.join(pkg.directory, currentTypesPathRelative));
		this.verbose(
			`Found ${currentPackageLevel} type definitions for ${currentPackageJson.name}: ${currentTypesPath}`,
		);

		const { typesPath: previousTypesPathRelative, levelUsed: previousPackageLevel } =
			getTypesPathWithFallback(previousPackageJson, level, this.logger, fallbackLevel);
		const previousTypesPath = path.resolve(
			path.join(previousBasePath, previousTypesPathRelative),
		);
		this.verbose(
			`Found ${previousPackageLevel} type definitions for ${previousPackageJson.name}: ${previousTypesPath}`,
		);

		// For the current version, we load the package-local tsconfig and return index.ts as the source file. This ensures
		// we don't need to build before running type test generation. It's tempting to load the .d.ts files and use the
		// same code path as is used below for the previous version (loadTypesSourceFile()), but that approach requires that
		// the local project be built.
		//
		// One drawback to this approach is that it will always enumerate the full (internal) API for the current version.
		// There's no way to scope it to just alpha, beta, etc. for example. If that capability is eventually needed we can
		// revisit this.
		const currentFile = new Project({
			skipFileDependencyResolution: true,
			tsConfigFilePath: path.join(pkg.directory, "tsconfig.json"),
		}).getSourceFileOrThrow("index.ts");
		this.verbose(
			`Loaded source file for current version (${pkg.version}): ${currentFile.getFilePath()}`,
		);
		const previousFile = loadTypesSourceFile(previousTypesPath);
		this.verbose(
			`Loaded source file for previous version (${
				previousPackageJson.version
			}): ${previousFile.getFilePath()}`,
		);

		const currentTypeMap = typeDataFromFile(currentFile, this.logger);
		const previousData = [...typeDataFromFile(previousFile, this.logger).values()];

		// Sort previous data lexicographically. To use locale-specific sort change the sort function to
		// (a, b) => a.name.localeCompare(b.name)
		previousData.sort((a, b) => (a.name > b.name ? 1 : a.name < b.name ? -1 : 0));

		const fileHeader: string[] = [
			`
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by flub generate:typetests in @fluid-tools/build-cli.
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

		mkdirSync(outDir, { recursive: true });

		writeFileSync(typeTestOutputFile, testCases.join("\n"));
		this.info(`Generated type test file: ${path.resolve(typeTestOutputFile)}`);
	}
}

/**
 * Tries to find the path to types for a given API level, falling back to another API level (typically public) if the
 * requested one is not found. The paths returned are relative to the package.
 */
function getTypesPathWithFallback(
	packageJson: PackageJson,
	level: ApiLevel,
	log: Logger,
	fallbackLevel?: ApiLevel,
): { typesPath: string; levelUsed: ApiLevel } {
	let chosenLevel: ApiLevel = level;
	// First try the requested paths, but fall back to public otherwise if configured.
	let typesPath: string | undefined = getTypesPathFromPackage(packageJson, level, log);

	if (typesPath === undefined) {
		// Try the public types if configured to do so. If public types are found adjust the level accordingly.
		typesPath =
			fallbackLevel === undefined
				? undefined
				: getTypesPathFromPackage(packageJson, fallbackLevel, log);
		chosenLevel = fallbackLevel ?? level;
		if (typesPath === undefined) {
			throw new Error(
				`No type definitions found for "${chosenLevel}" API level in ${packageJson.name}`,
			);
		}
	}
	return { typesPath: typesPath, levelUsed: chosenLevel };
}

/**
 * Finds the path to the types of a package using the package's export map or types/typings field.
 * If the path is found, it is returned. Otherwise it returns undefined.
 *
 * This implementation uses resolve.exports to resolve the path to types for a level.
 *
 * @param packageJson - The package.json object to check for types paths.
 * @param level - An API level to get types paths for.
 * @returns A package relative path to the types.
 *
 * @remarks
 *
 * This implementation loosely follows TypeScript's process for finding types as described at
 * {@link https://www.typescriptlang.org/docs/handbook/modules/reference.html#packagejson-main-and-types}. If an export
 * map is found, the `types` and `typings` field are ignored. If an export map is not found, then the `types`/`typings`
 * fields will be used as a fallback _only_ for the public API level (which coresponds to the default export).
 *
 * Importantly, this code _does not_ implement falling back to the `main` field when `types` and `typings` are missing,
 * nor does it look up types from DefinitelyTyped (i.e. \@types/* packages). This fallback logic is not needed for our
 * packages because we always specify types explicitly in the types field, and types are always included in our packages
 * (as opposed to a separate \@types package).
 */
export function getTypesPathFromPackage(
	packageJson: PackageJson,
	level: ApiLevel,
	log: Logger,
): string | undefined {
	if (packageJson.exports === undefined) {
		log.verbose(`${packageJson.name}: No export map found.`);
		// Use types/typings field only when the public API level is used and no exports field is found
		if (level === ApiLevel.public) {
			log.verbose(`${packageJson.name}: Using the types/typings field value.`);
			return packageJson.types ?? packageJson.typings;
		}
		// No exports and a non-public API level, so return undefined.
		return undefined;
	}

	// Package has an export map, so map the requested API level to an entrypoint and check the exports conditions.
	const entrypoint = level === ApiLevel.public ? "." : `./${level}`;

	// resolve.exports sets some conditions by default, so the ones we supply supplement the defaults. For clarity the
	// applied conditions are noted in comments.
	let typesPath: string | undefined;
	try {
		// First try to resolve with the "import" condition, assuming the package is either ESM-only or dual-format.
		// conditions: ["default", "types", "import", "node"]
		const exports = resolve.exports(packageJson, entrypoint, { conditions: ["types"] });

		// resolve.exports returns a `Exports.Output | void` type, though the documentation isn't clear under what
		// conditions `void` would be the return type vs. just throwing an exception. Since the types say exports could be
		// undefined or an empty array (Exports.Output is an array type), check for those conditions.
		typesPath = exports === undefined || exports.length === 0 ? undefined : exports[0];
	} catch {
		// Catch and ignore any exceptions here; we'll retry with the require condition.
		log.verbose(
			`${packageJson.name}: No types found for ${entrypoint} using "import" condition.`,
		);
	}

	// Found the types using the import condition, so return early.
	if (typesPath !== undefined) {
		return typesPath;
	}

	try {
		// If nothing is found when using the "import" condition, try the "require" condition. It may be possible to do this
		// in a single call to resolve.exports, but the documentation is a little unclear. This seems a safe, if inelegant
		// solution.
		// conditions: ["default", "types", "require", "node"]
		const exports = resolve.exports(packageJson, entrypoint, {
			conditions: ["types"],
			require: true,
		});
		typesPath = exports === undefined || exports.length === 0 ? undefined : exports[0];
	} catch {
		// Catch and ignore any exceptions here; we'll retry with the require condition.
		log.verbose(
			`${packageJson.name}: No types found for ${entrypoint} using "require" condition.`,
		);
	}

	return typesPath;
}

/**
 * Calculates the file path for type validation tests.
 *
 * @param pkg - The package whose type tests are being generated.
 * @param outDir - The output directory for generated tests.
 * @param outFile - The filename for generated tests.
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

/**
 * Extracts type data from a TS source file and creates a map where each key is a type name and the value is its type
 * data.
 *
 * @param file - The source code file containing type data.
 * @param log - A logger to use.
 * @returns The mapping between type name and its type data.
 */
function typeDataFromFile(file: SourceFile, log: Logger): Map<string, TypeData> {
	const typeData = new Map<string, TypeData>();
	const exportedDeclarations = file.getExportedDeclarations();

	for (const declarations of exportedDeclarations.values()) {
		for (const declaration of declarations) {
			for (const typeDefinition of getNodeTypeData(declaration)) {
				const fullName = getFullTypeName(typeDefinition);
				if (typeData.has(fullName)) {
					// This system does not properly handle overloads: instead it only keeps the last signature.
					log.warning(
						`Skipping overload for ${fullName}; only the last signature will be used.`,
					);
				}
				typeData.set(fullName, typeDefinition);
			}
		}
	}
	return typeData;
}

/**
 * Loads a ts-morph source file from the provided path.
 *
 * @param typesPath - The path to the types file to load.
 * @returns The loaded source file.
 */
export function loadTypesSourceFile(typesPath: string): SourceFile {
	// Note that this does NOT load anything from tsconfig.
	const project = new Project({
		skipAddingFilesFromTsConfig: true,
		compilerOptions: {
			module: ModuleKind.Node16,
		},
	});
	const sourceFile = project.addSourceFileAtPath(typesPath);
	return sourceFile;
}

/**
 * Generates compatibility test cases between the previous type definitions and the current type map.
 * This function constructs test cases to validate forward and backward compatibility of types.
 * @param previousData - array of type data from the previous file
 * @param currentTypeMap - map containing current type data
 * @param packageObject - package.json object containing type validation settings
 * @param testString - array to store generated test strings
 * @returns - string array representing generated compatibility test cases
 */
export function generateCompatibilityTestCases(
	previousData: TypeData[],
	currentTypeMap: Map<string, TypeData>,
	packageObject: PackageJson,
	testString: string[],
): string[] {
	const broken: BrokenCompatTypes = packageObject.typeValidation?.broken ?? {};
	for (const oldTypeData of previousData) {
		const oldType: TestCaseTypeData = {
			prefix: "old",
			...oldTypeData,
			removed: false,
		};
		const currentTypeData = currentTypeMap.get(getFullTypeName(oldTypeData));
		// if the current package is missing a type, we will use the old type data.
		// this can represent a breaking change which can be disable in the package.json.
		// this can also happen for type changes, like type to interface, which can remain
		// compatible.
		const currentType: TestCaseTypeData =
			currentTypeData === undefined
				? {
						prefix: "current",
						...oldTypeData,
						kind: `Removed${oldTypeData.kind}`,
						removed: true,
					}
				: {
						prefix: "current",
						...currentTypeData,
						removed: false,
					};

		// look for settings not under version, then fall back to version for back compat
		const brokenData = broken?.[getFullTypeName(currentType)];

		testString.push(
			`/*`,
			` * Validate forward compatibility by using the old type in place of the current type.`,
			` * If this test starts failing, it indicates a change that is not forward compatible.`,
			` * To acknowledge the breaking change, add the following to package.json under`,
			` * typeValidation.broken:`,
			` * "${getFullTypeName(currentType)}": {"forwardCompat": false}`,
			" */",
			...buildTestCase(oldType, currentType, brokenData?.forwardCompat ?? true),
			"",
			`/*`,
			` * Validate backward compatibility by using the current type in place of the old type.`,
			` * If this test starts failing, it indicates a change that is not backward compatible.`,
			` * To acknowledge the breaking change, add the following to package.json under`,
			` * typeValidation.broken:`,
			` * "${getFullTypeName(currentType)}": {"backCompat": false}`,
			" */",
			...buildTestCase(currentType, oldType, brokenData?.backCompat ?? true),
			"",
		);
	}
	return testString;
}
