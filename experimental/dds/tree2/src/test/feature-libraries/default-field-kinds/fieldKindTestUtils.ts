/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldKinds,
	NodeChangeset,
	SchemaBuilder,
	singleTextCursor,
} from "../../../feature-libraries";
import { FieldKey, ValueSchema, JsonableTree, ITreeCursorSynchronous } from "../../../core";
import { brand } from "../../../util";

const builder = new SchemaBuilder("defaultFieldKinds tests");
export const testLeaf = builder.leaf("TestLeaf", ValueSchema.String);

// TODO: Users of this are mainly working with in memory representations.
// Therefore it should not be using JsonableTrees.
// The usages of this (and other JsonableTrees) such as ValueChangeset should be changed to use
// a tree format intended for in memory use, such as Cursor or MapTree.
/**
 * Arbitrary tree with value `s`
 */
export function testTree(s: string): JsonableTree {
	return { type: testLeaf.name, value: s };
}

/**
 * Cursor over arbitrary tree with value `s`
 */
export function testTreeCursor(s: string): ITreeCursorSynchronous {
	// For encoding tests to pass, cursors must be deepEqual to those produced by decode, so the tree text format must be used here.
	return singleTextCursor(testTree(s));
}

export const fooKey: FieldKey = brand("foo");

/**
 * Create a NodeChangeset with a child change to the foo field.
 */
export function changeSetForChild(change: unknown): NodeChangeset {
	return {
		fieldChanges: new Map([
			[
				fooKey,
				{
					fieldKind: FieldKinds.optional.identifier,
					change: brand(change),
				},
			],
		]),
	};
}
