/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const ts = require("typescript");

const hasIndexSignature = (type) => {
	if (
		!type ||
		typeof type.getStringIndexType !== "function" ||
		typeof type.getNumberIndexType !== "function"
	)
		return false;
	return Boolean(type.getStringIndexType()) || Boolean(type.getNumberIndexType());
};

const isArrayType = (type) => type && type.symbol && type.symbol.name === "Array";

const isOptionalProperty = (type, propertyName) => {
	if (!type || !propertyName || typeof type.getProperty !== "function") return false;
	const symbol = type.getProperty(propertyName);
	return symbol && (symbol.flags & ts.SymbolFlags.Optional) !== 0;
};

const hasProperty = (type, propertyName) => {
	if (!type || !propertyName || typeof type.getProperties !== "function") return false;
	return type.getProperties().some((prop) => prop.name === propertyName);
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
		const forInLoopVariables = new Set();
		const declaredVariables = new Map();

		return {
			VariableDeclarator(node) {
				if (node.id.type === "Identifier" && node.init && node.init.type === "Literal") {
					declaredVariables.set(node.id.name, node.init.value);
				}
			},
			ForInStatement(node) {
				if (node.left.type === "VariableDeclaration") {
					const variableName = node.left.declarations[0].id.name;
					forInLoopVariables.add(variableName);
				}
			},
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
							const propertyValue = declaredVariables.get(currentNode.property.name);
							accessPath.unshift(
								propertyValue !== undefined
									? `[${propertyValue}]`
									: `[${currentNode.property.name}]`,
							);
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
				if (!tsNode) return;
				const type = checker.getTypeAtLocation(tsNode);
				if (!type) return;
				if (isArrayType(type)) {
					return;
				}

				const property = node.computed
					? node.property.type === "Identifier"
						? declaredVariables.get(node.property.name)
						: node.property.value
					: node.property.name;

				const propertyExists = hasProperty(type, property);
				const isIndexAccess = node.computed && !propertyExists;

				if (
					hasIndexSignature(type) ||
					isOptionalProperty(type, property) ||
					isIndexAccess
				) {
					if (node.parent.type === "MemberExpression" && node.parent.object === node) {
						if (checkedProperties.has(property)) {
							return;
						}
						const isInForInLoop =
							node.object.type === "Identifier" &&
							forInLoopVariables.has(node.object.name);
						const isComputedPropertyAccess =
							node.computed &&
							node.property.type === "Identifier" &&
							forInLoopVariables.has(node.property.name);
						if (
							!node.optional &&
							!isOptionalChain &&
							!(
								node.parent.parent && node.parent.parent.type === "ChainExpression"
							) &&
							!isInForInLoop &&
							!isComputedPropertyAccess
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
