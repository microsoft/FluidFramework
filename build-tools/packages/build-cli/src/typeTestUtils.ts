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
import { Project, SourceFile } from "ts-morph";

/**
 * Extracts type data from a TS source file and creates a map where each key is a type name and the value is its type
 * data.
 *
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
 * @param basePath - The path to the current version of the package.
 * @param typesPath - The path to the types file to load. This path is expected to be relative to
 * @returns The loaded source file.
 */
export function loadTypesSourceFile(basePath: string, typesPath: string): SourceFile {
	// We assume the tsconfig is included in the package published to npm, so we load using its settings. Then we manually
	// add all type definitions, and finally retrieve the one matching the API level we're using.
	const tsconfigPath = path.join(basePath, "tsconfig.json");
	const project = new Project({
		skipFileDependencyResolution: true,
		tsConfigFilePath: tsconfigPath,
	});
	project.addSourceFilesAtPaths(`${path.dirname(typesPath)}/**/*.d.ts`);
	const sourceFile = project.getSourceFileOrThrow(path.basename(typesPath));

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
