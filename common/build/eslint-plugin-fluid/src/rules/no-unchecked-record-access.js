/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

hasIndexSignature = (type) => type.getStringIndexType() || type.getNumberIndexType();

isArrayType = (type) => type.symbol && type.symbol.name === "Array";

module.exports = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow unchecked property access on index signature types",
			category: "Possible Errors",
		},
		schema: [],
	},

	create(context) {
		function checkMemberExpression(node) {
			const services = context.parserServices;

			if (!services || !services.program || !services.esTreeNodeToTSNodeMap) {
				return;
			}

			const checker = services.program.getTypeChecker();
			let currentNode = node;
			let accessPath = [];

			while (currentNode.type === "MemberExpression") {
				if (currentNode.property.type === "Identifier") {
					accessPath.unshift(currentNode.property.name);
				}
				currentNode = currentNode.object;
			}

			if (currentNode.type === "Identifier") {
				accessPath.unshift(currentNode.name);
			}

			const tsNode = services.esTreeNodeToTSNodeMap.get(node.object);
			const type = checker.getTypeAtLocation(tsNode);

			if (isArrayType(type)) {
				return;
			}

			if (hasIndexSignature(type)) {
				context.report({
					node: node,
					message: `'${accessPath.join(".")}' is possibly 'undefined'`,
				});
			}
		}

		return {
			MemberExpression: checkMemberExpression,
		};
	},
};
