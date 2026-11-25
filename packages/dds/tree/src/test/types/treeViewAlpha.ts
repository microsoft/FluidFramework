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
	type ViewTreeIncompatibilities,
	TreeViewAlpha,
	type ViewExistingResult,
} from "@fluidframework/tree/alpha";

import type { areSafelyAssignable, requireTrue } from "../../util/index.js";

const schemaFactory = new SchemaFactory("treeViewAlpha.types");

/**
 * Object schema that distinguishes the node an application reads from the object literal it can insert.
 */
class Note extends schemaFactory.object("Note", { title: schemaFactory.string }) {}
const config = new TreeViewConfiguration({ schema: Note });

/**
 * Checks that the alpha helpers accept a stable tree and preserve the note schema on both paths.
 */
function checkCreateAndLoad(tree: ITree): void {
	const legacy = tree.viewWith(config);
	type _legacy = requireTrue<areSafelyAssignable<typeof legacy, TreeView<typeof Note>>>;
	const initialized = TreeViewAlpha.initializeNew(tree, config, { title: "Draft" });
	type _initialized = requireTrue<
		areSafelyAssignable<typeof initialized, TreeViewAlpha<typeof Note>>
	>;
	// @ts-expect-error -- Initial content must match the configured note schema.
	TreeViewAlpha.initializeNew(tree, config, { title: 42 });
	const result = TreeViewAlpha.openExisting(tree, config);
	type _result = requireTrue<
		areSafelyAssignable<typeof result, ViewExistingResult<typeof Note>>
	>;
	if (result.canView) {
		type _read = requireTrue<areSafelyAssignable<typeof result.view.root, Note>>;
		result.view.root = { title: "Draft" };

		// @ts-expect-error -- The setter accepts note content, not a numeric title.
		result.view.root = { title: 42 };

		type _view = requireTrue<
			areSafelyAssignable<typeof result.view, TreeViewAlpha<typeof Note>>
		>;

		type _noDiagnostics = requireTrue<
			areSafelyAssignable<Extract<keyof typeof result, "incompatibilities">, never>
		>;
	} else {
		type _details = requireTrue<
			areSafelyAssignable<typeof result.incompatibilities, ViewTreeIncompatibilities>
		>;

		type _noView = requireTrue<
			areSafelyAssignable<Extract<keyof typeof result, "view">, never>
		>;
	}
}
