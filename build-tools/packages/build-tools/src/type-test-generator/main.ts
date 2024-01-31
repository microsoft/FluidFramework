/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readJsonSync } from "fs-extra";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Project, SourceFile } from "ts-morph";
import { BrokenCompatTypes } from "../common/fluidRepo";
import { PackageJson } from "../common/npmPackage";
import { buildTestCase, TestCaseTypeData } from "../typeValidator/testGeneration";
import { getFullTypeName, getNodeTypeData, TypeData } from "../typeValidator/typeData";
import { typeOnly } from "./compatibility";
import { ExtractorConfig } from "@microsoft/api-extractor";

// Do not check that file exists before opening:
// Doing so is a time of use vs time of check issue so opening the file could fail anyway.
// Do not catch error from opening file since the default behavior is fine (exits process with error showing useful message)
const packageObject: PackageJson = readJsonSync("package.json");
const previousPackageName = `${packageObject.name}-previous`;

const previousBasePath = `./node_modules/${previousPackageName}`;

const previousPackageJsonPath = `${previousBasePath}/package.json`;

if (!existsSync(previousPackageJsonPath)) {
	throw new Error(
		`${previousPackageJsonPath} not found. You may need to install the package via pnpm install. Note that type tests logic looks specifically for a package named '${previousPackageName}'`,
	);
}
const typeRollupFilePath = ExtractorConfig.tryLoadForFolder({
	startingFolder: previousBasePath,
});

/**
 * Extracts the type definition file path from the 'exports' field of a given package.json.
 * Checks both 'import' and 'require' resolution methods to find the appropriate path.
 * If the path is found, it is returned. Otherwise, an error is thrown.
 * @param previousPackageJson
 * @returns string - A type definition filepath based on the appropriate export.
 */
function getTypePathsFromExport(previousPackageJson: PackageJson): string {
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
			`Type definition file path could not be determined from the 'exports' field of '${previousPackageJsonPath}' using the default export entry '.'`,
		);
	}
	return typeDefinitionFilePath;
}
let typeDefinitionFilePath;

// Check if a specified typeRollupFile exists
if (typeRollupFilePath) {
	typeDefinitionFilePath = typeRollupFilePath;
} else {
	// Try to read the 'types' field from the package.json of the previous package
	const previousPackageJson: PackageJson = readJsonSync(previousPackageJsonPath);
	if (previousPackageJson.types) {
		typeDefinitionFilePath = path.join(previousBasePath, previousPackageJson.types);
		// Check the exports entries
	} else if (previousPackageJson.exports) {
		typeDefinitionFilePath = getTypePathsFromExport(previousPackageJson);
	} else {
		throw new Error(
			`Type definition file path could not be determined from '${previousPackageJsonPath}'. No 'exports' nor 'type' fields found.`,
		);
	}
}
const testPath = `./src/test/types`;
// remove scope if it exists
const unscopedName = path.basename(packageObject.name);

const fileBaseName = unscopedName
	.split("-")
	.map((p) => p[0].toUpperCase() + p.substring(1))
	.join("");
const filePath = `${testPath}/validate${fileBaseName}Previous.generated.ts`;

if (packageObject.typeValidation?.disabled) {
	console.log("skipping type test generation because they are disabled in package.json");
	// force means to ignore the error if the file does not exist.
	rmSync(filePath, { force: true });
	process.exit(0);
}

{
	// Information about the previous package from the package.json is not needed,
	// but error if its missing since it's nice to separate errors for the dep missing here vs not installed.
	const previousDep = packageObject?.devDependencies?.[previousPackageName];
	if (typeof previousDep !== "string") {
		throw new Error(`Did not find devDependency ${previousPackageName} in package.json`);
	}
}

const broken: BrokenCompatTypes = packageObject.typeValidation?.broken ?? {};

if (!existsSync(`${previousBasePath}/package.json`)) {
	throw new Error(
		`${previousBasePath} not found. You may need to install the package via pnpm install.`,
	);
}

const currentFile = new Project({
	skipFileDependencyResolution: true,
	tsConfigFilePath: "tsconfig.json",
}).getSourceFileOrThrow("index.ts");

const previousTsConfigPath = `${previousBasePath}/tsconfig.json`;
let previousFile: SourceFile;
const project = new Project({
	skipFileDependencyResolution: true,
	tsConfigFilePath: existsSync(previousTsConfigPath) ? previousTsConfigPath : undefined,
});
// Check for existence of alpha and add appropriate file
if (existsSync(typeDefinitionFilePath)) {
	project.addSourceFilesAtPaths(typeDefinitionFilePath);
	previousFile = project.getSourceFileOrThrow(`${previousPackageName}-alpha.d.ts`);
	// Fall back to using .d.ts
} else {
	project.addSourceFilesAtPaths(`${previousBasePath}/dist/**/*.d.ts`);
	previousFile = project.getSourceFileOrThrow("index.d.ts");
}

/**
 * Extracts type data from a TS source file and creates a map where each key is a type name and the value is its type data.
 * @param file - The source code file containing type data
 * @returns The mapping between item and its type
 */
function typeDataFromFile(file: SourceFile): Map<string, TypeData> {
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

const currentTypeMap = typeDataFromFile(currentFile);
const previousData = [...typeDataFromFile(previousFile).values()];

function compareString(a: string, b: string): number {
	return a > b ? 1 : a < b ? -1 : 0;
}

previousData.sort((a, b) => compareString(a.name, b.name));

const testString: string[] = [
	`/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by fluid-type-test-generator in @fluidframework/build-tools.
 */
import type * as old from "${previousPackageName}";
import type * as current from "../../index";
`,
	typeOnly,
];

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

mkdirSync("./src/test/types", { recursive: true });

writeFileSync(filePath, testString.join("\n"));
console.log(`generated ${path.resolve(filePath)}`);
