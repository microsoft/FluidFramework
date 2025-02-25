/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { realpathSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	type Logger,
	type Package,
	type PackageJson,
	getTypeTestPreviousPackageDetails,
} from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { PackageName } from "@rushstack/node-core-library";
import * as changeCase from "change-case";
import { readJson } from "fs-extra/esm";
import {
	JSDoc,
	ModuleKind,
	type NameableNodeSpecific,
	type NamedNodeSpecificBase,
	Node,
	Project,
	type SourceFile,
	SyntaxKind,
} from "ts-morph";
import { PackageCommand } from "../../BasePackageCommand.js";
import type { PackageSelectionDefault } from "../../flags.js";
import {
	ApiLevel,
	ensureDevDependencyExists,
	knownApiLevels,
	unscopedPackageNameString,
} from "../../library/index.js";
// AB#8118 tracks removing the barrel files and importing directly from the submodules, including disabling this rule.
// eslint-disable-next-line import/no-internal-modules
import { getTypesPathFromPackage } from "../../library/packageExports.js";
// AB#8118 tracks removing the barrel files and importing directly from the submodules, including disabling this rule.
// eslint-disable-next-line import/no-internal-modules
import { type TestCaseTypeData, buildTestCase } from "../../typeValidator/testGeneration.js";
// AB#8118 tracks removing the barrel files and importing directly from the submodules, including disabling this rule.
// eslint-disable-next-line import/no-internal-modules
import type { TypeData } from "../../typeValidator/typeData.js";
import {
	type BrokenCompatTypes,
	type PackageWithTypeTestSettings,
	defaultTypeValidationConfig,
	// AB#8118 tracks removing the barrel files and importing directly from the submodules, including disabling this rule.
	// eslint-disable-next-line import/no-internal-modules
} from "../../typeValidator/typeValidatorConfig.js";

export default class GenerateTypetestsCommand extends PackageCommand<
	typeof GenerateTypetestsCommand
> {
	static readonly description = "Generates type tests for a package or group of packages.";

	static readonly flags = {
		entrypoint: Flags.custom<ApiLevel>({
			// Temporary alias for back-compat
			aliases: ["level"],
			deprecateAliases: true,
			description:
				'What entrypoint to generate tests for. Use "public" for the default entrypoint. If this flag is provided it will override the typeValidation.entrypoint setting in the package\'s package.json.',
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
				"Use the public entrypoint as a fallback if the requested entrypoint is not found.",
			default: false,
		}),
		...PackageCommand.flags,
	} as const;

	protected defaultSelection = "dir" as PackageSelectionDefault;

	protected async processPackage(pkg: Package): Promise<void> {
		const { entrypoint: entrypointFlag, outDir, outFile } = this.flags;
		const pkgJson: PackageWithTypeTestSettings = pkg.packageJson;
		const entrypoint: ApiLevel =
			entrypointFlag ??
			pkgJson.typeValidation?.entrypoint ??
			defaultTypeValidationConfig.entrypoint;
		const fallbackLevel = this.flags.publicFallback ? ApiLevel.public : undefined;

		this.verbose(
			`${pkg.nameColored}: Generating type tests for "${entrypoint}" entrypoint with "${fallbackLevel}" as a fallback.`,
		);

		// Do not check that file exists before opening:
		// Doing so is a time of use vs time of check issue so opening the file could fail anyway.
		// Do not catch error from opening file since the default behavior is fine (exits process with error showing useful message)
		const currentPackageJson: PackageWithTypeTestSettings = pkg.packageJson;

		const { name: previousPackageName, packageJsonPath: previousPackageJsonPath } =
			getTypeTestPreviousPackageDetails(pkg);
		const previousBasePath = path.dirname(previousPackageJsonPath);

		const typeTestOutputFile = getTypeTestFilePath(pkg, outDir, outFile);
		if (currentPackageJson.typeValidation?.disabled === true) {
			this.info(
				`${pkg.nameColored}: Skipping type test generation because typeValidation.disabled is true in package.json`,
			);
			await rm(
				typeTestOutputFile,
				// force means to ignore the error if the file does not exist.
				{ force: true },
			);
			this.verbose(`${pkg.nameColored}: Deleted file: ${typeTestOutputFile}`);

			// Early exit; no error.
			return;
		}

		ensureDevDependencyExists(currentPackageJson, previousPackageName);
		this.verbose(`${pkg.nameColored}: Reading package.json at ${previousPackageJsonPath}`);
		const previousPackageJson = (await readJson(previousPackageJsonPath)) as PackageJson;
		// Set the name in the JSON to the calculated previous package name, since the name in the previous package.json is
		// the same as current. This enables us to pass the package.json object to more general functions but ensure those
		// functions use the correct name. For example, when we write the `import { foo } from <PACKAGE>/internal`
		// statements into the type test file, we need to use the previous version name.
		previousPackageJson.name = previousPackageName;

		const { typesPath: previousTypesPathRelative, entrypointUsed: previousEntrypoint } =
			getTypesPathWithFallback(previousPackageJson, entrypoint, this.logger, fallbackLevel);
		const previousTypesPath = path.resolve(
			path.join(previousBasePath, previousTypesPathRelative),
		);
		this.verbose(
			`Found ${previousEntrypoint} type definitions for ${currentPackageJson.name}: ${previousTypesPath}`,
		);

		const previousFile = loadTypesSourceFile(previousTypesPath);
		this.verbose(
			`${pkg.nameColored}: Loaded source file for previous version (${
				previousPackageJson.version
			}): ${previousFile.getFilePath()}`,
		);

		const typeMap = typeDataFromFile(previousFile, this.logger);

		// Sort import statements to respect linting rules.
		const buildToolsPackageName = "@fluidframework/build-tools";
		const buildToolsImport = `import type { TypeOnly, MinimalType, FullType, requireAssignableTo } from "${buildToolsPackageName}";`;

		// Public API levels are always imported from the primary entrypoint, but everything else is imported from the
		// /internal entrypoint. This is consistent with our policy for code within the repo - all non-public APIs are
		// imported from the /internal entrypoint for consistency
		const previousImport = `import type * as old from "${previousPackageName}${
			previousEntrypoint === ApiLevel.public ? "" : `/${ApiLevel.internal}`
		}";`;
		const imports =
			buildToolsPackageName < previousPackageName
				? [buildToolsImport, previousImport]
				: [previousImport, buildToolsImport];

		const fileHeader: string[] = [
			`/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by flub generate:typetests in @fluid-tools/build-cli.
 */

${imports.join("\n")}

import type * as current from "../../index.js";

declare type MakeUnusedImportErrorsGoAway<T> = TypeOnly<T> | MinimalType<T> | FullType<T> | typeof old | typeof current | requireAssignableTo<true, true>;
`,
		];

		const testCases = generateCompatibilityTestCases(typeMap, currentPackageJson, fileHeader);

		await mkdir(outDir, { recursive: true });

		await writeFile(typeTestOutputFile, testCases.join("\n"));
		this.info(
			`${pkg.nameColored}: Generated type test file: ${path.resolve(typeTestOutputFile)}`,
		);
	}
}

/**
 * Tries to find the path to types for a given API level, falling back to another API level (typically public) if the
 * requested one is not found. The paths returned are relative to the package.
 */
function getTypesPathWithFallback(
	packageJson: PackageJson,
	entrypoint: ApiLevel,
	log: Logger,
	fallbackEntrypoint?: ApiLevel,
): { typesPath: string; entrypointUsed: ApiLevel } {
	let chosenEntrypoint: ApiLevel = entrypoint;
	// First try the requested paths, but fall back to public otherwise if configured.
	let typesPath: string | undefined = getTypesPathFromPackage(packageJson, entrypoint, log);

	if (typesPath === undefined) {
		// Try the public types if configured to do so. If public types are found adjust the level accordingly.
		typesPath =
			fallbackEntrypoint === undefined
				? undefined
				: getTypesPathFromPackage(packageJson, fallbackEntrypoint, log);
		chosenEntrypoint = fallbackEntrypoint ?? entrypoint;
		if (typesPath === undefined) {
			throw new Error(
				`${packageJson.name}: No type definitions found for "${chosenEntrypoint}" API level.`,
			);
		}
	}
	return { typesPath: typesPath, entrypointUsed: chosenEntrypoint };
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
export function typeDataFromFile(
	file: SourceFile,
	log: Logger,
	namespacePrefix?: string,
): Map<string, TypeData> {
	const typeData = new Map<string, TypeData>();
	const exportedDeclarations = file.getExportedDeclarations();

	// Here we capture the exported name, rather than the name of the node.
	// This ensures exports which alias names (ex: export {foo as bad} ...) report the external facing name not the internal one.
	for (const [exportedName, declarations] of exportedDeclarations) {
		for (const declaration of declarations) {
			for (const typeDefinition of getNodeTypeData(
				declaration,
				log,
				addStringScope(namespacePrefix, exportedName),
			)) {
				const fullName = typeDefinition.testCaseName;
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
 * Prefix `node`'s name with `namespacePrefix` to produce a qualified name.
 */
function addScope(
	namespacePrefix: string | undefined,
	node: NameableNodeSpecific | NamedNodeSpecificBase<Node>,
): string {
	const scope = node.getName();
	if (scope === undefined) throw new Error("Missing scope where one was expected");
	return addStringScope(namespacePrefix, scope);
}

/**
 * Prefix `innerName` name with `namespacePrefix` to produce a qualified name.
 */
function addStringScope(namespacePrefix: string | undefined, innerName: string): string {
	const name = namespacePrefix === undefined ? innerName : `${namespacePrefix}.${innerName}`;
	return name;
}

function getNodeTypeData(node: Node, log: Logger, exportedName: string): TypeData[] {
	/*
        handles namespaces e.g.
        export namespace foo{
            export type first: "first";
            export type second: "second";
        }
        this will prefix foo and generate two type data:
        foo.first and foo.second
    */
	if (Node.isModuleDeclaration(node)) {
		const typeData: TypeData[] = [];
		for (const s of node.getStatements()) {
			// only get type data for nodes that are exported from the namespace
			if (Node.isExportable(s) && s.isExported()) {
				typeData.push(...getNodeTypeData(s, log, addScope(exportedName, node)));
			}
		}
		return typeData;
	}

	/*
        handles variable statements: const foo:number=0, bar:number = 0;
        this just grabs the declarations: foo:number=0 and bar:number
        which we can make type data from
    */
	if (Node.isVariableStatement(node)) {
		const typeData: TypeData[] = [];
		for (const dec of node.getDeclarations()) {
			typeData.push(...getNodeTypeData(dec, log, addScope(exportedName, dec)));
		}
		return typeData;
	}

	if (Node.isIdentifier(node)) {
		const typeData: TypeData[] = [];
		for (const definition of node.getDefinitionNodes()) {
			typeData.push(...getNodeTypeData(definition, log, exportedName));
		}
		return typeData;
	}

	if (
		Node.isClassDeclaration(node) ||
		Node.isEnumDeclaration(node) ||
		Node.isInterfaceDeclaration(node) ||
		Node.isTypeAliasDeclaration(node) ||
		Node.isVariableDeclaration(node) ||
		Node.isFunctionDeclaration(node)
	) {
		const docs = Node.isVariableDeclaration(node)
			? node.getFirstAncestorByKindOrThrow(SyntaxKind.VariableStatement).getJsDocs()
			: node.getJsDocs();

		const typeData: TypeData[] = [];

		const dataCommon = {
			name: exportedName,
			node,
			tags: getTags(docs),
		};

		const escapedTypeName = exportedName.replace(/\./g, "_");
		const trimmedKind = node.getKindName().replace(/Declaration/g, "");

		if (
			// Covers instance type of the class (including generics of it)
			Node.isClassDeclaration(node) ||
			Node.isEnumDeclaration(node) ||
			Node.isInterfaceDeclaration(node) ||
			Node.isTypeAliasDeclaration(node)
		) {
			typeData.push({
				...dataCommon,
				useTypeof: false,
				testCaseName: `${trimmedKind}_${escapedTypeName}`,
			});
		}

		if (
			// Covers statics of the class (non-generic)
			Node.isClassDeclaration(node) ||
			Node.isVariableDeclaration(node) ||
			Node.isFunctionDeclaration(node)
		) {
			typeData.push({
				...dataCommon,
				useTypeof: true,
				testCaseName: `${
					Node.isClassDeclaration(node) ? "ClassStatics" : trimmedKind
				}_${escapedTypeName}`,
			});
		}

		return typeData;
	}

	if (Node.isSourceFile(node)) {
		return [...typeDataFromFile(node, log, exportedName).values()];
	}

	throw new Error(`Unknown Export Kind: ${node.getKindName()}`);
}

function getTags(docs: JSDoc[]): ReadonlySet<string> {
	const tags: string[] = [];
	for (const comment of docs) {
		for (const tag of comment.getTags()) {
			const name = tag.getTagName();
			tags.push(name);
		}
	}
	return new Set(tags);
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

	// The typesPath may be a symlink or junction, so resolve the real path
	// before adding it to the project to ensure correct module resolutions.
	const realTypesPath = realpathSync(typesPath);
	const sourceFile = project.addSourceFileAtPath(realTypesPath);
	return sourceFile;
}

/**
 * Generates compatibility test cases using the provided type data to validate forward and backward compatibility of
 * types. The type data is assumed to be from an _older_ version of the types. This function will construct test cases
 * that import the types from both the old/previous version of a package and the current version and use them in place
 * of one another. Failed test cases indicate type incompatibility between versions.
 *
 * @param typeMap - map containing type data to use to generate type tests
 * @param packageObject - package.json object containing type validation settings
 * @param testString - array to store generated test strings
 * @returns - string array representing generated compatibility test cases
 */
export function generateCompatibilityTestCases(
	typeMap: Map<string, TypeData>,
	packageObject: PackageWithTypeTestSettings,
	testString: string[],
): string[] {
	const broken: BrokenCompatTypes = packageObject.typeValidation?.broken ?? {};

	// Convert Map entries to an array and sort by key. This is not strictly needed since Maps are iterated in insertion
	// order, so the type tests should generate in the same order each time. However, explicitly sorting by the test case
	// name is clearer.
	const sortedEntries = [...typeMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

	for (const [testCaseName, typeData] of sortedEntries) {
		const [oldType, currentType]: TestCaseTypeData[] = [
			{
				prefix: "old",
				...typeData,
				removed: false,
			},
			{
				prefix: "current",
				...typeData,
				removed: false,
			},
		];
		const brokenData = broken?.[testCaseName];

		const typePreprocessor = selectTypePreprocessor(currentType);
		if (typePreprocessor !== undefined) {
			if (typeData.tags.has("sealed")) {
				// If the type was `@sealed` then only the code declaring it is allowed to create implementations.
				// This means that the case of having the new (current) version of the type,
				// but trying to implement it based on the old version should not occur and is not a supported usage.
				// This means that adding members to sealed types, as well as making their members have more specific types is allowed as a non-breaking change.
				// This check implements skipping generation of type tests which would flag such changes to sealed types as errors.
			} else if (typeData.useTypeof) {
				// If the type was using typeof treat it like `@sealed`.
				// This assumes adding members to existing variables (and class statics) is non-breaking.
				// This is true in most cases, though there are some edge cases where this assumption is wrong
				// (for example name collisions with inherited statics in subclasses, and explicit use of typeof in user code to define a type which it implements),
				// but overall skipping this case seems preferable to the large amount of false positives keeping it produces.
			} else {
				testString.push(
					`/*`,
					` * Validate forward compatibility by using the old type in place of the current type.`,
					` * If this test starts failing, it indicates a change that is not forward compatible.`,
					` * To acknowledge the breaking change, add the following to package.json under`,
					` * typeValidation.broken:`,
					` * "${currentType.testCaseName}": {"forwardCompat": false}`,
					" */",
					...buildTestCase(
						oldType,
						currentType,
						brokenData?.forwardCompat ?? true,
						typePreprocessor,
					),
					"",
				);
			}
			testString.push(
				`/*`,
				` * Validate backward compatibility by using the current type in place of the old type.`,
				` * If this test starts failing, it indicates a change that is not backward compatible.`,
				` * To acknowledge the breaking change, add the following to package.json under`,
				` * typeValidation.broken:`,
				` * "${currentType.testCaseName}": {"backCompat": false}`,
				" */",
				...buildTestCase(
					currentType,
					oldType,
					brokenData?.backCompat ?? true,
					typePreprocessor,
				),
				"",
			);
		}
	}
	return testString;
}

/**
 * Returns the name of the type preprocessing type meta-function to use, or undefined if no type test should be generated.
 */
function selectTypePreprocessor(typeData: TypeData): string | undefined {
	if (typeData.tags.has("system")) {
		return undefined;
	}
	if (typeData.tags.has("typeTestMinimal")) {
		return "MinimalType";
	}
	if (typeData.tags.has("typeTestFull")) {
		return "FullType";
	}
	return "TypeOnly";
}
