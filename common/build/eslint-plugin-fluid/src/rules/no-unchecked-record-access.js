/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow unchecked indexed access on objects, ignoring arrays",
			category: "Possible Errors",
			recommended: false,
		},
		schema: [],
		messages: {
			uncheckedRecordAccess: "Unchecked access to a record index detected.",
		},
	},
	create(context) {
		const isNonArrayObject = (variable) =>
			variable.defs.some(({ node }) => node.init && node.init.type !== "ArrayExpression");

		return {
			MemberExpression(node) {
				if (node.object.type !== "Identifier") {
					return;
				}
				const variable = context
					.getScope()
					.variables.find((v) => v.name === node.object.name);
				if (!variable || !isNonArrayObject(variable)) {
					return;
				}
				if (
					(node.computed && node.property.type === "Literal") || // Handles cases like someObj['a']
					(!node.computed && node.property.type === "Identifier") // Handles cases like someObj.a
				) {
					context.report({
						node,
						messageId: "uncheckedRecordAccess",
					});
				}
			},
		};
	},
};
