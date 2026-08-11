/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FieldKey, ITreeCursorSynchronous, JsonableTree } from "../../core/index.js";
import { cursorForJsonableTreeNode } from "../../feature-libraries/index.js";
import { stringSchema } from "../../simple-tree/index.js";
import { brand } from "../../util/index.js";

// TODO: Users of this are mainly working with in memory representations.
// Therefore it should not be using JsonableTrees.
// The usages of this (and other JsonableTrees) such as ValueChangeset should be changed to use
// a tree format intended for in memory use, such as Cursor or MapTree.
/**
 * Arbitrary tree with value `s`
 */
export function testTree(s: string): JsonableTree {
	return { type: brand(stringSchema.identifier), value: s };
}

/**
 * Cursor over arbitrary tree with value `s`
 */
export function testTreeCursor(s: string): ITreeCursorSynchronous {
	// For encoding tests to pass, cursors must be deepEqual to those produced by decode, so the tree text format must be used here.
	return cursorForJsonableTreeNode(testTree(s));
}

export const fooKey: FieldKey = brand("foo");
