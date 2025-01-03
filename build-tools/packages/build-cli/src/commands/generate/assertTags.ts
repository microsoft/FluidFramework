/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import path from "node:path";
import { Package } from "@fluidframework/build-tools";
import { PackageCommand } from "../../BasePackageCommand.js";
import { PackageKind, type PackageWithKind } from "../../filter.js";

import { Flags } from "@oclif/core";
import {
	NoSubstitutionTemplateLiteral,
	Node,
	NumericLiteral,
	Project,
	SourceFile,
	StringLiteral,
	SyntaxKind,
} from "ts-morph";
import { getFlubConfig } from "../../config.js";

/**
 * Key is the name of the assert function.
 * Value is the index of the augment to tag.
 * @remarks
 * The function names are not handled in a scoped/qualified way, so any function imported or declared with that name will have tagging applied.
 * See also {@link AssertTaggingConfig.assertionFunctions}.
 */
type AssertionFunctions = ReadonlyMap<string, number>;

const defaultAssertionFunctions: AssertionFunctions = new Map([["assert", 1]]);

/**
 * Data aggregated about a collection of packages.
 */
interface CollectedData {
	readonly shortCodes: Map<number, Node>;
	readonly codeToMsgMap: Map<string, string>;
	maxShortCode: number;
}

/**
 * Data about a specific package.
 */
interface PackageData {
	readonly newAssetFiles: ReadonlySet<SourceFile>;
	readonly assertionFunctions: AssertionFunctions;
}

export class TagAssertsCommand extends PackageCommand<typeof TagAssertsCommand> {
	static readonly summary =
		"Tags asserts by replacing their message with a unique numerical value.";

	static readonly description =
		"Tagged asserts are smaller because the message string is not included, and they're easier to aggregate for telemetry purposes.";

	static readonly flags = {
		disableConfig: Flags.boolean({
			default: false,
			description:
				"Disable filtering based on the fluid-build config in the repo. Useful for testing.",
			helpGroup: "TESTING",
		}),
		...PackageCommand.flags,
	};

	protected defaultSelection = undefined;

	// TODO: just use per package config and default (inherited) filtering logic.
	protected async selectAndFilterPackages(): Promise<void> {
		await super.selectAndFilterPackages();

		const context = await this.getContext();
		const { assertTagging } = context.flubConfig;
		const assertTaggingEnabledPaths = this.flags.disableConfig
			? undefined
			: assertTagging?.enabledPaths;

		// Further filter packages based on the path regex
		const before = this.filteredPackages?.length ?? 0;
		this.filteredPackages = this.filteredPackages?.filter((pkg) => {
			const tsconfigPath = context.repo.relativeToRepo(
				path.join(pkg.directory, "tsconfig.json"),
			);

			if (!fs.existsSync(tsconfigPath)) {
				this.verbose(`Skipping '${pkg.name}' because '${tsconfigPath}' doesn't exist.`);
				return false;
			}
			if (assertTaggingEnabledPaths !== undefined) {
				if (assertTaggingEnabledPaths.some((regex) => regex.test(tsconfigPath))) {
					return true;
				}
				this.verbose(
					`Skipping '${pkg.name}' because '${tsconfigPath}' doesn't match configured regexes.`,
				);
				return false;
			}

			return true;
		});

		const after = this.filteredPackages?.length ?? 0;
		const difference = before - after;
		if (difference > 0) {
			this.info(
				`Filtered out ${difference} packages by regex or because they had no tsconfig.`,
			);
		}
	}

	// This should not be used due to processPackages being overridden instead.
	protected override processPackage<TPkg extends Package>(
		pkg: TPkg,
		kind: PackageKind,
	): Promise<void> {
		throw new Error("Method not implemented.");
	}

	protected override async processPackages(packages: PackageWithKind[]): Promise<string[]> {
		const errors: string[] = [];

		const collected: CollectedData = {
			shortCodes: new Map<number, Node>(),
			codeToMsgMap: new Map<string, string>(),
			maxShortCode: -1,
		};

		const dataMap = new Map<PackageWithKind, PackageData>();

		for (const pkg of packages) {
			// Package configuration:
			const tsconfigPath = await this.getTsConfigPath(pkg);
			const packageConfig = getFlubConfig(pkg.directory).assertTagging;
			const assertionFunctions: AssertionFunctions =
				packageConfig?.assertionFunctions === undefined
					? defaultAssertionFunctions
					: new Map<string, number>(Object.entries(packageConfig.assertionFunctions));

			// load the project based on the tsconfig
			const project = new Project({
				skipFileDependencyResolution: true,
				tsConfigFilePath: tsconfigPath,
			});

			const newAssetFiles = this.collectAssertData(
				project,
				assertionFunctions,
				collected,
				errors,
			);
			dataMap.set(pkg, { assertionFunctions, newAssetFiles });
		}

		if (errors.length !== 0) {
			return errors;
		}

		for (const [pkg, data] of dataMap) {
			errors.push(...this.tagAsserts(collected, data));
		}

		writeShortCodeMappingFile(collected.codeToMsgMap);

		return errors;
	}

	private collectAssertData(
		project: Project,
		assertionFunctions: AssertionFunctions,
		collected: CollectedData,
		errors: string[],
	): Set<SourceFile> {
		const templateErrors: Node[] = [];
		const otherErrors: Node[] = [];
		const newAssetFiles = new Set<SourceFile>();

		// walk all the files in the project
		for (const sourceFile of project.getSourceFiles()) {
			// walk the assert message params in the file
			for (const msg of getAssertMessageParams(sourceFile, assertionFunctions)) {
				const nodeKind = msg.getKind();
				switch (nodeKind) {
					// If it's a number, validate it's a shortcode
					case SyntaxKind.NumericLiteral: {
						const numLit = msg as NumericLiteral;
						if (!numLit.getText().startsWith("0x")) {
							errors.push(
								`Shortcodes must be provided by automation and be in hex format: ${numLit.getText()}\n\t${getCallsiteString(
									numLit,
								)}`,
							);
							return newAssetFiles;
						}
						const numLitValue = numLit.getLiteralValue();
						if (collected.shortCodes.has(numLitValue)) {
							// if we find two usages of the same short code then fail
							errors.push(
								`Duplicate shortcode 0x${numLitValue.toString(
									16,
								)} detected\n\t${getCallsiteString(
									// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
									collected.shortCodes.get(numLitValue)!,
								)}\n\t${getCallsiteString(numLit)}`,
							);
							return newAssetFiles;
						}
						collected.shortCodes.set(numLitValue, numLit);
						// calculate the maximun short code to ensure we don't duplicate
						collected.maxShortCode = Math.max(numLitValue, collected.maxShortCode);

						// If comment already exists, extract it for the mapping file
						const comments = msg.getTrailingCommentRanges();
						if (comments.length > 0) {
							let originalErrorText = comments[0]
								.getText()
								.replace(/\/\*/g, "")
								.replace(/\*\//g, "")
								.trim();

							// Replace leading+trailing double quotes and backticks.
							// Only do it if the initial and final characters in the string are the only occurrences of
							// the double quotes / backticks, to avoid messing up comments that use them in a different
							// way. If we clean up the assert comments that have them, this code could go away.
							const shouldRemoveSurroundingQuotes = (input: string): boolean => {
								return (
									(input.startsWith('"') && input.indexOf('"', 1) === input.length - 1) ||
									(input.startsWith("`") && input.indexOf("`", 1) === input.length - 1)
								);
							};

							// eslint-disable-next-line max-depth
							if (shouldRemoveSurroundingQuotes(originalErrorText)) {
								// eslint-disable-next-line unicorn/prefer-string-slice
								originalErrorText = originalErrorText.substring(
									1,
									originalErrorText.length - 1,
								);
							}
							collected.codeToMsgMap.set(numLit.getText(), originalErrorText);
						}
						break;
					}
					// If it's a simple string literal, track the file for replacements later
					case SyntaxKind.StringLiteral:
					case SyntaxKind.NoSubstitutionTemplateLiteral: {
						newAssetFiles.add(sourceFile);
						break;
					}
					// Anything else isn't supported
					case SyntaxKind.TemplateExpression: {
						templateErrors.push(msg);
						break;
					}
					case SyntaxKind.BinaryExpression:
					case SyntaxKind.CallExpression: {
						// TODO: why are CallExpression and BinaryExpression silently allowed?
						break;
					}
					default: {
						otherErrors.push(msg);
						break;
					}
				}
			}
		}

		const errorMessages: string[] = [];
		if (templateErrors.length > 0) {
			errorMessages.push(
				`Template expressions are not supported in assertions (they'll be replaced by a short code anyway). ` +
					`Use a string literal instead.\n${templateErrors
						// eslint-disable-next-line unicorn/no-array-callback-reference
						.map(getCallsiteString)
						.join("\n")}`,
			);
		}
		if (otherErrors.length > 0) {
			errorMessages.push(
				`Unsupported argument kind:\n${otherErrors
					.map((msg) => `${SyntaxKind[msg.getKind()]}: ${getCallsiteString(msg)}`)
					.join("\n")}`,
			);
		}
		if (errorMessages.length > 0) {
			this.error(errorMessages.join("\n\n"), { exit: 1 });
		}

		return newAssetFiles;
	}

	/**
	 * Updates source files, adding new asserts to `collected`.
	 *
	 * @return array of error strings.
	 */
	private tagAsserts(collected: CollectedData, packageData: PackageData): string[] {
		const errors: string[] = [];

		// eslint-disable-next-line unicorn/consistent-function-scoping
		function isStringLiteral(msg: Node): msg is StringLiteral | NoSubstitutionTemplateLiteral {
			const kind = msg.getKind();
			return (
				kind === SyntaxKind.StringLiteral ||
				// eslint-disable-next-line eqeqeq -- TODO: Is this intentional?
				kind == SyntaxKind.NoSubstitutionTemplateLiteral
			);
		}

		// go through all the newly collected asserts and add short codes
		for (const s of packageData.newAssetFiles) {
			// another policy may have changed the file, so reload it
			s.refreshFromFileSystemSync();
			for (const msg of getAssertMessageParams(s, packageData.assertionFunctions)) {
				// here we only want to look at those messages that are strings,
				// as we validated existing short codes above
				if (isStringLiteral(msg)) {
					// for now we don't care about filling gaps, but possible
					const shortCode = ++collected.maxShortCode;
					collected.shortCodes.set(shortCode, msg);
					const text = msg.getLiteralText();
					const shortCodeStr = `0x${shortCode.toString(16).padStart(3, "0")}`;
					// replace the message with shortcode, and put the message in a comment
					msg.replaceWithText(`${shortCodeStr} /* ${text} */`);
					collected.codeToMsgMap.set(shortCodeStr, text);
				}
			}

			s.saveSync();
		}

		return errors;
	}

	private async getTsConfigPath(pkg: Package): Promise<string> {
		const context = await this.getContext();
		const tsconfigPath = context.repo.relativeToRepo(
			path.join(pkg.directory, "tsconfig.json"),
		);
		return tsconfigPath;
	}
}

function getCallsiteString(msg: Node): string {
	// Use filepath:line number so that the error message can be navigated to by clicking on it in vscode.
	return `${msg.getSourceFile().getFilePath()}:${msg.getStartLineNumber()}`;
}

/**
 * Map from assertion function name to the index of its message argument.
 *
 * TODO:
 * This should be moved into a configuration file.
 */

/**
 * Given a source file, this function will look for all assert functions contained in it and return the message parameters.
 * This includes both functions named "assert" and ones named "fail"
 * all the functions which is the message parameter
 * @param sourceFile - The file to get the assert message parameters for.
 * @returns An array of all the assert message parameters
 */
function getAssertMessageParams(
	sourceFile: SourceFile,
	assertionFunctions: ReadonlyMap<string, number>,
): Node[] {
	const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
	const messageArgs: Node[] = [];
	for (const call of calls) {
		const messageIndex = assertionFunctions.get(call.getExpression().getText());
		if (messageIndex !== undefined) {
			const args = call.getArguments();
			if (args.length >= messageIndex && args[messageIndex] !== undefined) {
				const messageArg = args[messageIndex];
				messageArgs.push(messageArg);
			}
		}
	}
	return messageArgs;
}

function writeShortCodeMappingFile(codeToMsgMap: Map<string, string>): void {
	// eslint-disable-next-line unicorn/prefer-spread, @typescript-eslint/no-unsafe-assignment
	const mapContents = Array.from(codeToMsgMap.entries())
		.sort()
		// eslint-disable-next-line unicorn/no-array-reduce
		.reduce((accum, current) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			accum[current[0]] = current[1];
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return accum;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		}, {} as any);
	// TODO: this should come from config.
	const targetFolder = "packages/runtime/test-runtime-utils/src";

	if (!fs.existsSync(targetFolder)) {
		fs.mkdirSync(targetFolder, { recursive: true });
	}

	const fileContents = `/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 *
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY
 */

// Auto-generated by policy-check in @fluidframework/build-tools.

export const shortCodeMap = ${JSON.stringify(mapContents, undefined, "\t")};
`;
	fs.writeFileSync(path.join(targetFolder, "assertionShortCodesMap.ts"), fileContents, {
		encoding: "utf8",
	});
}
