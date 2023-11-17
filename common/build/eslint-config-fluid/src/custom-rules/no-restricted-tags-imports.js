/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const { TSDocParser } = require("@microsoft/tsdoc");

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
		const options = context.options[0];
		const restrictedTags = new Set();
		const exceptions = {};
		// Get restricted tags and throw error if not formatted correctly, ie: doesn't start with '@'
		(options.tags || []).forEach((tag) => {
			if (isTagValid(tag, context)) {
				restrictedTags.add(tag);
			}
		});
		// Validate and save the exceptions object being passed in.
		Object.keys(options.exceptions || {}).forEach((tag) => {
			if (isTagValid(tag, context)) {
				if (!exceptions[tag]) {
					exceptions[tag] = new Set();
				}
				options.exceptions[tag].forEach((exceptionPath) => {
					exceptions[tag].add(exceptionPath);
				});
			}
		});
		return {
			ImportDeclaration(node) {
				const importSource = node.source.value;
				node.specifiers.forEach((items) => {
					const variable = context.getDeclaredVariables(items)[0];
					const sourceCode = context.getSourceCode();
					const comments = sourceCode.getAllComments();
					// JSDocs comments are block comments, so we're only interested in those.
					comments.forEach((comment) => {
						if (comment.type !== "Block") {
							return;
						}
						const tsdocParser = new TSDocParser();
						// The leading and trailing new line characters were trimmed so we need to readd them for tsdoc to parse the comment correctly.
						let commentText = `/**\n` + comment.value + `\n */`;
						const parserContext = tsdocParser.parseString(commentText);

						restrictedTags.forEach((tag) => {
							if (parserContext.docComment.modifierTagSet.hasTagName(tag)) {
								if (exceptions[tag] && exceptions[tag].has(importSource)) {
									return; // This import is an exception, so it's allowed
								}
								context.report({
									node,
									messageId: "importWithRestrictedTag",
									data: {
										name: variable.name,
										tag: tag.title,
									},
								});
							}
						});
					});
				});
			},
		};
	},
};

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
