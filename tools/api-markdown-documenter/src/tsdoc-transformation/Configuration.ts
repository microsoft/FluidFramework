/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";
import { type DocDeclarationReference, type DocNode } from "@microsoft/tsdoc";

/**
 * Configuration for transforming TSDoc `DocNode`s based on their "kind".
 */
// Prefer index signature for documentation, since it allows documenting the key name.
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface Transformations<TOut> {
	/**
	 * Maps from a `DocNode`'s `DocNodeKind` to a transformation implementation
	 * for that kind of node.
	 */
	[docNodeKind: string]: Transformation<TOut>;
}

/**
 * Transforms a TSDoc `DocNode`.
 *
 * @param node - The input node to be transformed.
 * @param context - Transformation context.
 */
export type Transformation<TOut> = (node: DocNode, context: TransformationContext<TOut>) => TOut;

/**
 * TSDoc `DocNode` transformation context.
 */
export interface TransformationContext<TOut> {
	/**
	 * The API item with which the documentation node(s) are associated.
	 */
	readonly ApiItem: ApiItem;

	/**
	 * Callback for resolving symbolic links to API items.
	 *
	 * @param codeDestination - The referenced target.
	 *
	 * @returns The appropriate `ApiItem` target if the reference can be resolved.
	 * Otherwise, returns the error returned from the model.
	 */
	readonly resolveApiReference: (codeDestination: DocDeclarationReference) => ApiItem | Error;

	/**
	 * Complete set of transformations (includes defaults and user-specified).
	 */
	transformations: Transformations<TOut>;
}
