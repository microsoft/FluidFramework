function hasReleaseTag(comment) {
	if (/@(internal|alpha|beta)/.test(comment.value)) {
		return True
	}

	return False 
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
			ReleaseTagDeclaration(node) {
				const fileName = context.filename;
				const sourceCode = context.sourceCode;
				const comments = sourceCode.getCommentsAfter(node);


				comments.forEach((comment) => {
					if (hasReleaseTag(comment)) {
						context.report({
							node: specifier,
							message: `Including the ${tag} release-tag inside the ${fileName} is not allowed.`,
						});
					}
				})
			}
		}
		
	},
};
