/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Rule to enforce safe property access on index signature types.
 *
 * Reports issues when non-array index properties are accessed without handling
 * the possibility that they are absent.
 * Enabling `noUncheckedIndexedAccess` will disable these checks.
 */

const { SyntaxKind, TypeFlags } = require("typescript");

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
			if (!isIndexSignatureType(parserServices, node)) {
				return;
			}

			// Skip if the property has been checked (e.g., with optional chaining). Please see isDefined() for exhaustive list.
			if (propertyHasBeenChecked(node, context)) {
				return;
			}

			const fullName = getFullName(node);
			const parentNode = node.parent;

			/*
			 * Cases when this lint rule should report a defect
			 */

			if (parentNode.type === "VariableDeclarator") {
				if (
					parentNode.init === node &&
					parentNode.parent.type === "VariableDeclaration" &&
					!parentNode.id.typeAnnotation &&
					!isUndefinableIndexSignatureType(parserServices, node)
				) {
					// This defect occurs when a non-undefinable index signature type is assigned to a implicitly typed variable
					return context.report({
						node,
						message: `Implicit typing derived from '${fullName}' is not allowed. '${node.object.name}' is an index signature type and '${node.property.name}' may be undefined. Please provide an explicit type annotation including undefined or enable noUncheckedIndexedAccess`,
					});
				}

				if (
					parentNode.id.typeAnnotation &&
					isStrictlyTypedVariable(parentNode.id.typeAnnotation.typeAnnotation)
				) {
					// This defect occurs when an index signature type is assigned to a strict variable on variable declaration
					return context.report({
						node,
						message: `'${fullName}' is possibly 'undefined'`,
					});
				}
			}

			if (parentNode.type === "AssignmentExpression" && parentNode.right === node) {
				if (
					!isUndefinableIndexSignatureType(parserServices, node) &&
					!isTypeUndefinable(getNodeType(parentNode.left, parserServices))
				) {
					// This defect occurs when a non-undefinable index signature type is assigned to a strictly typed variable
					return context.report({
						node,
						message: `Assigning '${fullName}' from an index signature type to a strictly typed variable without 'undefined' is not allowed. '${fullName}' may be 'undefined'`,
					});
				}

				if (isStrictlyTypedVariable(getVariableType(parentNode.left, context.getScope()))) {
					// This defect occurs when an index signature type is assigned to a strictly typed variable after its declaration
					return context.report({
						node,
						message: `Assigning '${fullName}' from an index signature type to a strictly typed variable without 'undefined' is not allowed. '${fullName}' may be 'undefined'`,
					});
				}
			}

			if (parentNode.type === "MemberExpression" && parentNode.object === node) {
				// This defect occurs when trying to access a property on an index signature type, which might be undefined
				return context.report({
					node,
					message: `'${fullName}' is possibly 'undefined'`,
				});
			}

			if (parentNode.type === "ReturnStatement") {
				const functionNode = findParentFunction(node);
				if (!functionNode) {
					return;
				}
				const tsNode = parserServices.esTreeNodeToTSNodeMap.get(functionNode);
				if (isTypeAllowedToBeUndefined(tsNode, typeChecker)) {
					return;
				}
				// This defect occurs when returning an index signature type from a function that doesn't allow undefined in its return type
				return context.report({
					node,
					message: `Returning '${fullName}' directly from an index signature type is not allowed. '${fullName}' may be 'undefined'`,
				});
			}

			if (parentNode.type === "CallExpression") {
				if (parentNode.callee.type !== "Identifier") {
					return;
				}
				const functionDeclaration = findFunctionDeclaration(
					parentNode.callee.name,
					context.getScope(),
				);
				if (!functionDeclaration || !functionDeclaration.params) {
					return;
				}
				const paramIndex = parentNode.arguments.indexOf(node);
				if (paramIndex === -1 || paramIndex >= functionDeclaration.params.length) {
					return;
				}
				const paramType = getFunctionParameterType(functionDeclaration.params[paramIndex]);
				if (!paramType || !isStrictlyTypedParameter(paramType)) {
					return;
				}
				// This defect occurs when passing an index signature type to a function parameter that doesn't allow undefined
				return context.report({
					node,
					message: `Passing '${fullName}' from an index signature type to a strictly typed parameter is not allowed. '${fullName}' may be 'undefined'`,
				});
			}
		}

		return {
			MemberExpression: checkPropertyAccess,
		};
	},
};

// Helper function to check if a type includes undefined
function isTypeUndefinable(type) {
	if (type.isUnion()) {
		return type.types.some((t) => t.flags & TypeFlags.Undefined);
	}
	return false;
}

// Helper function to check if a type has an index signature
function isIndexSignatureType(parserServices, node) {
	if (!node || !node.object) return false;

	const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node.object);
	if (!tsNode) return false;

	const typeChecker = parserServices.program.getTypeChecker();
	const type = typeChecker.getTypeAtLocation(tsNode);
	if (!type) return false;

	try {
		const isArrayLike =
			type.symbol?.escapedName === "Array" ||
			type.symbol?.escapedName === "__tuple" ||
			type.isTuple?.() ||
			type.symbol?.declarations?.some(
				(decl) => decl.kind === SyntaxKind.ArrayType || decl.kind === SyntaxKind.TupleType,
			) ||
			typeChecker.isArrayType(type) ||
			typeChecker.isTupleType(type) ||
			// Check for ReadonlyArray
			type.symbol?.escapedName === "ReadonlyArray" ||
			(type.getNumberIndexType() && !type.getStringIndexType()) ||
			type.getProperty("length") !== undefined;

		if (isArrayLike) {
			return false;
		}

		if (node.computed) {
			const prop = node.property;
			if (
				(prop.type === "Literal" &&
					(typeof prop.value === "number" || !isNaN(prop.value))) ||
				prop.kind === 8 || // TypeScript's SyntaxKind.NumericLiteral
				prop.argumentExpression?.kind === 8
			) {
				return false;
			}
			if (prop.type === "Identifier") {
				const propType = typeChecker.getTypeAtLocation(
					parserServices.esTreeNodeToTSNodeMap.get(prop),
				);
				if (propType.flags & TypeFlags.NumberLike) {
					return false;
				}
			}
		}

		// Check index signatures
		const stringIndexType = type.getStringIndexType();
		const numberIndexType = type.getNumberIndexType();
		if (!stringIndexType && !numberIndexType) return false;

		const propName =
			node.property && (node.computed ? node.property.value : node.property.name);
		if (!propName) return true;

		const propSymbol = type.getProperty(propName);
		if (!propSymbol) return true;

		const declarations = propSymbol.declarations || [];
		return (
			declarations.some((decl) => decl?.kind === SyntaxKind.IndexSignature || !decl.name) ||
			declarations.length === 0
		);
	} catch (e) {
		return false;
	}
}

// Helper function to check if an index signature type includes undefined
function isUndefinableIndexSignatureType(parserServices, node) {
	if (!node || !node.object) {
		return false;
	}

	const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node.object);
	if (!tsNode) {
		return false;
	}

	const typeChecker = parserServices.program.getTypeChecker();
	const type = typeChecker.getTypeAtLocation(tsNode);
	if (!type) {
		return false;
	}

	// Get the property being accessed
	const propName = node.property && (node.computed ? node.property.value : node.property.name);
	if (!propName) {
		return false;
	}

	try {
		// Check if it's a property explicitly defined (not from index signature)
		const propSymbol = type.getProperty(propName);
		if (propSymbol) {
			const declarations = propSymbol.declarations || [];
			const isFromIndexSignature = declarations.some(
				(decl) => decl && decl.kind === SyntaxKind.IndexSignature,
			);

			if (!isFromIndexSignature && declarations.length > 0) {
				return false;
			}
		}

		// Check both string and number index signatures
		const stringIndexType = type.getStringIndexType();
		const numberIndexType = type.getNumberIndexType();

		const isStringIndexUndefinable =
			stringIndexType &&
			(stringIndexType.flags & TypeFlags.Undefined ||
				(stringIndexType.isUnion &&
					stringIndexType.isUnion() &&
					stringIndexType.types.some((t) => t.flags & TypeFlags.Undefined)));

		const isNumberIndexUndefinable =
			numberIndexType &&
			(numberIndexType.flags & TypeFlags.Undefined ||
				(numberIndexType.isUnion &&
					numberIndexType.isUnion() &&
					numberIndexType.types.some((t) => t.flags & TypeFlags.Undefined)));

		return isStringIndexUndefinable || isNumberIndexUndefinable;
	} catch (e) {
		// If there's any error in type checking, assume it might be undefinable
		return true;
	}
}

/**
 * Traverses up the AST from a property access node to check if the property has been properly guarded against being undefined.
 * Looks for safety checks like optional chaining, null checks, 'in' operator usage, etc.
 *
 * @param {MemberExpression} node - The AST node representing the property access to check
 * @param {RuleContext} context - ESLint rule context containing scope and AST information
 * @returns {boolean} True if the property access has been properly checked for undefined, false otherwise
 */
function propertyHasBeenChecked(node, context) {
	const baseObj = getBaseObject(node);
	const currentKeyNode = node.property;
	let current = node;

	while (current) {
		if (
			current.optional || // Check for optional chaining (?.)
			current.type === "ChainExpression" || // Check for nullish coalescing operator (??)
			current.type === "TSNonNullExpression" // Check for non-null assertion (!)
		) {
			return true;
		}

		const parent = current.parent;
		if (parent === null) {
			return false; // No parent nodes left - property check not found
		}

		// Handle Object.entries/keys loops
		if (parent.type === "ForOfStatement") {
			const right = parent.right;
			if (
				right?.type === "CallExpression" &&
				right.callee?.type === "MemberExpression" &&
				right.callee.object.name === "Object" &&
				(right.callee.property.name === "entries" || right.callee.property.name === "keys")
			) {
				return true;
			}
		}

		// Handle presence checks with guard against malformed AST nodes
		if (
			(parent.type === "IfStatement" || parent.type === "ConditionalExpression") &&
			parent.test // Guard against incomplete code scenarios
		) {
			if (nodesAreEquivalent(parent.test, node)) {
				return true;
			}
			if (parent.test.type === "BinaryExpression") {
				if (parent.test.operator === "in") {
					const testBase = getBaseObject(parent.test.right);
					if (baseObj === testBase) {
						// Check if the else block assigns the key
						const ifStatement = parent;
						const elseBlock = ifStatement.alternate;
						if (elseBlock) {
							const keyNode = parent.test.left;
							if (checkElseBlockAssignsKey(elseBlock, testBase, keyNode, context)) {
								return true;
							}
						}
						return true;
					}
				}
				if (
					(parent.test.operator === "!==" || parent.test.operator === "!=") &&
					((nodesAreEquivalent(parent.test.left, node) &&
						isUndefinedNode(parent.test.right)) ||
						(nodesAreEquivalent(parent.test.right, node) &&
							isUndefinedNode(parent.test.left)))
				) {
					return true;
				}
			}
		}

		// Additional check for 'in' checks in the same scope
		const containingBlock = findContainingBlock(current);
		if (containingBlock) {
			for (const statement of containingBlock.body) {
				if (statement.range[0] > current.range[0]) break; // Only check statements before current node
				if (
					statement.type === "IfStatement" &&
					statement.test?.type === "BinaryExpression" &&
					statement.test.operator === "in"
				) {
					const testBase = getBaseObject(statement.test.right);
					const testKey = statement.test.left;
					if (testBase === baseObj && nodesAreEquivalent(testKey, currentKeyNode)) {
						const elseBlock = statement.alternate;
						if (
							elseBlock &&
							checkElseBlockAssignsKey(elseBlock, testBase, testKey, context)
						) {
							return true;
						}
					}
				}
			}
		}

		current = parent;
	}

	return false;
}

function isUndefinedNode(node) {
    return (
        (node.type === "Identifier" && node.name === "undefined") ||
        (node.type === "UnaryExpression" && node.operator === "void")  // Accept any void expression
    );
}

/**
 * Helper to safely validate that a value is an AST node
 */
function isNode(node) {
	return (
		node !== null &&
		node !== undefined &&
		typeof node === "object" &&
		"type" in node &&
		typeof node.type === "string" &&
		"parent" in node &&
		(node.type === "Identifier" ||
			node.type === "Literal" ||
			node.type === "MemberExpression" ||
			node.type === "BinaryExpression")
	);
}

/**
 * Compares two AST nodes for structural equivalence.
 * Uses strict validation of nodes and their required properties.
 *
 * @param {Node} a - First AST node to compare
 * @param {Node} b - Second AST node to compare
 * @returns {boolean} True if nodes are structurally equivalent, false otherwise
 */
function nodesAreEquivalent(a, b) {
	if (!isNode(a) || !isNode(b)) return false;
	if (a.type !== b.type) return false;

	switch (a.type) {
		case "MemberExpression":
			return (
				nodesAreEquivalent(a.object, b.object) &&
				nodesAreEquivalent(a.property, b.property) &&
				a.computed === b.computed
			);

		case "Identifier":
			return a.name === b.name;

		case "Literal":
			return a.value === b.value;

		case "BinaryExpression":
			return (
				a.operator === b.operator &&
				nodesAreEquivalent(a.left, b.left) &&
				nodesAreEquivalent(a.right, b.right)
			);

		default:
			return false;
	}
}

// Helper function to get the type of a node
function getNodeType(node, parserServices) {
	const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
	const type = parserServices.program.getTypeChecker().getTypeAtLocation(tsNode);
	return type;
}

function getBaseObject(node) {
	let current = node;
	while (current.type === "MemberExpression") {
		current = current.object;
	}
	return current.type === "Identifier" ? current.name : null;
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
	return undefined;
}

// Helper function to check if a type is allowed to be undefined (e.g., Promise<T | undefined>)
function isTypeAllowedToBeUndefined(tsNode, typeChecker) {
	const type = typeChecker.getTypeAtLocation(tsNode);
	const symbol = type.getSymbol();

	if (!symbol || !symbol.valueDeclaration) {
		return false;
	}
	const signatureDeclaration = symbol.valueDeclaration;
	// Check for Promise<T | undefined>
	if (signatureDeclaration.type && signatureDeclaration.type.kind === SyntaxKind.TypeReference) {
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

// Helper function to find a function declaration in the current scope
function findFunctionDeclaration(name, scope) {
	const variable = scope.set.get(name);
	if (variable && variable.defs.length > 0) {
		return variable.defs[0].node;
	}
	return undefined;
}

// Helper function to get the type of a function parameter
function getFunctionParameterType(param) {
	if (!param || !param.typeAnnotation || !param.typeAnnotation.typeAnnotation) {
		return null;
	}
	return param.typeAnnotation.typeAnnotation;
}

// Helper function to check if a parameter is strictly typed (doesn't allow undefined)
function isStrictlyTypedParameter(typeAnnotation) {
	if (!typeAnnotation) {
		return false;
	}

	if (typeAnnotation.type === "TSUnionType") {
		return !typeAnnotation.types.some((t) => t.type === "TSUndefinedKeyword");
	}

	// Consider any non-union type as strictly typed
	return true;
}

// Helper function to get the type of a variable from its declaration
function getVariableType(node, scope) {
	if (node.type === "Identifier") {
		const variable = scope.variables.find((v) => v.name === node.name);
		if (variable && variable.defs.length > 0) {
			const def = variable.defs[0];
			if (def.node.type === "VariableDeclarator" && def.node.id.typeAnnotation) {
				return def.node.id.typeAnnotation.typeAnnotation;
			}
		}
	}
	return null;
}

// Helper function to check if a variable is strictly typed (doesn't allow undefined)
function isStrictlyTypedVariable(typeAnnotation) {
	if (!typeAnnotation) return false;

	if (typeAnnotation.type === "TSUnionType") {
		return !typeAnnotation.types.some((t) => t.type === "TSUndefinedKeyword");
	}

	// Consider any non-union type as strictly typed, except for 'any' and 'unknown'
	return typeAnnotation.type !== "TSAnyKeyword" && typeAnnotation.type !== "TSUnknownKeyword";
}

// Helper function to find the containing block (e.g., BlockStatement)
function findContainingBlock(node) {
	let current = node;
	while (current) {
		if (current.type === "BlockStatement" || current.type === "Program") {
			return current;
		}
		current = current.parent;
	}
	return null;
}

/**
 * Resolves the value of a variable by checking its declarations in the scope chain.
 * Handles both literal values and identifier references recursively.
 */
function getKeyValue(node, context) {
	if (node.type === "Literal") return node.value;
	if (node.type === "Identifier") {
		let scope = context.getScope();
		while (scope) {
			const variable = scope.variables.find((v) => v.name === node.name);
			if (variable) {
				// Check all definitions for initial values
				for (const def of variable.defs) {
					const init = def?.node?.init;
					if (!init) continue;

					// Base case: literal value initialization
					if (init.type === "Literal") {
						return init.value;
					}

					// Recursive case: identifier reference initialization
					if (init.type === "Identifier") {
						return getKeyValue(init, context); // Resolve recursively
					}

					// If initialization is not a literal or identifier, stop searching
					break;
				}
				break;
			}
			scope = scope.upper;
		}
		// Return the original identifier name if resolution fails
		return node.name;
	}
	return undefined;
}

/**
 * Helper to check if else block assigns the key to the base object.
 * Example: if (key in obj) { ... } else { obj[key] = defaultValue; }
 * Returns true if such a pattern is detected.
 */
function checkElseBlockAssignsKey(elseBlock, baseObjName, keyNode, context) {
	let assignsKey = false;
	const keyValue = getKeyValue(keyNode, context);

	/**
	 * Recursively traverses an AST node to check if a specific key is assigned to the base object
	 * within the node's subtree.
	 *
	 * @param {Object} node - The AST node to traverse
	 * @returns {boolean} true if the key is assigned to the base object in this subtree,
	 * false otherwise. The traversal stops when an assignment is found.
	 */
	const traverseNode = (node) => {
		if (
			node.type === "AssignmentExpression" &&
			node.left.type === "MemberExpression" &&
			node.left.object.type === "Identifier"
		) {
			const leftBase = node.left.object.name;
			const leftKeyNode = node.left.property;

			// Resolve both Identifier and Literal property keys
			let leftKey;
			if (leftKeyNode.type === "Identifier" || leftKeyNode.type === "Literal") {
				leftKey = getKeyValue(leftKeyNode, context);
			}

			if (leftBase === baseObjName && leftKey === keyValue) {
				assignsKey = true;
				return true; // Stop traversal once found
			}
		}

		// Recursively traverse child nodes
		for (const key of Object.keys(node)) {
			if (key === "parent") continue;
			const child = node[key];
			if (Array.isArray(child)) {
				for (const item of child) {
					if (item && typeof item === "object" && traverseNode(item)) {
						return true;
					}
				}
			} else if (child && typeof child === "object") {
				if (traverseNode(child)) {
					return true;
				}
			}
		}
		return false;
	};

	// Traverse the else block
	if (elseBlock.type === "BlockStatement") {
		for (const statement of elseBlock.body) {
			if (traverseNode(statement)) break;
		}
	} else {
		traverseNode(elseBlock);
	}

	return assignsKey;
}
