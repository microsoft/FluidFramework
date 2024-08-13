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

		if (parserServices && parserServices.program && parserServices.esTreeNodeToTSNodeMap) {
			const typeChecker = parserServices.program.getTypeChecker();

			function isIndexSignatureType(node) {
				const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node.object);
				const type = typeChecker.getTypeAtLocation(tsNode);
				return type.getStringIndexType() !== undefined;
			}

			function isTruthyCheck(node) {
				if (!node.parent) return false;

				return (
					node.optional === true || // optional chaining
					node.parent.type === "TSNonNullExpression" || // non-null assertion
					(node.parent.type === "IfStatement" && node.parent.test === node) || // simple if check
					(node.parent.type === "BinaryExpression" &&
						node.parent.operator === "in" &&
						node.parent.left === node) || // in operator
					(node.parent.type === "ForOfStatement" &&
						node.parent.right &&
						node.parent.right.callee &&
						node.parent.right.callee.property &&
						node.parent.right.callee.property.name === "entries") // for...of Object.entries()
				);
			}

			function checkPropertyAccess(node) {
				if (isIndexSignatureType(node)) {
					let current = node;

					// Recurse up the AST to see if there is a truthy check
					while (current) {
						if (isTruthyCheck(current)) {
							return; // Valid check found, exit the function
						}
						current = current.parent;
					}

					// Check if the accessed property is being used to access another property
					if (node.parent && node.parent.type === "MemberExpression" && node.parent.object === node) {
						// If no truthy check found and property is used in another access, report the error
						context.report({
							node,
							message: "Unchecked property access on index signature type.",
						});
					}
				}
			}

			return {
				MemberExpression(node) {
					checkPropertyAccess(node);
				},
			};
		}

		return {};
	},
};
