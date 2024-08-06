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
					const property = node.property.name || node.property.value;
					const propertyType = checker.getTypeOfPropertyOfType(type, property);

					// If this is a nested access (e.g., obj.prop.nestedProp)
					if (node.parent.type === "MemberExpression" && node.parent.object === node) {
						// Check if the property has been checked in a truthy condition
						if (checkedProperties.has(property)) {
							return;
						}

						// Check if the property type is string (for cases like .length on a string)
						if (propertyType && propertyType.flags === ts.TypeFlags.String) {
							return;
						}

						context.report({
							node: node.parent,
							message: `'${accessPath.join(".")}' is possibly 'undefined'`,
						});
					}
				}
			},
		};
	},
};
