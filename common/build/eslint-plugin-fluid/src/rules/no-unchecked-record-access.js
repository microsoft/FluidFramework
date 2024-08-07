/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const ts = require("typescript");

const hasIndexSignature = (type) => type.getStringIndexType() || type.getNumberIndexType();
const isArrayType = (type) => type.symbol && type.symbol.name === "Array";
const isOptionalProperty = (type, propertyName) => {
	const symbol = type.getProperty(propertyName);
	return symbol && (symbol.flags & ts.SymbolFlags.Optional) !== 0;
};

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
		const possiblyUndefinedVariables = new Set();

		return {
			IfStatement(node) {
				if (node.test.type === "MemberExpression") {
					const propertyName = node.test.property.name;
					checkedProperties.add(propertyName);
				}
			},
			VariableDeclarator(node) {
				const services = context.parserServices;
				if (!services || !services.program || !services.esTreeNodeToTSNodeMap) {
					return;
				}
				const checker = services.program.getTypeChecker();

				if (node.init && node.init.type === "MemberExpression") {
					const tsNode = services.esTreeNodeToTSNodeMap.get(node.init.object);
					const type = checker.getTypeAtLocation(tsNode);
					const property = node.init.property.name;

					if (hasIndexSignature(type) || isOptionalProperty(type, property)) {
						const variableName = node.id.name;
						possiblyUndefinedVariables.add(variableName);

						if (
							node.id.typeAnnotation &&
							node.id.typeAnnotation.typeAnnotation.type === "TSStringKeyword"
						) {
							context.report({
								node: node,
								message: `'${variableName}' is assigned a value that might be 'undefined'`,
							});
						}
					}
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
				let isOptionalChain = false;

				while (
					currentNode.type === "MemberExpression" ||
					currentNode.type === "ChainExpression"
				) {
					if (currentNode.type === "ChainExpression") {
						isOptionalChain = true;
						currentNode = currentNode.expression;
						continue;
					}
					if (currentNode.optional) {
						isOptionalChain = true;
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
					if (possiblyUndefinedVariables.has(currentNode.name) && !isOptionalChain) {
						context.report({
							node: node,
							message: `'${accessPath.join("")}' might be 'undefined'`,
						});
						return;
					}
				}

				const tsNode = services.esTreeNodeToTSNodeMap.get(node.object);
				const type = checker.getTypeAtLocation(tsNode);
				if (isArrayType(type)) {
					return;
				}
				const property = node.computed
					? node.property
					: node.property.name || node.property.value;

				if (hasIndexSignature(type) || isOptionalProperty(type, property)) {
					if (node.parent.type === "MemberExpression" && node.parent.object === node) {
						if (checkedProperties.has(property)) {
							return;
						}
						if (
							!node.optional &&
							!isOptionalChain &&
							!(node.parent.parent && node.parent.parent.type === "ChainExpression")
						) {
							context.report({
								node: node.parent,
								message: `'${accessPath.join("")}' is possibly 'undefined'`,
							});
						}
					}
				}
			},
		};
	},
};
