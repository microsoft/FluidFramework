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
			Program() {
				context.getScope().variables.forEach((variable) => {
					if (variable.defs[0] && variable.defs[0].node.init) {
						declaredVariables.set(variable.name, variable.defs[0].node.init.value);
					}
				});
			},
			ForInStatement(node) {
				if (node.left.type === "VariableDeclaration") {
					forInLoopVariables.add(node.left.declarations[0].id.name);
				}
			},
			IfStatement(node) {
				if (node.test.type === "MemberExpression") {
					checkedProperties.add(node.test.property.name);
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
							accessPath.unshift(`["${currentNode.property.value}"]`);
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
				if (!tsNode) {
					return;
				}
				const type = checker.getTypeAtLocation(tsNode);
				if (!type || isArrayType(type)) {
					return;
				}

				const property = node.computed
					? node.property.type === "Identifier"
						? node.property.name
						: node.property.value
					: node.property.name;

				const propertyExists = hasProperty(type, property);
				const isIndexAccess = node.computed && !propertyExists;
				const isIndexSignatureType = hasIndexSignature(type);

				const isRelevantParent =
					(node.parent.type === "MemberExpression" && node.parent.object === node) ||
					(node.parent.type === "CallExpression" && node.parent.callee === node);

				if (!isRelevantParent) {
					return;
				}

				const isChecked = checkedProperties.has(property);
				if (isChecked) {
					return;
				}

				const isInForInLoop =
					node.object.type === "Identifier" && forInLoopVariables.has(node.object.name);
				if (isInForInLoop) {
					return;
				}

				const isOptionalAccess =
					node.optional ||
					isOptionalChain ||
					(node.parent.parent && node.parent.parent.type === "ChainExpression");
				if (isOptionalAccess) {
					return;
				}

				const isPossiblyUndefined =
					isIndexSignatureType ||
					isIndexAccess ||
					!propertyExists ||
					isOptionalProperty(type, property);
				if (!isPossiblyUndefined) {
					return;
				}

				context.report({
					node: node.parent,
					message: `'${accessPath.join("")}' is possibly 'undefined'`,
				});
			},
		};
	},
};
