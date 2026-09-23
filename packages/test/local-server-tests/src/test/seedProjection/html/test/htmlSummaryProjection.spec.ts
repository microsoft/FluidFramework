/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import type {
	IApplicationProjectionSummary,
	ISummaryGenerationContext,
} from "@fluidframework/container-runtime/internal";
import {
	SummaryType,
	type ISummaryTree,
	type SummaryObject,
} from "@fluidframework/driver-definitions";
import type { ISummaryContext } from "@fluidframework/driver-definitions/internal";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import { RevertibleStatus, type Revertible } from "@fluidframework/tree";

import { projectionLayout } from "../appProjection.js";
import { parseHtml } from "../htmlSeedFormat.js";
import {
	documentFromParts,
	HtmlElement,
	HtmlParts,
	toTree,
	viewConfiguration,
	type HtmlView,
} from "../htmlTreeSchema.js";
import { HtmlSummaryProjection } from "../htmlSummaryProjection.js";
import { treeFactory, treeId } from "../runtimeMaterialization.js";
import { treePart } from "./htmlTestUtils.js";

/** A synthetic storage parent; reuse is allowed only against this exact accepted context. */
function acceptedContext(name: string, sequence = 1): ISummaryContext {
	return {
		ackHandle: name,
		proposalHandle: `proposal-${name}`,
		referenceSequenceNumber: sequence,
	};
}

/** Runtime-shaped context without a service for focused proposal-lifecycle tests. */
function generationContext(
	previousSummary?: ISummaryContext,
	options: Partial<ISummaryGenerationContext> = {},
): ISummaryGenerationContext {
	return {
		fullTree: false,
		trackState: true,
		referenceSequenceNumber: 2,
		previousSummary,
		...options,
	};
}

/** Change a nested node through SharedTree, never through a test-only dirty flag. */
function changePart(view: HtmlView, name: string, value: string): void {
	const element = treePart(view, name)[0];
	assert(element instanceof HtmlElement);
	element.attributes.set("title", value);
}

/** Adopt exactly the captured proposal state, as the runtime does after refreshing its accepted parent. */
function accept(result: IApplicationProjectionSummary, context: ISummaryContext): void {
	assert(result.onAccepted !== undefined);
	result.onAccepted(context);
}

/** Inspect only representations, without accidentally invoking the serializer being measured. */
function partsOf(result: IApplicationProjectionSummary): ISummaryTree {
	const parts: SummaryObject | undefined = result.summary.tree[projectionLayout.parts];
	assert(parts?.type === SummaryType.Tree);
	return parts;
}

/** A reused part contains no HTML payload and points to the same named subtree under the previous parent. */
function assertHandle(result: IApplicationProjectionSummary, name: string): void {
	assert.deepEqual(partsOf(result).tree[name], {
		type: SummaryType.Handle,
		handleType: SummaryType.Tree,
		handle: `/${projectionLayout.key}/${projectionLayout.parts}/${name}`,
	});
}

describe("Seed projection reference: model-to-application summary", () => {
	let runtime: MockFluidDataStoreRuntime;
	let view: HtmlView;
	let projection: HtmlSummaryProjection;
	let serialized: Record<string, number>;

	beforeEach(() => {
		runtime = new MockFluidDataStoreRuntime({
			attachState: AttachState.Detached,
			idCompressor: createIdCompressor(),
		});
		view = treeFactory.create(runtime, treeId).viewWith(viewConfiguration);
		view.initialize(
			documentFromParts([
				{ name: "first", payload: "<p>first</p>" },
				{ name: "second", payload: "<p>second</p>" },
				{ name: "third", payload: "<p>third</p>" },
			]),
		);
		serialized = {};
		projection = new HtmlSummaryProjection(view, (name) => {
			serialized[name] = (serialized[name] ?? 0) + 1;
		});
	});
	afterEach(() => {
		projection.dispose();
		view.dispose();
		runtime.dispose();
	});

	it("reuses every unchanged subtree before calling any serializer", () => {
		const parent = acceptedContext("first");
		accept(projection.summarize(generationContext(undefined, { fullTree: true })), parent);
		const result = projection.summarize(generationContext(parent));
		for (const name of view.root.parts.keys()) assertHandle(result, name);
		assert.deepEqual(serialized, { first: 1, second: 1, third: 1 });
	});

	it("serializes only the changed part among more than two parts", () => {
		const parent = acceptedContext("first");
		accept(projection.summarize(generationContext()), parent);
		changePart(view, "third", "changed");
		const result = projection.summarize(generationContext(parent));
		assert.equal(partsOf(result).tree.third?.type, SummaryType.Tree);
		assertHandle(result, "first");
		assertHandle(result, "second");
		assert.deepEqual(serialized, { first: 1, second: 1, third: 2 });
	});

	it("does not mark edits after capture clean when that proposal is accepted", () => {
		const pending = projection.summarize(generationContext());
		changePart(view, "first", "edited during upload");
		const parent = acceptedContext("late");
		accept(pending, parent);
		const next = projection.summarize(generationContext(parent));
		assert.equal(partsOf(next).tree.first?.type, SummaryType.Tree);
		assertHandle(next, "second");
	});

	it("keeps retries and a late accepted proposal aligned with their actual parent", () => {
		const first = acceptedContext("first");
		accept(projection.summarize(generationContext()), first);
		changePart(view, "first", "proposal two");
		const pending = projection.summarize(generationContext(first));
		changePart(view, "second", "later edit");
		const retry = projection.summarize(generationContext(first));
		assert.equal(partsOf(retry).tree.first?.type, SummaryType.Tree);
		assert.equal(partsOf(retry).tree.second?.type, SummaryType.Tree);
		const late = acceptedContext("late", 2);
		accept(pending, late);
		const next = projection.summarize(generationContext(late));
		assertHandle(next, "first");
		assert.equal(partsOf(next).tree.second?.type, SummaryType.Tree);
		assert.deepEqual(serialized, { first: 3, second: 3, third: 1 });
	});

	it("regenerates for an unknown parent without disturbing the accepted mapping", () => {
		const parent = acceptedContext("known");
		accept(projection.summarize(generationContext()), parent);
		projection.summarize(generationContext(acceptedContext("different", 1)));
		const result = projection.summarize(generationContext(parent));
		for (const name of view.root.parts.keys()) assertHandle(result, name);
		assert.deepEqual(serialized, { first: 2, second: 2, third: 2 });
	});

	it("emits complete content for full and untracked generation", () => {
		const parent = acceptedContext("first");
		accept(projection.summarize(generationContext()), parent);
		const full = projection.summarize(generationContext(parent, { fullTree: true }));
		const untracked = projection.summarize(generationContext(parent, { trackState: false }));
		for (const result of [full, untracked]) {
			for (const name of view.root.parts.keys())
				assert.equal(partsOf(result).tree[name]?.type, SummaryType.Tree);
		}
		assert.equal(untracked.onAccepted, undefined);
	});

	it("does not reuse another subtree that takes the same name and initial dirty counter", () => {
		const parent = acceptedContext("first");
		accept(projection.summarize(generationContext()), parent);
		view.root.parts.delete("first");
		view.root.parts.set("first", toTree(parseHtml("<p>replacement</p>")));
		const replacement = projection.summarize(generationContext(parent));
		assert.equal(partsOf(replacement).tree.first?.type, SummaryType.Tree);
		assertHandle(replacement, "second");
		const nextParent = acceptedContext("replacement", 2);
		accept(replacement, nextParent);
		changePart(view, "first", "new descendant edit");
		const next = projection.summarize(generationContext(nextParent));
		assert.equal(partsOf(next).tree.first?.type, SummaryType.Tree);
		assert.deepEqual(serialized, { first: 3, second: 1, third: 1 });
	});

	for (const removedScope of ["part", "parts map", "document"]) {
		it(`keeps edits dirty when undo restores the same subtree after removing its ${removedScope}`, () => {
			const parent = acceptedContext("before-edit");
			accept(projection.summarize(generationContext()), parent);
			const originalRoot = treePart(view, "first");
			changePart(view, "first", "changed after acceptance");
			const revertibles: Revertible[] = [];
			const unsubscribe = view.events.on("commitApplied", (_commit, getRevertible) => {
				// Capture inside the event; undo only removal, not the earlier content edit.
				if (getRevertible !== undefined) revertibles.push(getRevertible());
			});
			try {
				if (removedScope === "part") {
					view.root.parts.delete("first");
				} else if (removedScope === "parts map") {
					view.root.parts = new HtmlParts([]);
				} else {
					view.root = documentFromParts([]);
				}
			} finally {
				unsubscribe();
			}
			try {
				assert.equal(revertibles.length, 1);
				revertibles[0].revert();
				assert.equal(
					treePart(view, "first"),
					originalRoot,
					"Undo resurrects the same node object",
				);
				const restored = projection.summarize(generationContext(parent));
				const part: SummaryObject | undefined = partsOf(restored).tree.first;
				assert(
					part?.type === SummaryType.Tree,
					"A new subscription must not match an old revision counter",
				);
				assert.deepEqual(part.tree[projectionLayout.payload], {
					type: SummaryType.Blob,
					content: '<p title="changed after acceptance">first</p>',
				});
				assert.equal(serialized.first, 2);
				const nextParent = acceptedContext("restored", 2);
				accept(restored, nextParent);
				assertHandle(projection.summarize(generationContext(nextParent)), "first");
				assert.equal(serialized.first, 2);
			} finally {
				for (const revertible of revertibles) {
					if (revertible.status === RevertibleStatus.Valid) revertible.dispose();
				}
			}
		});
	}

	it("adds, removes, and renames parts without invalidating unrelated paths", () => {
		const parent = acceptedContext("first");
		accept(projection.summarize(generationContext()), parent);
		view.root.parts.delete("second");
		view.root.parts.set("renamed", toTree(parseHtml("<p>second</p>")));
		view.root.parts.set("fourth", toTree(parseHtml("<p>new</p>")));
		const next = projection.summarize(generationContext(parent));
		assert.deepEqual(Object.keys(partsOf(next).tree), ["first", "fourth", "renamed", "third"]);
		assertHandle(next, "first");
		assertHandle(next, "third");
		assert.equal(partsOf(next).tree.renamed?.type, SummaryType.Tree);
		assert.equal(partsOf(next).tree.fourth?.type, SummaryType.Tree);
	});

	it("keeps structural edits after capture dirty when their earlier proposal is accepted", () => {
		const pending = projection.summarize(generationContext());
		view.root.parts.delete("second");
		view.root.parts.set("second", toTree(parseHtml("<p>new identity</p>")));
		view.root.parts.set("later", toTree(parseHtml("<p>added</p>")));
		const parent = acceptedContext("late");
		accept(pending, parent);
		const next = projection.summarize(generationContext(parent));
		assertHandle(next, "first");
		assert.equal(partsOf(next).tree.second?.type, SummaryType.Tree);
		assert.equal(partsOf(next).tree.later?.type, SummaryType.Tree);
	});

	it("invalidates both parts when native content moves between them", () => {
		const parent = acceptedContext("first");
		accept(projection.summarize(generationContext()), parent);
		treePart(view, "second").moveToEnd(0, treePart(view, "first"));
		const moved = projection.summarize(generationContext(parent));
		assert.equal(partsOf(moved).tree.first?.type, SummaryType.Tree);
		assert.equal(partsOf(moved).tree.second?.type, SummaryType.Tree);
		assertHandle(moved, "third");
	});

	for (const replaceDocument of [true, false]) {
		it(`rebinds after replacing the ${replaceDocument ? "document" : "parts map"}`, () => {
			const parent = acceptedContext("first");
			accept(projection.summarize(generationContext()), parent);
			if (replaceDocument) {
				view.root = documentFromParts([{ name: "first", payload: "<p>new</p>" }]);
			} else {
				view.root.parts = new HtmlParts([["first", toTree(parseHtml("<p>new</p>"))]]);
			}
			const replaced = projection.summarize(generationContext(parent));
			assert.equal(partsOf(replaced).tree.first?.type, SummaryType.Tree);
			assert.deepEqual(Object.keys(partsOf(replaced).tree), ["first"]);
			const nextParent = acceptedContext("replacement", 2);
			accept(replaced, nextParent);
			changePart(view, "first", "new descendant edit");
			assert.equal(
				partsOf(projection.summarize(generationContext(nextParent))).tree.first?.type,
				SummaryType.Tree,
			);
		});
	}

	it("projects zero and one parts, including removal of the last accepted part", () => {
		view.root = documentFromParts([]);
		const empty = acceptedContext("empty");
		accept(projection.summarize(generationContext()), empty);
		assert.deepEqual(partsOf(projection.summarize(generationContext(empty))).tree, {});
		view.root.parts.set("only", toTree([]));
		const one = acceptedContext("one", 2);
		accept(projection.summarize(generationContext(empty)), one);
		assertHandle(projection.summarize(generationContext(one)), "only");
		view.root.parts.delete("only");
		assert.deepEqual(partsOf(projection.summarize(generationContext(one))).tree, {});
		assert.deepEqual(serialized, { only: 1 });
	});

	it("rejects unsafe names before invoking a serializer", () => {
		view.root.parts.set("../escape", toTree([]));
		assert.throws(() => projection.summarize(generationContext()), /unsafe HTML part name/);
		assert.deepEqual(serialized, {});
	});
});
