/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { TSDocParser } = require("@microsoft/tsdoc");

/**
 *
 * @param comment: String - The comment included inside the class / interface / type.
 * @returns hasReleaseTag: Boolean - True; if the comment contains any release tags.
 */
function hasReleaseTag(comment) {
	const parser = new TSDocParser();
	const parserContext = parser.parseString(comment);

	const hasReleaseTag =
		parserContext.docComment.modifierTagSet.isAlpha() ||
		parserContext.docComment.modifierTagSet.isBeta() ||
		parserContext.docComment.modifierTagSet.isPublic() ||
		parserContext.docComment.modifierTagSet.isInternal();

	return hasReleaseTag;
}

/**
 * Helper function abstracted for reusability for different types of node. 
 * 
 * @param node - An AST node which is begin traversed.
 * @param context - The context object containing information that is relevant to the context of the rule.
 * {@link https://eslint.org/docs/latest/extend/custom-rules}
 */
function errorLoggerHelper(node, context) {
	const sourceCode = context.sourceCode;
	const comments = sourceCode.getCommentsInside(node);

	// Array to store class name & line to avoid repetitive logging. 
	const classesForLog = new Set()

	comments.forEach((comment) => {
		// ESLint trims the asterisk of the comment while TSDocParser expects the original format of the comment block.
		const formattedComment = `/** ${comment.value} */`;
		if (hasReleaseTag(formattedComment)) {
			// Class Declration has node.id while Class Expression has node.parent.id.
			const classForLog = `${ node.id ? node.id.name : node.parent.id.name } at line ${node.loc.start.line}`
			classesForLog.add(classForLog)
		}
	});
	context.report({
		node: node,
		message: `Including the release-tag inside the ${Array.from(classesForLog)} is not allowed.`,
	});
}

module.exports = {
	meta: {
		type: "problem",
		docs: {
			description: "This rule restricts any release tags on member class and interface.",
			category: "Best Practices",
		},
		schema: [],
		messages: {
			releaseTagOnMember: "Release tag on member class / interface found.",
		},
	},
	create(context) {
		return {
			ClassDeclaration(node) {
				errorLoggerHelper(node, context)
			},
			ClassExpression(node) {
				errorLoggerHelper(node, context)
			}
		};
	},
};
