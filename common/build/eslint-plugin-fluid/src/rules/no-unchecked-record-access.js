/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { SyntaxKind } = require("typescript");

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
		const parserServices = context.parserServices;

		// Check if we have the necessary TypeScript services
		if (!parserServices || !parserServices.program || !parserServices.esTreeNodeToTSNodeMap) {
			return {};
		}
		const compilerOptions = parserServices.program.getCompilerOptions();
		const typeChecker = parserServices.program.getTypeChecker();

		// If noUncheckedIndexedAccess is already enabled, disable this rule
		if (compilerOptions.noUncheckedIndexedAccess) {
			return {};
		}

		// Main function to run on every member access (e.g., obj.a or obj["a"])
		function checkPropertyAccess(node) {
			// Only check index signature types
			if (!isIndexSignatureType(parserServices, node)) {
				return;
			}

			// If the property has been checked (e.g., with optional chaining), skip it. Please see isDefined() for exhaustive list.
			if (propertyHasBeenChecked(node)) {
				return;
			}

			const fullName = getFullName(node);
			const parentNode = node.parent;

			/*
			 * Cases when this lint rule should report an error
			 */

			// Assigment cases
			if (parentNode.type === "VariableDeclarator") {
				if (!parentNode.id.typeAnnotation) {
					// if its an implicit type we are assigning an index signature type to, report an error
					context.report({
						node,
						message: `Implicit typing for '${fullName}' from an index signature type is not allowed. Please provide an explicit type annotation or enable noUncheckedIndexedAccess`,
					});
				} else {
					// if its a strict type we are assigning an index signature type to, report an error
					const expectedType = parentNode.id.typeAnnotation.typeAnnotation;
					const isStrictType =
						expectedType.type === "TSUnionType"
							? !expectedType.types.some((type) => type.type === "TSUndefinedKeyword")
							: true;

					if (isStrictType) {
						context.report({
							node,
							message: `'${fullName}' is possibly 'undefined'`,
						});
					}
				}
			}
			// Property access cases
			else if (parentNode.type === "MemberExpression" && parentNode.object === node) {
				context.report({
					node,
					message: `'${fullName}' is possibly 'undefined'`,
				});
			}
			// Return statement cases
			else if (parentNode.type === "ReturnStatement") {
				const functionNode = findParentFunction(node);
				if (functionNode) {
					const tsNode = parserServices.esTreeNodeToTSNodeMap.get(functionNode);
					if (!isTypeAllowedToBeUndefined(tsNode, typeChecker)) {
						context.report({
							node,
							message: `Returning '${fullName}' directly from an index signature type is not allowed. It may be 'undefined'`,
						});
					}
				}
			}
		}

		return {
			MemberExpression: checkPropertyAccess,
		};
	},
};

// Helper function to check if a type has an index signature
function isIndexSignatureType(parserServices, node) {
	const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node.object);
	const typeChecker = parserServices.program.getTypeChecker();
	const type = typeChecker.getTypeAtLocation(tsNode);
	return type.getStringIndexType() !== undefined;
}

// Helper function to traverse up the code until the scope ends and checks if the property access has been checked for undefined
function propertyHasBeenChecked(node) {
	let current = node;

	while (current) {
		if (isDefined(current)) {
			return true;
		}
		current = current.parent;
	}
	return false;
}

// Helper function to determine if a node is defined. This has all the cases which define
function isDefined(node) {
	if (!node.parent) {
		return false;
	}

	// Optional chaining or non-null assertion
	if (node.optional === true || node.parent.type === "TSNonNullExpression") {
		return true;
	}

	// Truthy check in if statement
	if (node.parent.type === "IfStatement" && node.parent.test === node) {
		return true;
	}

	// 'in' operator check
	if (
		node.parent.type === "BinaryExpression" &&
		node.parent.operator === "in" &&
		node.parent.left === node
	) {
		return true;
	}

	// Object.entries() or Object.keys() loop
	if (
		node.parent.type === "ForOfStatement" &&
		node.parent.right &&
		node.parent.right.callee &&
		node.parent.right.callee.property &&
		(node.parent.right.callee.property.name === "entries" ||
			node.parent.right.callee.property.name === "keys")
	) {
		return true;
	}

	// Check for block statements in if or for...of loops
	if (node.parent.type === "BlockStatement") {
		const blockParent = node.parent.parent;
		if (
			blockParent &&
			(blockParent.type === "IfStatement" || blockParent.type === "ForOfStatement")
		) {
			return isDefined(blockParent.test || blockParent.right);
		}
	}

	return false;
}

// Helper function to get the full name of a property access chain
function getFullName(node) {
	let fullPath = "";
	let currentNode = node;

	while (currentNode && currentNode.type === "MemberExpression") {
		const propertyPart = currentNode.computed
			? `[${currentNode.property.name || currentNode.property.raw}]`
			: `.${currentNode.property.name}`;

		fullPath = propertyPart + fullPath;

		if (currentNode.object && currentNode.object.type === "Identifier") {
			fullPath = currentNode.object.name + fullPath;
		}

		currentNode = currentNode.object;
	}
	return fullPath;
}

// Helper function to find the parent function of a node
function findParentFunction(node) {
	while (node) {
		if (
			node.type === "FunctionDeclaration" ||
			node.type === "FunctionExpression" ||
			node.type === "ArrowFunctionExpression"
		) {
			return node;
		}
		node = node.parent;
	}
	return null;
}

// Helper function to check if a type is allowed to be undefined (e.g., Promise<T | undefined>)
function isTypeAllowedToBeUndefined(tsNode, typeChecker) {
	const type = typeChecker.getTypeAtLocation(tsNode);
	const symbol = type.getSymbol();

	if (symbol && symbol.valueDeclaration) {
		const signatureDeclaration = symbol.valueDeclaration;
		// Check for Promise<T | undefined>
		if (
			signatureDeclaration.type &&
			signatureDeclaration.type.kind === SyntaxKind.TypeReference
		) {
			const typeNode = signatureDeclaration.type;
			if (typeNode.typeName.text === "Promise") {
				return (
					typeNode.typeArguments &&
					typeNode.typeArguments.some(
						(arg) =>
							arg.kind === SyntaxKind.UnionType &&
							arg.types.some((t) => t.kind === SyntaxKind.UndefinedKeyword),
					)
				);
			}
		}
		// Check for direct union with undefined
		return (
			signatureDeclaration.type &&
			signatureDeclaration.type.kind === SyntaxKind.UnionType &&
			signatureDeclaration.type.types.some((t) => t.kind === SyntaxKind.UndefinedKeyword)
		);
	}
	return false;
}
