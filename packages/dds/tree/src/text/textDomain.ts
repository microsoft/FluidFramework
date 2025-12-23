/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	eraseSchemaDetails,
	SchemaFactory,
	SchemaFactoryAlpha,
} from "../simple-tree/index.js";
import type { TreeNode, WithType } from "../simple-tree/index.js";

const sf = new SchemaFactoryAlpha("com.fluidframework.text");

class TextNode
	extends sf.object("Text", {
		content: SchemaFactory.required([() => StringArray], { key: "" }),
	})
	implements TextAsTree.Members
{
	public insertAt(index: number, content: string): void {
		this.content.insertAt(index, ...Array.from(content));
	}
	public removeRange(index: number, length: number): void {
		this.content.removeRange(index, length);
	}
	public characters(): Iterable<string> {
		return this.content[Symbol.iterator]();
	}
	public fullString(): string {
		return Array.from(this.characters()).join("");
	}

	public static fromString(value: string): TextNode {
		return new TextNode({ content: Array.from(value) });
	}
}

class StringArray extends sf.array("StringArray", SchemaFactory.string) {}

/**
 * A collection of text related types, schema and utilities for working with text beyond the basic {@link SchemaStatics.string}.
 * @internal
 */
export namespace TextAsTree {
	/**
	 * Statics for text nodes.
	 * @internal
	 */
	export interface Statics {
		fromString(value: string): Tree;
	}

	/**
	 * Interface for a text node.
	 * @internal
	 */
	export interface Members {
		characters(): Iterable<string>;
		fullString(): string;

		insertAt(index: number, content: string): void;
		removeRange(index: number, length: number): void;
	}

	/**
	 * Schema for a text node.
	 * @internal
	 */
	export const Tree = eraseSchemaDetails<Members, Statics>()(TextNode);
	export type Tree = Members & TreeNode & WithType<"com.fluidframework.text.Text">;
}
