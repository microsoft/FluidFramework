/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type FieldKey,
	type UpPath,
	clonePath,
	compareFieldUpPaths,
	compareUpPaths,
	getDepth,
	rootField,
	rootFieldKey,
} from "../../core/index.js";
// This import is targeting the code being tested
// eslint-disable-next-line import/no-internal-modules
import { getDetachedFieldContainingPath } from "../../core/tree/pathTree.js";
import { brand } from "../../util/index.js";

const rootKey = brand<FieldKey>("root");
const fooKey = brand<FieldKey>("foo");

const root: UpPath = {
	parent: undefined,
	parentField: rootKey,
	parentIndex: 0,
};

const child: UpPath = {
	parent: root,
	parentField: fooKey,
	parentIndex: 0,
};

const grandChild: UpPath = {
	parent: child,
	parentField: fooKey,
	parentIndex: 0,
};

describe("pathTree", () => {
	describe("getDepth", () => {
		it("Returns 0 for the root", () => {
			assert.equal(getDepth(root), 0);
		});
		it("Returns 1 for a child of the root", () => {
			assert.equal(getDepth(child), 1);
		});
		it("Returns 2 for a child of the child of the root", () => {
			assert.equal(getDepth(grandChild), 2);
		});
	});

	describe("compareUpPaths", () => {
		it("handles undefined", () => {
			assert(compareUpPaths(undefined, undefined));
			assert(!compareUpPaths(root, undefined));
			assert(!compareUpPaths(undefined, root));
		});

		it("handles same object", () => {
			assert(compareUpPaths(root, root));
			assert(compareUpPaths(grandChild, grandChild));
		});

		it("handles different objects cases", () => {
			// Different contents and depths
			assert(!compareUpPaths(child, grandChild));

			const root2 = {
				parent: undefined,
				parentField: rootKey,
				parentIndex: 0,
			};
			assert(compareUpPaths(root, root2));
			// Common parent object, same data
			assert(
				compareUpPaths(child, {
					parent: root,
					parentField: fooKey,
					parentIndex: 0,
				}),
			);
			// Equal parent object, same data
			assert(
				compareUpPaths(child, {
					parent: root2,
					parentField: fooKey,
					parentIndex: 0,
				}),
			);
			// Same parent object, different data (index)
			assert(
				!compareUpPaths(child, {
					parent: root,
					parentField: fooKey,
					parentIndex: 1,
				}),
			);
			// Same parent object, different data (key)
			assert(
				!compareUpPaths(child, {
					parent: root,
					parentField: brand<FieldKey>("bar"),
					parentIndex: 0,
				}),
			);
			// Different parent object, same data
			assert(
				compareUpPaths(child, {
					parent: root2,
					parentField: fooKey,
					parentIndex: 0,
				}),
			);
		});
	});

	it("compareFieldUpPaths", () => {
		assert(
			compareFieldUpPaths(
				{ field: fooKey, parent: undefined },
				{ field: fooKey, parent: undefined },
			),
		);
		assert(
			!compareFieldUpPaths(
				{ field: fooKey, parent: undefined },
				{ field: rootKey, parent: undefined },
			),
		);
		assert(
			compareFieldUpPaths(
				{ field: fooKey, parent: root },
				{ field: fooKey, parent: clonePath(root) },
			),
		);
		assert(
			!compareFieldUpPaths({ field: fooKey, parent: root }, { field: fooKey, parent: child }),
		);
	});

	describe("getDetachedFieldContainingPath", () => {
		it("returns the DetachedField of a simple path", () => {
			const path: UpPath = {
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			};
			const detachedField = getDetachedFieldContainingPath(path);
			assert.equal(detachedField, rootField);
		});
		it("returns the DetachedField of a nested path", () => {
			const path: UpPath = {
				parent: {
					parent: undefined,
					parentField: rootFieldKey,
					parentIndex: 0,
				},
				parentField: brand("foo"),
				parentIndex: 0,
			};
			const detachedField = getDetachedFieldContainingPath(path);
			assert.equal(detachedField, rootField);
		});
	});
});
