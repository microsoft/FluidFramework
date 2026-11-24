/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Compile-time tests for the types an application sees when it opens a SharedTree view.
// Import from the same entry points as an application so these checks also catch missing exports.
// TypeScript checks the function bodies without calling them. A line marked with
// `@ts-expect-error` must fail to compile without the directive, or the test fails.

import {
	SchemaFactory,
	TreeViewConfiguration,
	type ITree,
	type TreeView,
} from "@fluidframework/tree";
import {
	asAlpha,
	type IncompatibleTreeResult,
	type OpenTreeViewResult,
	type ReadyTreeResult,
	type TreeViewAlpha,
	type UninitializedTreeResult,
} from "@fluidframework/tree/alpha";

import type { areSafelyAssignable, requireTrue } from "../../util/index.js";

const schemaFactory = new SchemaFactory("openView.types");

// These functions test the consumer-facing declarations without running any tree operations.

/**
 * Object schema that distinguishes the node an application reads from the object literal it can insert.
 */
class Note extends schemaFactory.object("Note", { title: schemaFactory.string }) {}
const config = new TreeViewConfiguration({ schema: Note });

/**
 * Checks that `openView` is available through the alpha entry point without changing the stable `viewWith` signature.
 *
 * @param tree - A tree obtained through the stable entry point.
 */
function checkEntryPoints(tree: ITree): void {
	const legacy = tree.viewWith(config);
	type _legacy = requireTrue<areSafelyAssignable<typeof legacy, TreeView<typeof Note>>>;
	const result = asAlpha(tree).openView(config);
	type _result = requireTrue<
		areSafelyAssignable<typeof result, OpenTreeViewResult<typeof Note>>
	>;

	type _alphaOnly = requireTrue<areSafelyAssignable<Extract<keyof ITree, "openView">, never>>;
}

/**
 * Checks that `kind` identifies each result type without a cast.
 *
 * @remarks
 * After all known cases have been handled, the result must narrow to `never`.
 * A new result kind will therefore fail this check until the switch handles it.
 *
 * @param result - The result before the caller checks its kind.
 */
function checkNarrowing(result: OpenTreeViewResult<typeof Note>): void {
	switch (result.kind) {
		case "ready": {
			type _ready = requireTrue<
				areSafelyAssignable<typeof result, ReadyTreeResult<typeof Note>>
			>;
			return;
		}
		case "uninitialized": {
			type _initializer = requireTrue<
				areSafelyAssignable<typeof result, UninitializedTreeResult<typeof Note>>
			>;
			return;
		}
		case "incompatible": {
			type _error = requireTrue<areSafelyAssignable<typeof result, IncompatibleTreeResult>>;
			return;
		}
		default: {
			type _exhaustive = requireTrue<areSafelyAssignable<typeof result, never>>;
		}
	}
}

/**
 * Checks that opening returns the full alpha view with its distinct root read and write types.
 *
 * @remarks
 * Reading the root must yield a `Note`, but assigning to it must also accept a plain object with a string title.
 *
 * @param result - The ready result for the note schema.
 */
function checkReadyView(result: ReadyTreeResult<typeof Note>): void {
	const { view } = result;
	type _fullView = requireTrue<areSafelyAssignable<typeof view, TreeViewAlpha<typeof Note>>>;
	type _read = requireTrue<areSafelyAssignable<typeof view.root, Note>>;
	view.root = { title: "Draft" };

	// @ts-expect-error -- The setter accepts insertable content for Note, not arbitrary objects.
	view.root = { title: 42 };
}

/**
 * Checks that initialization accepts note content and returns a ready view without exposing the root beforehand.
 *
 * @param initializer - The result for a tree that has not been initialized.
 */
function checkInitializer(initializer: UninitializedTreeResult<typeof Note>): void {
	type _noView = requireTrue<
		areSafelyAssignable<
			Extract<
				keyof typeof initializer,
				| "root"
				| "events"
				| "schema"
				| "upgradeSchema"
				| "compatibility"
				| "viewIncompatibilities"
				| "upgradeIncompatibilities"
			>,
			never
		>
	>;
	const view = initializer.initialize({ title: "Draft" });
	type _ready = requireTrue<areSafelyAssignable<typeof view, TreeViewAlpha<typeof Note>>>;

	// @ts-expect-error -- A number cannot initialize the string title.
	initializer.initialize({ title: 42 });
}

/**
 * Checks that an incompatible result exposes only its kind and the diagnostics for viewing and upgrading.
 */
type _diagnosticKeys = requireTrue<
	areSafelyAssignable<
		keyof IncompatibleTreeResult,
		"kind" | "viewIncompatibilities" | "upgradeIncompatibilities"
	>
>;
