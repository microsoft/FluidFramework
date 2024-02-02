/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readJsonSync } from "fs-extra";
import path from "node:path";
import { Project, SourceFile } from "ts-morph";
import { BrokenCompatTypes } from "../common/fluidRepo";
import { PackageJson } from "../common/npmPackage";
import { buildTestCase, TestCaseTypeData } from "../typeValidator/testGeneration";
import { getFullTypeName, getNodeTypeData, TypeData } from "../typeValidator/typeData";
import { ExtractorConfig } from "@microsoft/api-extractor";


// Do not check that file exists before opening:
// Doing so is a time of use vs time of check issue so opening the file could fail anyway.
// Do not catch error from opening file since the default behavior is fine (exits process with error showing useful message)
const packageObject: PackageJson = readJsonSync("package.json");
const previousPackageName = `${packageObject.name}-previous`;
const previousBasePath = path.join("node_modules", previousPackageName);

export function getPreviousPackageJsonPath(): string {
	return `${previousBasePath}/package.json`;
}


/**
 * Attempts to retrieve  a specified type of rollup file path for type definitions from the API Extractor configuration.
 * @param {string} rollupType - The type of rollup file path to retrieve (ex: "alpha", "beta", "public").
 * @returns {string} The path to the alpha trimmed type definitions file.
 * @throws {Error} If api-extractor config cannot be loaded or if the alpha trimmed file path is undefined
 */
export function getTypeRollupPathFromExtractorConfig(
	rollupType: "alpha" | "beta" | "public" | "untrimmed",
): string | undefined {
	try {
		//Load the api-extractor
		const extractorConfigOptions = ExtractorConfig.tryLoadForFolder({
			startingFolder: previousBasePath,
		});
		if (!extractorConfigOptions || !extractorConfigOptions.configObjectFullPath) {
			console.warn(
				"API Extractor configuration not found. Falling back to default behavior.",
			);
			return undefined;
		}
		const apiExtractorConfigPath = extractorConfigOptions.configObjectFullPath;
		const apiExtractorConfig = readJsonSync(extractorConfigOptions.configObjectFullPath);
		// Resolve the api-extractor-base file path
		const baseConfigPath = path.resolve(
			path.dirname(apiExtractorConfigPath),
			apiExtractorConfig.extends,
		);
		const baseConfig = readJsonSync(baseConfigPath);
		const rollupPath = baseConfig.dtsRollup[`${rollupType}TrimmedFilePath`];
		if (!rollupPath) {
			console.warn(`Rollup path for "${rollupType}" not found.`);
			return undefined;
		}
		return rollupPath;
	} catch (error) {
		console.error(`Error loading API Extractor configuration: ${error}`);
		return undefined;
	}
}

/**
 * Extracts the type definition file path from the 'exports' field of a given package.json.
 * Checks both 'import' and 'require' resolution methods to find the appropriate path.
 * If the path is found, it is returned. Otherwise, an error is thrown.
 * @param previousPackageJson
 * @returns string - A type definition filepath based on the appropriate export.
 */
export function getTypePathFromExport(previousPackageJson: PackageJson): string {
	if (!previousPackageJson.exports) {
		throw new Error("The 'exports' field is missing in the package.json.");
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
			`Type definition file path could not be determined from the 'exports' field of '${getPreviousPackageJsonPath()}' using the default export entry '.'`,
		);
	}
	return typeDefinitionFilePath;
}

export function checkExportsAndTypes(): string {
	const previousPackageJson: PackageJson = readJsonSync(getPreviousPackageJsonPath());
	// Check the exports entries
	if (previousPackageJson.exports) {
		return getTypePathFromExport(previousPackageJson);
		// Check the types field from the previous package.json as a fallback
	} else if (previousPackageJson.types) {
		return path.join(previousBasePath, previousPackageJson.types);
	} else {
		throw new Error(
			`Type definition file path could not be determined from '${getPreviousPackageJsonPath()}'. No 'exports' nor 'type' fields found.`,
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


export function generateCompatibilityTestCases(testString: string[], previousData: TypeData[], currentTypeMap: Map<string, TypeData>): string[] {
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