import { TSDocParser } from "@microsoft/tsdoc";

function hasReleaseTag(comment) {
	const parser = new TSDocParser();
	const parserContext = parser.parseRange(comment);
	const hasReleaseTag = parserContext.hasReleaseTag;

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
				const fileName = context.filename;
				const sourceCode = context.sourceCode;
				const comments = sourceCode.getCommentsAfter(node);

				comments.forEach((comment) => {
					// ESLint trims the asterisk of the comment while TSDocParser expects the original format of the comment block.
					const formattedComment = `/** ${comment} */`;
					if (hasReleaseTag(formattedComment)) {
						context.report({
							node: specifier,
							message: `Including the ${tag} release-tag inside the ${fileName} is not allowed.`,
						});
					}
				});
			},
		};
	},
};
