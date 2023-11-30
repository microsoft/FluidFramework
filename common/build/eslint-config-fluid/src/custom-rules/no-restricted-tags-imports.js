/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const { Project } = require("ts-morph");

/**
 * Validates if a tag is correctly formatted.
 * @param tag - The tag to be validated.
 * @param context - The context object provided by ESLint.
 * @returns true if valid tag, else false.
 */
function isTagValid(tag, context) {
	if (!tag.startsWith("@")) {
		context.report({
			loc: { line: 1, column: 0 },
			message: `Invalid tag format in rule configuration: '{${tag}}'. Tags should start with '@'.`,
			data: { tag },
		});
	} else {
		return true;
	}
}

/**
 * Processes the tags array to ensure all tags are valid.
 * @param tags - Array of tags to be processed.
 * @param context - The context object provided by ESLint.
 * @returns A set of validated tags.
 */
function processTags(tags, context) {
	return new Set(tags.filter((tag) => isTagValid(tag, context)));
}

/**
 * Validate the exceptions object, ensuring all tags and paths are valid.
 * @param exceptions - The exceptions object from the rule configuration.
 * @param context - The context object provided by ESLint.
 * @returns - An object with tags as keys and Sets of paths as values.
 */
function processExceptions(exceptions, context) {
	const processedExceptions = {};
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
function resolveImportPath(importPath, currentFilePath) {
	return path.isAbsolute(importPath)
		? importPath
		: path.resolve(path.dirname(currentFilePath), importPath);
}

module.exports = {
	meta: {
		type: "problem",
		docs: {
			description:
				"This rule restricts imports from specified tags or non-public APIs. This to prevent accidental dependencies on internal, unstable or undocumented parts of the codebase.",
			category: "Best Practices",
		},
		fixable: "code",
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
	create(context) {
		const options = context.options[0] || {};
		const restrictedTags = processTags(options.tags, context);
		const exceptions = processExceptions(options.exceptions, context);
		const project = new Project();

		let tsConfigPath;
		if (context.parserOptions.project) {
			// Resolve the relative path to an absolute path
			tsConfigPath = path.resolve(context.getCwd(), context.parserOptions.project);
		} else {
			// Fallback to a default/test path or handle absence of tsconfig.json as needed
			tsConfigPath = path.join(__dirname, "../test/mockFiles/**/*.ts");
		}
		project.addSourceFilesAtPaths(tsConfigPath);

		// const sourceFile = project.getSourceFileOrThrow("mockModule.ts");
		return {
			ImportDeclaration(node) {
				const importSource = node.source.value;
				const currentFilePath = context.getFilename();

				// For each item being imported
				node.specifiers.forEach((specifier) => {
					if (specifier.type === "ImportSpecifier") {
						// Name of imported item
						const importedName = specifier.imported.name;

						const importedFilePath = resolveImportPath(
							specifier.parent.source.value,
							currentFilePath,
						);
						// File it was imported from
						const importedFile = project.addSourceFileAtPath(importedFilePath);
						const declaration = importedFile.getFunction(importedName);
						if (declaration) {
							const jsDocs = declaration.getJsDocs();
							jsDocs.forEach((doc) => {
								const docTags = doc.getTags().map((docTag) => {
									return docTag.getFullText().trim();
								});
								docTags.forEach((tag) => {
									// Check if the tag is restricted
									if (restrictedTags.has(tag)) {
										if (exceptions[tag] && exceptions[tag].has(importSource)) {
											return; // This import is an exception, so it's allowed
										}
										// The imported item has a restricted tag, throw an error.
										context.report({
											node: specifier,
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
