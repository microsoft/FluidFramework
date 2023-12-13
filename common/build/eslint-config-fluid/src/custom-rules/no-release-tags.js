/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { TSDocParser } = require("@microsoft/tsdoc");

function hasReleaseTag(comment) {
	console.log("comment", comment);

	const parser = new TSDocParser();
	const parserContext = parser.parseString(comment);

	const hasReleaseTag =
		parserContext.docComment.modifierTagSet.isAlpha() ||
		parserContext.docComment.modifierTagSet.isBeta() ||
		parserContext.docComment.modifierTagSet.isPublic() ||
		parserContext.docComment.modifierTagSet.isInternal();

	console.log(hasReleaseTag);
	return hasReleaseTag;
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
				const fullFileName = context.filename;
				const regex = /[^/]+$/;
				const fileName = fullFileName.match(regex)[0];
				const sourceCode = context.sourceCode;
				const comments = sourceCode.getCommentsInside(node);

				// console.log("comments :", comments);

				comments.forEach((comment) => {
					// ESLint trims the asterisk of the comment while TSDocParser expects the original format of the comment block.
					const formattedComment = `/** ${comment.value} */`;
					if (hasReleaseTag(formattedComment)) {
						context.report({
							node: node,
							message: `Including the release-tag inside the ${fileName} is not allowed.`,
						});
					}
				});
			},
		};
	},
};
