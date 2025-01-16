/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { Package } from "@fluidframework/build-tools";
import { PackageCommand } from "../../BasePackageCommand.js";
import { PackageKind } from "../../filter.js";

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

const shortCodes = new Map<number, Node>();
const newAssetFiles = new Set<SourceFile>();
const codeToMsgMap = new Map<string, string>();
let maxShortCode = -1;

const defaultAssertionFunctions: ReadonlyMap<string, number> = new Map([["assert", 1]]);

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

	private assertionFunctions: ReadonlyMap<string, number> | undefined;
	private readonly errors: string[] = [];

	protected async selectAndFilterPackages(): Promise<void> {
		await super.selectAndFilterPackages();

		const context = await this.getContext();
		const { assertTagging } = context.flubConfig;
		const assertTaggingEnabledPaths = this.flags.disableConfig
			? undefined
			: assertTagging?.enabledPaths;

		this.assertionFunctions =
			assertTagging?.assertionFunctions === undefined
				? defaultAssertionFunctions
				: new Map<string, number>(Object.entries(assertTagging.assertionFunctions));

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
				if (assertTaggingEnabledPaths.some((regex) => new RegExp(regex).test(tsconfigPath))) {
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

	protected async processPackage<TPkg extends Package>(
		pkg: TPkg,
		kind: PackageKind,
	): Promise<void> {
		const tsconfigPath = await this.getTsConfigPath(pkg);
		this.collectAssertData(tsconfigPath);
	}

	public async run(): Promise<void> {
		// Calls processPackage on all packages to collect assert data.
		await super.run();

		// Tag asserts based on earlier collected data.
		this.tagAsserts(true);
	}

	private collectAssertData(tsconfigPath: string): void {
		// TODO: this can probably be removed now
		if (tsconfigPath.includes("test")) {
			return;
		}

		// load the project based on the tsconfig
		const project = new Project({
			skipFileDependencyResolution: true,
			tsConfigFilePath: tsconfigPath,
		});

		const templateErrors: Node[] = [];
		const otherErrors: Node[] = [];

		// walk all the files in the project
		for (const sourceFile of project.getSourceFiles()) {
			// walk the assert message params in the file
			assert(this.assertionFunctions !== undefined, "No assert functions are defined!");
			for (const msg of getAssertMessageParams(sourceFile, this.assertionFunctions)) {
				const nodeKind = msg.getKind();
				switch (nodeKind) {
					// If it's a number, validate it's a shortcode
					case SyntaxKind.NumericLiteral: {
						const numLit = msg as NumericLiteral;
						if (!numLit.getText().startsWith("0x")) {
							this.errors.push(
								`Shortcodes must be provided by automation and be in hex format: ${numLit.getText()}\n\t${getCallsiteString(
									numLit,
								)}`,
							);
							return;
						}
						const numLitValue = numLit.getLiteralValue();
						if (shortCodes.has(numLitValue)) {
							// if we find two usages of the same short code then fail
							this.errors.push(
								`Duplicate shortcode 0x${numLitValue.toString(
									16,
								)} detected\n\t${getCallsiteString(
									// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
									shortCodes.get(numLitValue)!,
								)}\n\t${getCallsiteString(numLit)}`,
							);
							return;
						}
						shortCodes.set(numLitValue, numLit);
						// calculate the maximun short code to ensure we don't duplicate
						maxShortCode = Math.max(numLitValue, maxShortCode);

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
							codeToMsgMap.set(numLit.getText(), originalErrorText);
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
	}

	// TODO: the resolve = true may be safe to remove since we always want to resolve when running this command
	private tagAsserts(resolve: true): void {
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
		for (const s of newAssetFiles) {
			// another policy may have changed the file, so reload it
			s.refreshFromFileSystemSync();
			assert(this.assertionFunctions !== undefined, "No assert functions are defined!");
			for (const msg of getAssertMessageParams(s, this.assertionFunctions)) {
				// here we only want to look at those messages that are strings,
				// as we validated existing short codes above
				if (isStringLiteral(msg)) {
					// resolve === fix
					if (resolve) {
						// for now we don't care about filling gaps, but possible
						const shortCode = ++maxShortCode;
						shortCodes.set(shortCode, msg);
						const text = msg.getLiteralText();
						const shortCodeStr = `0x${shortCode.toString(16).padStart(3, "0")}`;
						// replace the message with shortcode, and put the message in a comment
						msg.replaceWithText(`${shortCodeStr} /* ${text} */`);
						codeToMsgMap.set(shortCodeStr, text);
					} else {
						// TODO: if we are not in resolve mode we
						// allow  messages that are not short code. this seems like the right
						// behavior for main. we may want to enforce shortcodes in release branches in the future
						// errors.push(`no assert shortcode: ${getCallsiteString(msg)}`);
						break;
					}
				}
			}
			if (resolve) {
				s.saveSync();
			}
		}

		if (resolve) {
			writeShortCodeMappingFile();
		}
		if (errors.length > 0) {
			this.error(errors.join("\n"), { exit: 1 });
		}
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

function writeShortCodeMappingFile(): void {
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
