/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readJsonSync } from "fs-extra";
import path from "node:path";
import { IExtractorConfigPrepareOptions } from "@microsoft/api-extractor";
import { existsSync } from "node:fs";
import { Project, SourceFile } from "ts-morph";
import { BrokenCompatTypes } from "../common/fluidRepo";
import { buildTestCase, TestCaseTypeData } from "../typeValidator/testGeneration";
import { getFullTypeName, getNodeTypeData, TypeData } from "../typeValidator/typeData";
import { PackageJson } from "../common/npmPackage";

/**
 * Checks the package object to verify that the specified dependency exists
 * @param packageObject - package.json object
 * @param dependencyName - the dependency to check for in the package object
 * @remarks Information about the previous package from the package.json is not needed,
 * but error if it's missing since it's nice to separate errors for the dep missing here vs not installed.
 * This ensures that a critical dependency (the previous package version) is correctly declared in the project's package.json.
 */
export function ensureDevDependencyExists(
	packageObject: PackageJson,
	dependencyName: string,
): void {
	const dependencyVersion = packageObject?.devDependencies?.[dependencyName];
	if (typeof dependencyVersion !== "string") {
		throw new Error(`Did not find devDependency ${dependencyName} in package.json`);
	}
}

/**
 * Fetches the path of the previous package.json or throws an error if not found.
 * @param previousBasePath - A string representing the path to the root of a package
 */
export function getPreviousPackageJsonPath(previousBasePath: string): string {
	const previousPackageJsonPath = path.join(previousBasePath, "package.json");
	if (!existsSync(previousPackageJsonPath)) {
		throw new Error(`${previousPackageJsonPath} not found.`);
	}
	return previousPackageJsonPath;
}

/**
 * Attempts to retrieve a specified type of rollup file path for type definitions from the API Extractor config.
 * @param rollupType - The type of rollup file path to retrieve (ex: "alpha", "beta", "public").
 * @param extractorConfig - The API Extractor config object.
 * @returns The path to the type definitions file for the specified rollupType, or undefined if it cannot be found.
 * @throws If api-extractor config cannot be loaded.
 */
export function getTypeRollupPathFromExtractorConfig(
	rollupType: "alpha" | "beta" | "public" | "untrimmed",
	extractorConfig: IExtractorConfigPrepareOptions,
): string | undefined {
	try {
		if (!extractorConfig || !extractorConfig.configObject) {
			console.log("API Extractor configuration not found. Falling back to default behavior.");
			return undefined;
		}
		const apiExtractorConfig = extractorConfig.configObject;
		// Get rollupPath based on release tag
		// https://api-extractor.com/pages/setup/configure_rollup/#trimming-based-on-release-tags
		if (apiExtractorConfig.dtsRollup) {
			let rollupPath: string | undefined;
			if (rollupType === "untrimmed") {
				rollupPath = apiExtractorConfig.dtsRollup.untrimmedFilePath;
			} else {
				rollupPath = apiExtractorConfig.dtsRollup[`${rollupType}TrimmedFilePath`];
			}
			if (!rollupPath) {
				console.warn(`Rollup path for "${rollupType}" not found.`);
				return undefined;
			}
			return rollupPath;
		} else {
			console.warn(`dtsRollup configuration not found in the API Extractor configuration.`);
			return undefined;
		}
	} catch (error) {
		console.error("Error loading API Extractor configuration:", error);
		throw error;
	}
}

/**
 * Attempts to extract the type definition file path from the 'exports' field of a given package.json.
 * Checks both 'import' and 'require' resolution methods to find the appropriate path.
 * If the path is found, it is returned. Otherwise, an error is thrown.
 * @param previousPackageJson - An object representing the previous package json
 * @param previousBasePath - A string representing the path to the root of a package
 * @returns A type definition filepath based on the appropriate export, or undefined if it cannot be found.
 */
export function getTypePathFromExport(
	previousPackageJson: PackageJson,
	previousBasePath: string,
): string | undefined {
	if (!previousPackageJson.exports) {
		console.warn("The 'exports' field is missing in the package.json.");
		return undefined;
	}

	const extractTypesPath = (exportEntry: any): string | undefined => {
		return exportEntry?.types ? path.join(previousBasePath, exportEntry.types) : undefined;
	};
	const defaultSubpath = ".";
	const exportEntry = previousPackageJson.exports[defaultSubpath];

	// Check both 'import' and 'require' resolution methods
	const typeDefinitionFilePath =
		extractTypesPath(exportEntry?.import) ?? extractTypesPath(exportEntry?.require);
	if (!typeDefinitionFilePath) {
		// If no valid path is found, throw an error
		throw new Error(
			`Type definition file path could not be determined from the 'exports' field of '${getPreviousPackageJsonPath(
				previousBasePath,
			)}' using the default export entry '.'`,
		);
	}
	return typeDefinitionFilePath;
}
/**
 * Checks the package.json's exports entries and types field for a type definition filepath
 * @returns string representing type definition file path
 */
export function getTypeDefinitionFilePath(packageBasePath: string): string | undefined {
	const previousPackageJsonPath = getPreviousPackageJsonPath(packageBasePath);
	const packageJson: PackageJson = readJsonSync(previousPackageJsonPath);
	// Check the exports entries
	if (packageJson.exports) {
		return getTypePathFromExport(packageJson, packageBasePath);
		// Check the types field from the previous package.json as a fallback
	} else if (packageJson.types) {
		return path.join(packageBasePath, packageJson.types);
	} else {
		throw new Error(
			`Type definition file path could not be determined from '${previousPackageJsonPath},
			)}'. No 'exports' nor 'type' fields found.`,
		);
	}
}

/**
 * Extracts type data from a TS source file and creates a map where each key is a type name and the value is its type data.
 * @param file - The source code file containing type data
 * @returns The mapping between item and its type
 */
export function typeDataFromFile(file: SourceFile): Map<string, TypeData> {
	const typeData = new Map<string, TypeData>();
	const exportedDeclarations = file.getExportedDeclarations();

	for (const declarations of exportedDeclarations.values()) {
		for (const dec of declarations) {
			getNodeTypeData(dec).forEach((td) => {
				const fullName = getFullTypeName(td);
				if (typeData.has(fullName)) {
					// This system does not properly handle overloads: instead it only keeps the last signature.
					console.warn(`skipping overload for ${fullName}`);
				}
				typeData.set(fullName, td);
			});
		}
	}
	return typeData;
}

/**
 * Initializes TypeScript projects for the current and previous package versions and loads specific source files.
 * @param typeDefinitionFilePath - The path to the type definition file for the previous version.
 * @param previousBasePath - The path to the root of the previous package version.
 * @param previousPackageName - The name of the previous package version.
 * @returns {{ currentFile: SourceFile, previousFile: SourceFile }} - The loaded source files for the current and previous versions.
 */
export function initializeProjectsAndLoadFiles(
	typeDefinitionFilePath: string,
	previousBasePath: string,
	previousPackageName: string,
) {
	const currentFile = new Project({
		skipFileDependencyResolution: true,
		tsConfigFilePath: "tsconfig.json",
	}).getSourceFileOrThrow("index.ts");

	const previousTsConfigPath = path.join(previousBasePath, "tsconfig.json");
	const project = new Project({
		skipFileDependencyResolution: true,
		tsConfigFilePath: existsSync(previousTsConfigPath) ? previousTsConfigPath : undefined,
	});

	let previousFile: SourceFile;
	// Check for existence of alpha and add appropriate file
	if (existsSync(typeDefinitionFilePath)) {
		project.addSourceFilesAtPaths(typeDefinitionFilePath);
		previousFile = project.getSourceFileOrThrow(`${previousPackageName}-alpha.d.ts`);
		// Fall back to using .d.ts
	} else {
		project.addSourceFilesAtPaths(`${previousBasePath}/dist/**/*.d.ts`);
		previousFile = project.getSourceFileOrThrow("index.d.ts");
	}

	return { currentFile, previousFile };
}

/**
 * Generates compatibility test cases between the previous type definitions and the current type map.
 * This function constructs test cases to validate forward and backward compatibility of types.
 * @param previousData - array of type data from the previous file
 * @param currentTypeMap - map containing curren type data
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

		testString.push(`/*`);
		testString.push(`* Validate forward compat by using old type in place of current type`);
		testString.push(
			`* If breaking change required, add in package.json under typeValidation.broken:`,
		);
		testString.push(`* "${getFullTypeName(currentType)}": {"forwardCompat": false}`);
		testString.push("*/");
		testString.push(...buildTestCase(oldType, currentType, brokenData?.forwardCompat ?? true));

		testString.push("");

		testString.push(`/*`);
		testString.push(`* Validate back compat by using current type in place of old type`);
		testString.push(
			`* If breaking change required, add in package.json under typeValidation.broken:`,
		);
		testString.push(`* "${getFullTypeName(currentType)}": {"backCompat": false}`);
		testString.push("*/");
		testString.push(...buildTestCase(currentType, oldType, brokenData?.backCompat ?? true));
		testString.push("");
	}
	return testString;
}

/**
 * Prepares the file path for type validation tests and skips test generation if disabled in package.json.
 * @param packageObject - the package.json object
 * @returns type validation file path
 */
export function prepareFilepathForTests(packageObject): string {
	const testPath = `./src/test/types`;
	// remove scope if it exists
	const unscopedName = path.basename(packageObject.name);

	const fileBaseName = unscopedName
		.split("-")
		.map((p) => p[0].toUpperCase() + p.substring(1))
		.join("");
	const filePath = `${testPath}/validate${fileBaseName}Previous.generated.ts`;
	return filePath;
}
