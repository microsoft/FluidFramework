/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Element as HastElement } from "hast";
import { h } from "hastscript";

import type { DocumentationNode } from "../index.js";

import { documentationNodesToHtml } from "./ToHtml.js";
import type { TransformationContext } from "./TransformationContext.js";

/**
 * An HTML tag and its (optional) attributes.
 */
export interface HtmlTag {
	/**
	 * The name of the tag.
	 */
	name: string;

	/**
	 * The optional attributes.
	 */
	attributes?: Record<string, string>;
}

/**
 * Transforms a series of child node, wrapping them in the specified tag with the specified attributes.
 */
export function transformChildrenUnderTag(
	tag: HtmlTag,
	children: DocumentationNode[],
	context: TransformationContext,
): HastElement {
	return h(tag.name, tag.attributes ?? {}, documentationNodesToHtml(children, context));
}

/**
 * Transforms children, wrapping each child in a `<li>` element.
 *
 * @param children - The list item nodes to render.
 * @param context - See {@link TransformationContext}.
 */
export function transformListChildren(
	children: DocumentationNode[],
	context: TransformationContext,
): HastElement[] {
	return children.map((child) => transformChildrenUnderTag({ name: "li" }, [child], context));
}
