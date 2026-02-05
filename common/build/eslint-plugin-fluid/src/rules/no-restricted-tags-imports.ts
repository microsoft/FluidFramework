/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import type { Rule } from "eslint";
import type { TSESTree } from "@typescript-eslint/utils";
import { Project } from "ts-morph";

/**
 * Validates if a tag is correctly formatted.
 * @param tag - The tag to be validated.
 * @param context - The context object provided by ESLint.
 * @returns true if valid tag, else false.
 */
function isTagValid(tag: string, context: Rule.RuleContext): boolean {
	if (!tag.startsWith("@")) {
		context.report({
			loc: { line: 1, column: 0 },
			message: `Invalid tag format in rule configuration: '{${tag}}'. Tags should start with '@'.`,
			data: { tag },
		});
		return false;
	} else {
		return true;
	}
}

/**
 * Filters the tags array to ensure all tags are valid.
 * @param tags - Array of tags to be processed.
 * @param context - The context object provided by ESLint.
 * @returns A set of validated tags.
 * Note: Invalid tags will be reported.
 */
function processTags(tags: string[], context: Rule.RuleContext): Set<string> {
	return new Set(tags.filter((tag) => isTagValid(tag, context)));
}

/**
 * Validate the exceptions object, ensuring all tags and paths are valid.
 * @param exceptions - The exceptions object from the rule configuration.
 * @param context - The context object provided by ESLint.
 * @returns An object with tags as keys and Sets of paths as values.
 * ex: { '@alpha': Set(2) { './exceptionFile.ts', './exceptionFile2.ts' } }
 */
function processExceptions(
	exceptions: Record<string, string[]>,
	context: Rule.RuleContext,
): Record<string, Set<string>> {
	const processedExceptions: Record<string, Set<string>> = {};
	Object.keys(exceptions).forEach((tag) => {
		if (isTagValid(tag, context)) {
			processedExceptions[tag] = new Set(exceptions[tag]);
		}
	});
	return processedExceptions;
}

/**
 * Resolves the path of an imported module to an absolute path.
 *
 * @param importPath - The path used in the import statement.
 * @param currentFilePath - The absolute path of the current file.
 * @return - The absolute path of the imported module.
 */
function resolveImportPath(importPath: string, currentFilePath: string): string {
	return path.isAbsolute(importPath)
		? importPath
		: path.resolve(path.dirname(currentFilePath), importPath);
}

const rule: Rule.RuleModule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"This rule restricts imports based on one or more TSDoc tags they're annotated with. This can be used to enforce release tag rules against imports and prevent accidental dependencies on internal, unstable or undocumented parts of the codebase.",
			category: "Best Practices",
		},
		schema: [
			{
				type: "object",
				properties: {
					tags: {
						type: "array",
						items: { type: "string" },
						uniqueItems: true,
					},
					exceptions: {
						type: "object",
						additionalProperties: {
							type: "array",
							items: { type: "string" },
							uniqueItems: true,
						},
					},
				},
				additionalProperties: false,
			},
		],
		messages: {
			importWithRestrictedTag: "Import with restricted tag found.",
		},
	},
	create(context: Rule.RuleContext): any {
		const options =
			(context.options[0] as { tags?: string[]; exceptions?: Record<string, string[]> }) ||
			{};
		const restrictedTags = processTags(options.tags || [], context);
		const exceptions = processExceptions(options.exceptions || {}, context);

		let tsConfigPath: string;
		if (context.parserOptions?.project) {
			// Resolve the relative path to an absolute path
			tsConfigPath = path.resolve(context.getCwd(), context.parserOptions.project as string);
		} else {
			context.report({
				node: null as any,
				message:
					"A 'tsconfig.json' file is required but was not found in the ESLint config under parserOptions.project.",
			});
			return {}; // Return early if no tsconfig is found
		}
		const project = new Project({ tsConfigFilePath: tsConfigPath });

		return {
			ImportDeclaration(node: TSESTree.ImportDeclaration) {
				const importSource = node.source.value;
				const currentFilePath = context.getFilename();
				// For each item being imported
				node.specifiers.forEach((specifier) => {
					if (specifier.type === "ImportSpecifier") {
						// Name of imported item
						const importedName = (specifier.imported as any).name;

						const importedFilePath = resolveImportPath(
							(specifier.parent as TSESTree.ImportDeclaration).source.value,
							currentFilePath,
						);
						// File it was imported from
						const importedFile = project.addSourceFileAtPath(importedFilePath);
						const declaration = importedFile.getFunction(importedName);
						if (declaration) {
							// Extract comments associated with the imported item.
							const jsDocs = declaration.getJsDocs();
							jsDocs.forEach((doc) => {
								const docTags = doc.getTags().map((docTag) => {
									return docTag.getFullText().trim();
								});
								docTags.forEach((tag) => {
									// Check if the tag is restricted
									if (restrictedTags.has(tag)) {
										// Check for any exceptions that allow the use of this tag
										const exceptionSet = exceptions[tag];
										if (exceptionSet && exceptionSet.has(importSource)) {
											return;
										}
										// Report a violation if a restricted tag is used without an exception
										context.report({
											node: specifier as unknown as Rule.Node,
											message: `Importing ${tag} tagged items is not allowed: ${importedName}`,
										});
									}
								});
							});
						}
					}
				});
			},
		};
	},
};

export = rule;
