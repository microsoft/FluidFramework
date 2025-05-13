/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// Allow importing from these specific files which are being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { findAncestor, findCommonAncestor } from "../../core/rebase/index.js";

interface Node {
	parent?: Node;
}

function node(parent?: Node): Node {
	return {
		parent,
	};
}

describe("findAncestor", () => {
	function assertAncestor(
		descendant: Node | undefined,
		expectedAncestor: Node | undefined,
		expectedPath: Node[],
	): void {
		let foundAncestor = findAncestor(descendant, (n) => n === expectedAncestor);
		assert.equal(foundAncestor, expectedAncestor);
		const path: Node[] = [];
		foundAncestor = findAncestor([descendant, path], (n) => n === expectedAncestor);
		assert.equal(foundAncestor, expectedAncestor);
		assert.deepEqual(path, expectedPath);
	}

	it("returns undefined for undefined descendant", () => {
		assertAncestor(undefined, undefined, []);
	});

	it("finds nothing", () => {
		const a = node();
		assertAncestor(a, undefined, []);
	});

	it("finds self", () => {
		const a = node();
		assertAncestor(a, a, []);
	});

	it("finds parent", () => {
		const a = node();
		const b = node(a);
		assertAncestor(b, a, [b]);
	});

	it("finds ancestor", () => {
		const a = node();
		const b = node(a);
		const c = node(b);
		assertAncestor(c, a, [b, c]);
	});

	it("finds farthest ancestor", () => {
		const a = node();
		const b = node(a);
		const c = node(b);
		assert.equal(findAncestor(a), a);
		assert.equal(findAncestor(c), a);
	});

	it("has a working example doc comment", () => {
		interface Parented {
			id: string;
			parent?: Parented;
		}
		const g = { id: "g" }; // Grandparent
		const p = { parent: g, id: "p" }; // Parent
		const c = { parent: p, id: "c" }; // Child
		const path: Parented[] = [];
		const ancestor = findAncestor<Parented>([c, path], (n) => n.id === "g");
		assert.equal(ancestor, g);
		assert.deepEqual(path, [p, c]);
	});
});

describe("findCommonAncestor", () => {
	function assertCommonAncestor(
		a: Node,
		b: Node,
		expectedAncestor: Node | undefined,
		expectedPathA: Node[],
		expectedPathB: Node[],
	): void {
		const foundPathA: Node[] = [];
		const foundPathB: Node[] = [];
		const foundAncestor = findCommonAncestor([a, foundPathA], [b, foundPathB]);
		assert.equal(foundAncestor, expectedAncestor, "Found unexpected ancestor node");
		assert.deepEqual(foundPathA, expectedPathA);
		assert.deepEqual(foundPathB, expectedPathB);
	}

	it("finds nothing", () => {
		const a = node();
		const b = node();
		assertCommonAncestor(a, b, undefined, [], []);
	});

	it("accepts the same node as both inputs", () => {
		// (A)
		const a = node();
		assertCommonAncestor(a, a, a, [], []);
	});

	it("finds root parent (inclusive)", () => {
		// (A)─(B)
		const a = node();
		const b = node(a);
		assertCommonAncestor(a, b, a, [], [b]);
	});

	it("finds parent (inclusive)", () => {
		// A ─(B)─(C)
		const a = node();
		const b = node(a);
		const c = node(b);
		assertCommonAncestor(b, c, b, [], [c]);
	});

	it("finds ancestor (inclusive) on same branch", () => {
		// (A)─ B ─(C)
		const a = node();
		const b = node(a);
		const c = node(b);
		assertCommonAncestor(a, c, a, [], [b, c]);
	});

	it("finds ancestor on same branch", () => {
		// A ─ B ─(C)─ D ─(E)
		const a = node();
		const b = node(a);
		const c = node(b);
		const d = node(c);
		const e = node(d);
		assertCommonAncestor(c, e, c, [], [d, e]);
	});

	it("finds parent", () => {
		// A ─(B)
		// └─(C)
		const a = node();
		const b = node(a);
		const c = node(a);
		assertCommonAncestor(b, c, a, [b], [c]);
	});

	it("finds ancestor", () => {
		// A ─ B ─(C)
		// └─ D ─(E)
		const a = node();
		const b = node(a);
		const c = node(b);
		const d = node(a);
		const e = node(d);
		assertCommonAncestor(c, e, a, [b, c], [d, e]);
	});

	it("has a working example doc comment", () => {
		interface Parented {
			parent?: Parented;
		}
		const shared = {};
		const a = { parent: shared };
		const b1 = { parent: shared };
		const b2 = { parent: b1 };
		const pathB: Parented[] = [];
		const ancestor = findCommonAncestor<Parented>(a, [b2, pathB]);
		assert.equal(ancestor, shared);
		assert.deepEqual(pathB, [b1, b2]);
	});
});
