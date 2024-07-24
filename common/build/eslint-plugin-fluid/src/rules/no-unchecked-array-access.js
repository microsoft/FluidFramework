/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    meta: {
        type: "problem",
        docs: {
            description: "Ignore arrays for noUncheckedIndexedAccess TypeScript compiler option.",
            category: "Best Practices",
        },
        schema: [], // No options
        messages: {
            uncheckedIndexAccess: "Unchecked access to a record index detected.",
        },
    },
    create(context) {
        const parserServices = context.parserServices;

        if (!parserServices || !parserServices.program) {
            context.report({
                node: null,
                message: "This rule requires 'parserOptions.project' in ESLint config.",
            });
            return {};
        }

        const checker = parserServices.program.getTypeChecker();

        return {
            MemberExpression(node) {
                if (node.computed) {
                    const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node.object);
                    const type = checker.getTypeAtLocation(tsNode);

                    // Check if the type is an array
                    if (checker.isArrayType(type) || checker.isTupleType(type)) {
                        return;
                    }

                    // Report unchecked indexed access for non-array types
                    context.report({
                        node,
                        messageId: "uncheckedIndexAccess",
                    });
                }
            },
        };
    },
};
