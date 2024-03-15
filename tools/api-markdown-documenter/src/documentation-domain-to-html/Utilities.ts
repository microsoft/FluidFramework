/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Element as HastElement } from "hast";
import { h } from "hastscript";
import type { DocumentationNode } from "../index.js";
import type { TransformationContext } from "./TransformationContext.js";
import { documentationNodesToHtml } from "./ToHtml.js";

/**
 * TODO
 */
export interface HtmlTag {
	name: string;
	attributes?: Record<string, string>;
}

/**
 * TODO
 */
export function transformChildrenUnderTag(
	tag: HtmlTag,
	children: DocumentationNode[],
	context: TransformationContext,
): HastElement {
	return h(tag.name, tag.attributes ?? {}, documentationNodesToHtml(children, context));
}

/**
 * TODO
 */
export function createAnchor(name: string): HastElement {
	return h("a", { name });
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
