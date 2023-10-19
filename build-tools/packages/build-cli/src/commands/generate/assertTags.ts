/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { PackageCommand } from "../../BasePackageCommand";
import { Package, getFluidBuildConfig } from "@fluidframework/build-tools";
import { PackageKind } from "../../filter";
import {
	NoSubstitutionTemplateLiteral,
	Node,
	NumericLiteral,
	Project,
	SourceFile,
	StringLiteral,
	SyntaxKind,
} from "ts-morph";
import { Flags } from "@oclif/core";

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

	private assertionFunctions: ReadonlyMap<string, number> | undefined;
	private readonly errors: string[] = [];

	protected async selectAndFilterPackages(): Promise<void> {
		await super.selectAndFilterPackages();

		const context = await this.getContext();
		const { assertTagging } = getFluidBuildConfig(context.gitRepo.resolvedRoot);
		this.setAssertionFunctionsBasedOnConfig(assertTagging);

		// Further filter packages based on the path regex
		this.filterPackagesBasedOnConfig(context, assertTagging?.enabledPaths);
	}

	private setAssertionFunctionsBasedOnConfig(assertTagging: any): void {
		this.assertionFunctions =
			assertTagging?.assertionFunctions === undefined
				? defaultAssertionFunctions
				: new Map<string, number>(Object.entries(assertTagging.assertionFunctions));
	}

	private filterPackagesBasedOnConfig(context: any, assertTaggingEnabledPaths?: string[]): void {
		// Further filter packages based on the path regex
		const before = this.filteredPackages?.length ?? 0;
		this.filteredPackages = this.filteredPackages?.filter((pkg) =>
			this.packageFilterHelper(context, pkg, assertTaggingEnabledPaths),
		);

		const difference = before - (this.filteredPackages?.length ?? 0);
		if (difference > 0) {
			this.info(
				`Filtered out ${difference} packages by regex or because they had no tsconfig.`,
			);
		}
	}

	private packageFilterHelper(
		context: any,
		pkg: Package,
		assertTaggingEnabledPaths?: string[],
	): boolean {
		const tsconfigPath = this.getRelativeTsConfigPath(context, pkg);

		if (!fs.existsSync(tsconfigPath)) {
			this.verbose(`Skipping '${pkg.name}' because '${tsconfigPath}' doesn't exist.`);
			return false;
		}
		if (
			assertTaggingEnabledPaths &&
			!assertTaggingEnabledPaths.some((regex) => regex.test(tsconfigPath))
		) {
			this.verbose(
				`Skipping '${pkg.name}' because '${tsconfigPath}' doesn't match configured regexes.`,
			);
			return false;
		}

		return true;
	}

	protected async processPackage<TPkg extends Package>(
		pkg: TPkg,
		kind: PackageKind,
	): Promise<void> {
		const tsconfigPath = await this.getTsConfigPath(pkg);
		this.collectAssertData(tsconfigPath);
	}

	public async run(): Promise<void> {
		await super.run();
		this.tagAsserts();
	}

	private collectAssertData(tsconfigPath: string): void {
		if (tsconfigPath.includes("test")) {
			return;
		}

		const project = this.createProjectFromTsConfig(tsconfigPath);
		this.collectDataFromProject(project);
	}

	private createProjectFromTsConfig(tsconfigPath: string): Project {
		return new Project({
			skipFileDependencyResolution: true,
			tsConfigFilePath: tsconfigPath,
		});
	}

	private collectDataFromProject(project: Project): void {
		const templateErrors: Node[] = [];
		const otherErrors: Node[] = [];

		for (const sourceFile of project.getSourceFiles()) {
			assert(this.assertionFunctions, "No assert functions are defined!");
			for (const msg of getAssertMessageParams(sourceFile, this.assertionFunctions)) {
				this.handleMessageNode(msg, templateErrors, otherErrors);
			}
		}

		this.processErrorsFromDataCollection(templateErrors, otherErrors);
	}

	private handleMessageNode(msg: Node, templateErrors: Node[], otherErrors: Node[]): void {
		const nodeKind = msg.getKind();
		switch (nodeKind) {
			case SyntaxKind.NumericLiteral: {
				// If it's a number, validate it's a shortcode
				this.handleNumericLiteralNode(msg as NumericLiteral);
				break;
			}
			case SyntaxKind.StringLiteral:
			case SyntaxKind.NoSubstitutionTemplateLiteral: {
				// If it's a simple string literal, track the file for replacements later
				newAssetFiles.add(msg.getSourceFile());
				break;
			}
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

	private handleNumericLiteralNode(numLit: NumericLiteral): void {
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
			this.errors.push(
				`Duplicate shortcode 0x${numLitValue.toString(16)} detected\n\t${getCallsiteString(
					shortCodes.get(numLitValue)!,
				)}\n\t${getCallsiteString(numLit)}`,
			);
			return;
		}
		shortCodes.set(numLitValue, numLit);
		maxShortCode = Math.max(numLitValue, maxShortCode);
		const comments = msg.getTrailingCommentRanges();
		if (comments.length > 0) {
			const originalErrorText = extractErrorTextFromComments(comments);
			codeToMsgMap.set(numLit.getText(), originalErrorText);
		}
	}

	private processErrorsFromDataCollection(templateErrors: Node[], otherErrors: Node[]): void {
		const errorMessages: string[] = [];
		if (templateErrors.length > 0) {
			errorMessages.push(
				`Template expressions are not supported in assertions. Use a string literal instead.\n${templateErrors
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

	private tagAsserts(): void {
		for (const s of newAssetFiles) {
			s.refreshFromFileSystemSync();
			assert(this.assertionFunctions, "No assert functions are defined!");
			for (const msg of getAssertMessageParams(s, this.assertionFunctions)) {
				if (isStringLiteral(msg)) {
					const shortCode = ++maxShortCode;
					shortCodes.set(shortCode, msg);
					const text = msg.getLiteralText();
					const shortCodeStr = `0x${shortCode.toString(16).padStart(3, "0")}`;
					msg.replaceWithText(`${shortCodeStr} /* ${text} */`);
					codeToMsgMap.set(shortCodeStr, text);
				}
			}
			s.saveSync();
		}

		writeShortCodeMappingFile();
	}

	private async getTsConfigPath(pkg: Package): Promise<string> {
		const context = await this.getContext();
		return context.repo.relativeToRepo(path.join(pkg.directory, "tsconfig.json"));
	}

	private getRelativeTsConfigPath(context: any, pkg: Package): string {
		return context.repo.relativeToRepo(path.join(pkg.directory, "tsconfig.json"));
	}
}

function isStringLiteral(msg: Node): msg is StringLiteral | NoSubstitutionTemplateLiteral {
	return (
		msg.getKind() === SyntaxKind.StringLiteral ||
		msg.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral
	);
}

function extractErrorTextFromComments(comments: any): string {
	let originalErrorText = comments[0].getText().replace(/\/\*/g, "").replace(/\*\//g, "").trim();
	if (shouldRemoveSurroundingQuotes(originalErrorText)) {
		originalErrorText = originalErrorText.substring(1, originalErrorText.length - 1);
	}
	return originalErrorText;
}

function shouldRemoveSurroundingQuotes(input: string): boolean {
	return (
		(input.startsWith('"') && input.indexOf('"', 1) === input.length - 1) ||
		(input.startsWith("`") && input.indexOf("`", 1) === input.length - 1)
	);
}

function getCallsiteString(msg: Node): string {
	return `${msg.getSourceFile().getFilePath()}:${msg.getStartLineNumber()}`;
}

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
			if (args[messageIndex]) {
				messageArgs.push(args[messageIndex]);
			}
		}
	}
	return messageArgs;
}

function writeShortCodeMappingFile(): void {
	const mapContents = Array.from(codeToMsgMap.entries())
		.sort()
		.reduce((accum, current) => {
			accum[current[0]] = current[1];
			return accum;
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
