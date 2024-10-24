/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import path from "node:path";
import {
	NoSubstitutionTemplateLiteral,
	Node,
	NumericLiteral,
	Project,
	SourceFile,
	StringLiteral,
	SyntaxKind,
} from "ts-morph";

import { Handler } from "./common.js";

const shortCodes = new Map<number, Node>();
const newAssetFiles = new Set<SourceFile>();
const codeToMsgMap = new Map<string, string>();
let maxShortCode = -1;

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
const assertionFunctions: ReadonlyMap<string, number> = new Map([["assert", 1]]);

/**
 * Given a source file, this function will look for all assert functions contained in it and return the message parameters.
 * This includes both functions named "assert" and ones named "fail"
 * all the functions which is the message parameter
 * @param sourceFile - The file to get the assert message parameters for.
 * @returns An array of all the assert message parameters
 */
function getAssertMessageParams(sourceFile: SourceFile): Node[] {
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

export const handler: Handler = {
	name: "assert-short-codes",
	match:
		/^(packages|experimental|(common\/lib\/common-utils)|(server\/routerlicious\/packages\/protocol-base)).*\/tsconfig\.json/i,
	handler: async (tsconfigPath) => {
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
			for (const msg of getAssertMessageParams(sourceFile)) {
				const nodeKind = msg.getKind();
				switch (nodeKind) {
					// If it's a number, validate it's a shortcode
					case SyntaxKind.NumericLiteral: {
						const numLit = msg as NumericLiteral;
						if (!numLit.getText().startsWith("0x")) {
							return `Shortcodes must be provided by automation and be in hex format: ${numLit.getText()}\n\t${getCallsiteString(
								numLit,
							)}`;
						}
						const numLitValue = numLit.getLiteralValue();
						if (shortCodes.has(numLitValue)) {
							// if we find two usages of the same short code then fail
							return `Duplicate shortcode 0x${numLitValue.toString(
								16,
							)} detected\n\t${getCallsiteString(
								// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
								shortCodes.get(numLitValue)!,
							)}\n\t${getCallsiteString(numLit)}`;
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
					// eslint-disable-next-line unicorn/no-array-callback-reference
					`Use a string literal instead.\n${templateErrors.map(getCallsiteString).join("\n")}`,
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
			// eslint-disable-next-line unicorn/error-message
			throw new Error(errorMessages.join("\n\n"));
		}
	},
	final: (root, resolve) => {
		const errors: string[] = [];

		// eslint-disable-next-line unicorn/consistent-function-scoping
		function isStringLiteral(msg: Node): msg is StringLiteral | NoSubstitutionTemplateLiteral {
			const kind = msg.getKind();
			return (
				kind === SyntaxKind.StringLiteral || kind === SyntaxKind.NoSubstitutionTemplateLiteral
			);
		}

		// go through all the newly collected asserts and add short codes
		for (const s of newAssetFiles) {
			// another policy may have changed the file, so reload it
			s.refreshFromFileSystemSync();
			for (const msg of getAssertMessageParams(s)) {
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
		const result = errors.length > 0 ? { error: errors.join("\n") } : undefined;
		if (resolve) {
			writeShortCodeMappingFile();
		}
		return result;
	},
};

function writeShortCodeMappingFile(): void {
	const mapContents = [...codeToMsgMap.entries()]
		.sort()
		// eslint-disable-next-line unicorn/no-array-reduce
		.reduce<Record<string, string>>((accum, current) => {
			accum[current[0]] = current[1];
			return accum;
		}, {});
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
