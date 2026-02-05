/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Rule } from "eslint";
import type { TSESTree } from "@typescript-eslint/utils";
import { TSDocParser } from "@microsoft/tsdoc";

/**
 *
 * @param comment - A TSDoc comment, including its opening and closing bits in case of a block comment.
 * @returns `true` if the comment contains any release tags; `false` otherwise.
 */
function hasReleaseTag(comment: string): boolean {
	const parser = new TSDocParser();
	const parserContext = parser.parseString(comment);

	const hasReleaseTag =
		parserContext.docComment.modifierTagSet.isAlpha() ||
		parserContext.docComment.modifierTagSet.isBeta() ||
		parserContext.docComment.modifierTagSet.isPublic() ||
		parserContext.docComment.modifierTagSet.isInternal();

	return hasReleaseTag;
}

/**
 * Helper function abstracted for reusability for different types of node.
 *
 * @param node - An AST node which is begin traversed.
 * @param context - The context object containing information that is relevant to the context of the rule.
 * {@link https://eslint.org/docs/latest/extend/custom-rules}
 */
function errorLoggerHelper(
	node:
		| TSESTree.TSPropertySignature
		| TSESTree.PropertyDefinition
		| TSESTree.MethodDefinition
		| TSESTree.TSMethodSignature
		| TSESTree.TSAbstractMethodDefinition
		| TSESTree.TSAbstractPropertyDefinition,
	context: Rule.RuleContext,
): void {
	const sourceCode = context.sourceCode;
	const comments = sourceCode.getCommentsBefore(node as any);

	comments.forEach((comment) => {
		// ESLint trims the asterisk of the comment while TSDocParser expects the original format of the comment block.
		const formattedComment = `/** ${comment.value} */`;
		if (hasReleaseTag(formattedComment)) {
			/**
			 * `node` object has different structure based on the AST scope type.
			 * Class Expression needs an extra traversal of the `parent` object in order to access the `name` of its parent
			 */
			const keyName = (node.key as any).name;
			const keyLine = node.key.loc.start.line;
			const parent: any = node.parent;
			const grandparent: any = parent?.parent;
			const greatGrandparent: any = grandparent?.parent;
			const containerName = grandparent?.id?.name ?? greatGrandparent?.id?.name;

			context.report({
				node: node as unknown as Rule.Node,
				message: `Including the release-tag for '${keyName}' at line ${keyLine} in ${containerName} is not allowed.`,
			});
		}
	});
}

const rule: Rule.RuleModule = {
	meta: {
		type: "problem",
		docs: {
			description: "This rule restricts any release tags on member class and interface.",
			category: "Best Practices",
		},
		schema: [],
		messages: {
			releaseTagOnMember: "Release tag on member class / interface found.",
		},
	},
	create(context: Rule.RuleContext): any {
		/**
		 * Available AST node types
		 *
		 * https://github.com/typescript-eslint/typescript-eslint/blob/6128a02cb15d500fe22fe265c83e4d7a73ae52c3/packages/eslint-plugin/src/rules/member-ordering.ts#L381-L408
		 */
		return {
			TSPropertySignature(node: TSESTree.TSPropertySignature) {
				errorLoggerHelper(node, context);
			},
			PropertyDefinition(node: TSESTree.PropertyDefinition) {
				errorLoggerHelper(node, context);
			},
			MethodDefinition(node: TSESTree.MethodDefinition) {
				errorLoggerHelper(node, context);
			},
			TSMethodSignature(node: TSESTree.TSMethodSignature) {
				errorLoggerHelper(node, context);
			},
			TSAbstractMethodDefinition(node: TSESTree.TSAbstractMethodDefinition) {
				errorLoggerHelper(node, context);
			},
			TSAbstractPropertyDefinition(node: TSESTree.TSAbstractPropertyDefinition) {
				errorLoggerHelper(node, context);
			},
		};
	},
};

export = rule;
