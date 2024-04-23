/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import {
	type BrokenCompatTypes,
	type PackageJson,
	type TestCaseTypeData,
	type TypeData,
	buildTestCase,
	getFullTypeName,
	getNodeTypeData,
} from "@fluidframework/build-tools";
import { PackageName } from "@rushstack/node-core-library";
import { Project, SourceFile } from "ts-morph";

/**
 * The path to the test types directory
 */
const typeTestFilePath = "./src/test/types";

/**
 * Checks the package object to verify that the specified dependency exists
 * @param packageObject - the package.json object to check for the dependency
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
	if (dependencyVersion === undefined) {
		throw new Error(`Did not find devDependency in package.json`);
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
		for (const declaration of declarations) {
			for (const typeDefinition of getNodeTypeData(declaration)) {
				const fullName = getFullTypeName(typeDefinition);
				if (typeData.has(fullName)) {
					// This system does not properly handle overloads: instead it only keeps the last signature.
					console.warn(`skipping overload for ${fullName}`);
				}
				typeData.set(fullName, typeDefinition);
			}
		}
	}
	return typeData;
}

/**
 * Initializes TypeScript projects for the current and previous package versions and loads specific source files.
 * @param typeDefinitionFilePath - The path to the type definition file for the previous version.
 * @param previousBasePath - The path to the root of the previous package version.
 * @param previousPackageName - The name of the previous package version.
 * @returns The loaded source files for the current and previous versions.
 */
export function initializeProjectsAndLoadFiles(
	previousTypeDefs: string,
	previousBasePath: string,
): { currentFile: SourceFile; previousFile: SourceFile } {
	const currentFile = new Project({
		skipFileDependencyResolution: true,
		tsConfigFilePath: "tsconfig.json",
	}).getSourceFileOrThrow("index.ts");

	const previousTsConfigPath = path.join(previousBasePath, "tsconfig.json");
	const project = new Project({
		skipFileDependencyResolution: true,
		tsConfigFilePath: previousTsConfigPath,
	});

	project.addSourceFilesAtPaths(`${path.dirname(previousTypeDefs)}/**/*.d.ts`);
	const previousFile = project.getSourceFileOrThrow(path.basename(previousTypeDefs));

	return { currentFile, previousFile };
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
			`* Validate forward compat by using old type in place of current type`,
			`* If breaking change required, add in package.json under typeValidation.broken:`,
			`* "${getFullTypeName(currentType)}": {"forwardCompat": false}`,
			"*/",
			...buildTestCase(oldType, currentType, brokenData?.forwardCompat ?? true),
			"",
			`/*`,
			`* Validate back compat by using current type in place of old type`,
			`* If breaking change required, add in package.json under typeValidation.broken:`,
			`* "${getFullTypeName(currentType)}": {"backCompat": false}`,
			"*/",
			...buildTestCase(currentType, oldType, brokenData?.backCompat ?? true),
			"",
		);
	}
	return testString;
}

/**
 * Prepares the file path for type validation tests and skips test generation if disabled in package.json.
 * @param packageObject - the package.json object
 * @returns type validation file path
 */
export function getTypeTestFilePath(packageObject: PackageJson): string {
	const testPath = typeTestFilePath;
	// remove scope if it exists
	const unscopedName = PackageName.getUnscopedName(packageObject.name);

	const fileBaseName = formatFileBaseName(unscopedName);

	const filePath = `${testPath}/validate${fileBaseName}Previous.generated.ts`;
	return filePath;
}

/**
 * Formats the file base name based on the package name
 * @param packageName - the package name
 * @returns the formatted file base name
 */
function formatFileBaseName(packageName: string): string {
	return packageName
		.split("-")
		.map((p) => p[0].toUpperCase() + p.slice(1))
		.join("");
}
