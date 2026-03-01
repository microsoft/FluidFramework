/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Flags } from "@oclif/core";
import { PackageName } from "@rushstack/node-core-library";
import * as changeCase from "change-case";
import { readJson } from "fs-extra/esm";
import { major, minor, patch } from "semver";
import {
	type JSDoc,
	ModuleKind,
	type NameableNodeSpecific,
	type NamedNodeSpecificBase,
	Node,
	Project,
	type SourceFile,
	SyntaxKind,
} from "ts-morph";
import {
	getTypeTestPreviousPackageDetails,
	type Logger,
	type Package,
	type PackageJson,
	TscUtils,
} from "../../../core/index.js";
import { PackageCommand } from "../../BasePackageCommand.js";
import { unscopedPackageNameString } from "../../library/commands/constants.js";
import { ensureDevDependencyExists } from "../../library/package.js";
import { getTypesPathFromPackage } from "../../library/packageExports.js";
import { buildTestCase, type TestCaseTypeData } from "../../typeValidator/testGeneration.js";
import type { TypeData } from "../../typeValidator/typeData.js";
import {
	type BrokenCompatSettings,
	type BrokenCompatTypes,
	defaultTypeValidationConfig,
	type PackageWithTypeTestSettings,
} from "../../typeValidator/typeValidatorConfig.js";

/**
 * Special-cased entry point name to refer to the default (root) entry point of a
 * package, since a "" value might not be clear in many contexts.
 */
const rootEntrypointAlias = "public";

export default class GenerateTypetestsCommand extends PackageCommand<
	typeof GenerateTypetestsCommand
> {
	static readonly description = "Generates type tests for a package or group of packages.";

	static readonly flags = {
		entrypoint: Flags.string({
			description: `What entrypoint to generate tests for. Use "${rootEntrypointAlias}" or "" for the default entrypoint. If this flag is provided it will override the typeValidation.entrypoint setting in the package's package.json.`,
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
				"Use the public entrypoint as a fallback if the requested entrypoint is not found.",
			default: false,
		}),
		skipVersionOutput: Flags.boolean({
			description:
				"Skip updating version information in generated type test files. When set, preserves existing version information instead of updating to current package versions.",
			env: "FLUB_TYPETEST_SKIP_VERSION_OUTPUT",
			default: false,
		}),
		...PackageCommand.flags,
	} as const;

	protected defaultSelection = "dir" as const;

	protected async processPackage(pkg: Package): Promise<void> {
		const { entrypoint: entrypointFlag, outDir, outFile, skipVersionOutput } = this.flags;
		const pkgJson: PackageWithTypeTestSettings = pkg.packageJson;
		const entrypoint =
			entrypointFlag ??
			pkgJson.typeValidation?.entrypoint ??
			defaultTypeValidationConfig.entrypoint;
		const fallbackLevel = this.flags.publicFallback ? rootEntrypointAlias : undefined;

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

		// Note this assumes that tsconfig found includes test output file, but
		// does not do any check to confirm that.
		const conditions = getCustomConditionsFromTsConfig(
			path.dirname(typeTestOutputFile),
			this.logger,
		);

		const { typesPath: previousTypesPathRelative, entrypointSpec } = getTypesPathWithFallback(
			previousPackageJson,
			entrypoint,
			conditions,
			this.logger,
			fallbackLevel,
		);
		const previousTypesPath = path.resolve(
			path.join(previousBasePath, previousTypesPathRelative),
		);
		this.verbose(
			`Found ${entrypointSpec} type definitions for ${currentPackageJson.name}: ${previousTypesPath}`,
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

		const previousImport = `import type * as old from "${previousPackageName}${entrypointSpec}";`;
		const imports =
			buildToolsPackageName < previousPackageName
				? [buildToolsImport, previousImport]
				: [previousImport, buildToolsImport];

		// Remove pre-release/metadata from the current version (e.g., "1.2.3-foo" -> "1.2.3")
		const currentVersionBase = `${major(currentPackageJson.version)}.${minor(currentPackageJson.version)}.${patch(currentPackageJson.version)}`;

		// Check if we should skip version output and use existing versions
		let previousVersionToUse = previousPackageJson.version;
		let currentVersionToUse = currentVersionBase;

		if (skipVersionOutput) {
			const existingVersions = readExistingVersions(typeTestOutputFile);
			if (existingVersions === undefined) {
				this.verbose(
					`${pkg.nameColored}: skipVersionOutput is set but no existing file found, using current versions`,
				);
			} else {
				previousVersionToUse = existingVersions.previousVersion;
				currentVersionToUse = existingVersions.currentVersion;
				this.verbose(
					`${pkg.nameColored}: Using existing versions from file: previous=${previousVersionToUse}, current=${currentVersionToUse}`,
				);
			}
		}

		// Args are great to specify in generated header, but complex filtering is
		// needed when there are multiple commands that might generate the same file.
		// For now, omit them from the header when the command might be used in
		// multiple generation commands.
		// This is only a heuristic.
		const argsForHeader =
			// 'dir' is used in default package typetest generation and distinguishes
			// it as case when batch generation might be used.
			this.flags.dir === undefined &&
			!this.flags.all &&
			!this.flags.packages &&
			this.flags.releaseGroup === undefined &&
			this.flags.releaseGroupRoot === undefined &&
			this.flags.scope === undefined &&
			this.flags.skipScope === undefined
				? this.commandLineArgs()
				: "";
		const fileHeader: string[] = [
			`/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by "flub generate typetests${argsForHeader}" from @fluid-tools/build-cli.
 *
 * Baseline (previous) version: ${previousVersionToUse}
 */

${imports.join("\n")}

import type * as current from "${currentPackageJson.name}${entrypointSpec}";

declare type MakeUnusedImportErrorsGoAway<T> = TypeOnly<T> | MinimalType<T> | FullType<T> | typeof old | typeof current | requireAssignableTo<true, true>;
`,
		];

		const testCases = generateCompatibilityTestCases(typeMap, currentPackageJson);
		const output = [...fileHeader, ...testCases].join("\n");

		await mkdir(outDir, { recursive: true });

		await writeFile(typeTestOutputFile, output);
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
	entrypoint: string,
	conditions: readonly string[],
	log: Logger,
	fallbackEntrypoint?: typeof rootEntrypointAlias,
): { typesPath: string; entrypointSpec: string } {
	// The entrypoint spec is the suffix added to the package name in the import statement.
	// For example, if entrypoint is "beta" then the import would be from "<PACKAGE>/beta"
	// and the entrypointSpec would be "/beta".
	// If entrypoint is "" or rootEntrypointAlias ("public") then the import would be from
	// "<PACKAGE>" and the entrypointSpec would be "".
	const entrypointSpec =
		entrypoint === rootEntrypointAlias ? "" : entrypoint ? `/${entrypoint}` : "";
	// First try the requested paths, but fall back to public otherwise if configured.
	const preferredTypesPath = getTypesPathFromPackage(
		packageJson,
		entrypointSpec,
		conditions,
		log,
	);
	if (preferredTypesPath !== undefined) {
		return { typesPath: preferredTypesPath, entrypointSpec };
	}

	if (fallbackEntrypoint === undefined || entrypointSpec === "") {
		// No fallback or public already checked.
		throw new Error(
			`${packageJson.name}: No type definitions found for "${entrypoint}" entrypoint.`,
		);
	}

	// Try the public types since configured to do so.
	const publicTypesPath = getTypesPathFromPackage(packageJson, "", conditions, log);
	if (publicTypesPath !== undefined) {
		return { typesPath: publicTypesPath, entrypointSpec: "" };
	}

	throw new Error(
		`${packageJson.name}: No type definitions found for "${entrypoint}" or "" (public) entrypoints.`,
	);
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
 * Reads the tsconfig.json that covers files in the given directory and extracts
 * any `customConditions` from the resolved compiler options.
 *
 * @param directory - The directory to search from for a tsconfig.json.
 * @param log - A logger to use.
 * @returns The customConditions array from the resolved tsconfig, or an empty array if none found.
 */
function getCustomConditionsFromTsConfig(directory: string, log: Logger): string[] {
	const tscUtils = TscUtils.getTscUtils(directory);
	const tsLib = tscUtils.tsLib;

	const configFile = tsLib.findConfigFile(directory, tsLib.sys.fileExists);
	if (configFile === undefined) {
		log.verbose(`No TS config found from ${directory}`);
		return [];
	}

	const configFileContent = tscUtils.readConfigFile(configFile);
	if (configFileContent === undefined) {
		log.verbose(`Error reading TS config at ${configFile}`);
		return [];
	}

	const parsedConfig = tsLib.parseJsonConfigFileContent(
		configFileContent,
		tsLib.sys,
		path.dirname(configFile),
		/* existingOptions */ undefined,
		configFile,
	);

	const conditions = parsedConfig.options.customConditions ?? [];
	if (conditions.length > 0) {
		log.verbose(`Found customConditions in ${configFile}: ${conditions.join(", ")}`);
	}
	return conditions;
}

/**
 * Reads the existing version information from a generated type test file.
 *
 * @param filePath - The path to the generated type test file.
 * @returns An object with previousVersion and currentVersion if found, otherwise undefined.
 */
export function readExistingVersions(
	filePath: string,
): { previousVersion: string; currentVersion: string } | undefined {
	if (!existsSync(filePath)) {
		return undefined;
	}

	try {
		const content = readFileSync(filePath, "utf8");
		const previousVersionRegex = /Baseline \(previous\) version: (.+)/;
		const currentVersionRegex = /Current version: (.+)/;
		const previousVersionMatch = previousVersionRegex.exec(content);
		const currentVersionMatch = currentVersionRegex.exec(content);

		if (previousVersionMatch && currentVersionMatch) {
			return {
				previousVersion: previousVersionMatch[1].trim(),
				currentVersion: currentVersionMatch[1].trim(),
			};
		}
	} catch {
		// If we can't read the file, return undefined
	}

	return undefined;
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

		const escapedTypeName = exportedName.replaceAll(".", "_");
		const trimmedKind = node.getKindName().replaceAll("Declaration", "");

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
 * @returns - string array representing generated compatibility test cases
 */
export function generateCompatibilityTestCases(
	typeMap: Map<string, TypeData>,
	packageObject: PackageWithTypeTestSettings,
): string[] {
	const testString: string[] = [];
	const broken: BrokenCompatTypes = packageObject.typeValidation?.broken ?? {};

	// Convert Map entries to an array and sort by key. This is not strictly needed since Maps are iterated in insertion
	// order, so the type tests should generate in the same order each time. However, explicitly sorting by the test case
	// name is clearer.
	const sortedEntries = [...typeMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

	for (const [testCaseName, typeData] of sortedEntries) {
		testString.push(...generateCompatibilityTestCase(typeData, broken[testCaseName]));
	}
	return testString;
}

/**
 * Internals of {@link generateCompatibilityTestCases} for a single type.
 *
 * @param typeData - The type to test.
 * @param brokenData - Expected broken compatibilities, if any.
 * @returns Lines of TypeScript code that make up the compatibility test.
 */
export function generateCompatibilityTestCase(
	typeData: TypeData,
	brokenData: BrokenCompatSettings | undefined,
): string[] {
	const testString: string[] = [];

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
		if (typeData.tags.has("input")) {
			// If the type was `@input` then only the code declaring it is allowed to read from it.
			// This means that as long as the old value of the type is assignable to the new (current) version, it is allowed.
			// That case is covered above: skip this case where new type is assigned to the old.
		} else {
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
function selectTypePreprocessor(typeData: Omit<TypeData, "node">): string | undefined {
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
