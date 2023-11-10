/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	meta: {
		type: "problem",
		docs: {
			description:
				"This rule restricts imports from internal or non-public APIs. This to prevent accidental dependencies on internal, unstable or undocumented parts of the codebase.",
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
						type: "array",
						items: { type: "string" },
						uniqueItems: true,
					},
				},
				additionalProperties: false,
			},
		],
		messages: {
			restrictedImport: "Import ",
		},
	},
	create(context) {
		const options = context.options[0] || {};
		const restrictedTags = new Set(options.tags || []);
		const exceptions = new Set(options.exceptions || []);
		return {
			ImportDeclaration(node) {
				const isException = exceptions.has(node.source.value);
				if (isException) {
					return; // Skip further checks for this import
				}
				node.specifiers.forEach((items) => {
					const variable = context.getDeclaredVariables(items)[0];
					const sourceCode = context.getSourceCode();
					const comments = sourceCode.getAllComments();
					// JSDocs comments are block comments, so we're only interested in those.
					comments.forEach((comment) => {
						if (comment.type !== "Block") {
							return;
						}
						// Use a JSDoc parser to parse the comments for each imported item.
						const jsDoc = require("doctrine").parse(comment.value, { unwrap: true });
						jsDoc.tags.forEach((tag) => {
							console.log(tag);
							if (restrictedTags.has(tag.title)) {
								context.report({
									node,
									messageId: "restrictedImport",
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
