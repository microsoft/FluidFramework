/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow accessing properties on objects with dynamic types",
			category: "Possible Errors",
			recommended: false,
		},
		schema: [], // no options
	},
	create(context) {
		return {
			MemberExpression(node) {
				if (node.object.type === "Identifier" && node.property.type === "Identifier") {
					const variable = context
						.getScope()
						.variables.find((v) => v.name === node.object.name);
					if (variable && variable.defs.length > 0) {
						const typeAnnotation = variable.defs[0].node.id.typeAnnotation;
						if (
							typeAnnotation &&
							typeAnnotation.typeAnnotation.type === "TSTypeReference"
						) {
							const typeName = typeAnnotation.typeAnnotation.typeName.name;
							const typeDef = context
								.getSourceCode()
								.scopeManager.globalScope.set.get(typeName);
							if (typeDef && typeDef.defs.length > 0) {
								const typeNode = typeDef.defs[0].node;
								if (typeNode.typeAnnotation && typeNode.typeAnnotation.members) {
									const members = typeNode.typeAnnotation.members;
									const indexSignature = members.find(
										(member) => member.type === "TSIndexSignature",
									);
									if (indexSignature) {
										context.report({
											node,
											message: `'${node.object.name}.${node.property.name}' is possibly 'undefined'`,
										});
									}
								}
							}
						}
					}
				}
			},
		};
	},
};
