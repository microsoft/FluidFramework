/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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

		if (!parserServices || !parserServices.program || !parserServices.esTreeNodeToTSNodeMap) {
			return {};
		}
		const compilerOptions = parserServices.program.getCompilerOptions();

		if (compilerOptions.noUncheckedIndexedAccess) {
			return {};
		}

		function checkPropertyAccess(node) {
			if (!isIndexSignatureType(parserServices, node)) {
				return;
			}

			if (propertyHasBeenChecked(node)) {
				return;
			}

			const parentNode = node.parent;

			if (
				parentNode.type !== "VariableDeclarator" &&
				parentNode.type !== "MemberExpression"
			) {
				return;
			}

			const fullName = getFullName(node);

			if (parentNode.type === "VariableDeclarator" && !parentNode.id.typeAnnotation) {
				return context.report({
					node,
					message: `Implicit typing for '${fullName}' from an index signature type is not allowed. Please provide an explicit type annotation or enable noUncheckedIndexedAccess`,
				});
			}

			if (parentNode.type === "VariableDeclarator" && parentNode.id.typeAnnotation) {
				const expectedType = parentNode.id.typeAnnotation.typeAnnotation;
				const isStrictType =
					expectedType.type === "TSUnionType"
						? !expectedType.types.some((type) => type.type === "TSUndefinedKeyword")
						: true;

				if (!isStrictType) {
					return;
				}

				return context.report({
					node,
					message: `'${fullName}' is possibly 'undefined'. The variable expects a non-optional type`,
				});
			}

			if (parentNode.type === "MemberExpression" && parentNode.object === node) {
				context.report({
					node,
					message: `'${fullName}' is possibly 'undefined'`,
				});
			}
		}

		return {
			MemberExpression: checkPropertyAccess,
		};
	},
};

function isIndexSignatureType(parserServices, node) {
	const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node.object);
	const typeChecker = parserServices.program.getTypeChecker();
	const type = typeChecker.getTypeAtLocation(tsNode);
	return type.getStringIndexType() !== undefined;
}

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

function isDefined(node) {
	if (!node.parent) {
		return false;
	}

	// Check for optional chaining (?.) or non-null assertion (!)
	if (node.optional === true || node.parent.type === "TSNonNullExpression") {
		return true;
	}

	// Check if the node is directly used as a condition in an if statement
	if (node.parent.type === "IfStatement" && node.parent.test === node) {
		return true;
	}

	// Check for existence using the `in` operator, e.g., "a" in indexedRecordOfStrings
	if (
		node.parent.type === "BinaryExpression" &&
		node.parent.operator === "in" &&
		node.parent.left === node
	) {
		return true;
	}

	// Check if the node is used in a for-of loop with Object.entries, indicating a safe access
	if (
		node.parent.type === "ForOfStatement" &&
		node.parent.right &&
		node.parent.right.callee &&
		node.parent.right.callee.property &&
		node.parent.right.callee.property.name === "entries"
	) {
		return true;
	}

	// Check if the node is inside a block that is conditionally executed, e.g., in an if or for-of statement
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
