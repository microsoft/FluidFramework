/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const ts = require("typescript");

const hasIndexSignature = (type) => type.getStringIndexType() || type.getNumberIndexType();
const isArrayType = (type) => type.symbol && type.symbol.name === "Array";

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
		const checkedProperties = new Set();
		return {
			IfStatement(node) {
				if (node.test.type === "MemberExpression") {
					const propertyName = node.test.property.name;
					checkedProperties.add(propertyName);
				}
			},
			MemberExpression: function checkMemberExpression(node) {
				const services = context.parserServices;
				if (!services || !services.program || !services.esTreeNodeToTSNodeMap) {
					return;
				}
				const checker = services.program.getTypeChecker();
				let currentNode = node;
				let accessPath = [];
				while (
					currentNode.type === "MemberExpression" ||
					currentNode.type === "ChainExpression"
				) {
					if (currentNode.type === "ChainExpression") {
						currentNode = currentNode.expression;
						continue;
					}
					if (currentNode.computed) {
						if (currentNode.property.type === "Identifier") {
							accessPath.unshift(`[${currentNode.property.name}]`);
						} else if (currentNode.property.type === "Literal") {
							accessPath.unshift(`[${currentNode.property.value}]`);
						} else {
							accessPath.unshift(`[...]`);
						}
					} else {
						if (currentNode.property.type === "Identifier") {
							accessPath.unshift(`.${currentNode.property.name}`);
						}
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
					const property = node.computed
						? node.property
						: node.property.name || node.property.value;
					const propertyType = checker.getTypeOfPropertyOfType(type, property);
					if (node.parent.type === "MemberExpression" && node.parent.object === node) {
						if (checkedProperties.has(property)) {
							return;
						}
						if (propertyType && propertyType.flags === ts.TypeFlags.String) {
							return;
						}
						if (
							node.parent.optional ||
							(node.parent.parent && node.parent.parent.type === "ChainExpression")
						) {
							return;
						}
						context.report({
							node: node.parent,
							message: `'${accessPath.join("")}' is possibly 'undefined'`,
						});
					}
				}
			},
		};
	},
};
