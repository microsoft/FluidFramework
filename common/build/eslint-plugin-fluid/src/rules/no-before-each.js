module.exports = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow calls to the 'beforeEach' function.",
			category: "Best Practices",
			recommended: false,
		},
		messages: {
			noBeforeEach: "Calls to 'beforeEach' are not allowed.",
		},
		schema: [], // No options for this rule
	},
	create(context) {
		return {
			CallExpression(node) {
				// Check if the callee is a function named "beforeEach"
				if (
					node.callee.type === "Identifier" &&
					node.callee.name === "beforeEach"
				) {
					context.report({
						node,
						messageId: "noBeforeEach",
					});
				}
			},
		};
	},
};
