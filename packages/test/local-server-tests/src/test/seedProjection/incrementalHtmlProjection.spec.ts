/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import type {
	IAdditionalSummaryTree,
	ISummaryGenerationContext,
} from "@fluidframework/container-runtime/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import type { ISummaryContext } from "@fluidframework/driver-definitions/internal";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import { projectionKey, type HtmlPartId } from "./externalSeedFile.js";
import { parseHtml } from "./htmlSeedFormat.js";
import {
	HtmlDocument,
	HtmlElement,
	toTree,
	viewConfiguration,
	type HtmlView,
} from "./htmlTreeSchema.js";
import { IncrementalHtmlProjection } from "./incrementalHtmlProjection.js";
import { treeFactory, treeId } from "./nativeSeedBaseline.js";

/** One synthetic accepted storage identity; the application may only reuse paths relative to this exact parent. */
function acceptedContext(name: string, sequence = 1): ISummaryContext {
	return {
		ackHandle: name,
		proposalHandle: `proposal-${name}`,
		referenceSequenceNumber: sequence,
	};
}

/** Supply a runtime-shaped generation context, with overrides for full/untracked/unknown-parent cases. */
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

/** Mutate a nested native node so the actual SharedTree event path, not an explicit test dirty flag, invalidates a part. */
function changePart(view: HtmlView, part: HtmlPartId, value: string): void {
	const element = view.root[part][0];
	assert(element instanceof HtmlElement);
	element.attributes.set("title", value);
}

/** Adopt the captured state as if the runtime had successfully refreshed this proposal's native/GC/parent state. */
function accept(result: IAdditionalSummaryTree, context: ISummaryContext): void {
	assert(result.onAccepted !== undefined);
	result.onAccepted(context);
}

/** Assert the representation has no HTML payload for this part and references its original subtree path. */
function assertHandle(result: IAdditionalSummaryTree, part: HtmlPartId): void {
	assert.deepEqual(result.summary.tree[part], {
		type: SummaryType.Handle,
		handleType: SummaryType.Tree,
		handle: `/${projectionKey}/${part}`,
	});
}

// Validate dirty-region tracking against proposal-captured state without requiring a service for each edge case.
describe("Seed projection reference: incremental HTML parts", () => {
	let runtime: MockFluidDataStoreRuntime;
	let view: HtmlView;
	let projection: IncrementalHtmlProjection;
	let serialized: Record<HtmlPartId, number>;

	beforeEach(() => {
		runtime = new MockFluidDataStoreRuntime({
			attachState: AttachState.Detached,
			idCompressor: createIdCompressor(),
		});
		view = treeFactory.create(runtime, treeId).viewWith(viewConfiguration);
		view.initialize(
			new HtmlDocument({
				first: toTree(parseHtml("<p>first</p>")),
				second: toTree(parseHtml("<p>second</p>")),
			}),
		);
		serialized = { first: 0, second: 0 };
		projection = new IncrementalHtmlProjection(view, (part) => {
			serialized[part]++;
		});
	});

	afterEach(() => {
		projection.dispose();
		view.dispose();
		runtime.dispose();
	});

	// Establish an accepted baseline once, then skip both tree traversal/serialization and payload emission.
	it("reuses both unchanged subtrees before either serializer is called", () => {
		const parent = acceptedContext("first");
		accept(projection.summarize(generationContext(undefined, { fullTree: true })), parent);
		const result = projection.summarize(generationContext(parent));
		assertHandle(result, "first");
		assertHandle(result, "second");
		assert.deepEqual(serialized, { first: 1, second: 1 });
	});

	// Descendant changes invalidate only the part that owns the changed native subtree.
	it("serializes only the changed part", () => {
		const parent = acceptedContext("first");
		accept(projection.summarize(generationContext()), parent);
		changePart(view, "first", "changed");
		const result = projection.summarize(generationContext(parent));
		assert.equal(result.summary.tree.first?.type, SummaryType.Tree);
		assertHandle(result, "second");
		assert.deepEqual(serialized, { first: 2, second: 1 });
	});

	// Acceptance promotes generation-time counters; edits occurring while storage is uploading must stay dirty.
	it("does not mark edits after capture clean when that proposal is accepted", () => {
		const pending = projection.summarize(generationContext());
		changePart(view, "first", "edited during upload");
		const parent = acceptedContext("late");
		accept(pending, parent);
		const next = projection.summarize(generationContext(parent));
		assert.equal(next.summary.tree.first?.type, SummaryType.Tree);
		assertHandle(next, "second");
		assert.deepEqual(serialized, { first: 2, second: 1 });
	});

	// A failed attempt cannot become a reuse base, and a late ACK must promote its own captured state.
	it("keeps retries and a late accepted proposal aligned with their actual parent", () => {
		const first = acceptedContext("first");
		accept(projection.summarize(generationContext()), first);
		changePart(view, "first", "proposal two");
		const pending = projection.summarize(generationContext(first));
		assertHandle(pending, "second");
		changePart(view, "second", "later edit");
		const retry = projection.summarize(generationContext(first));
		assert.equal(retry.summary.tree.first?.type, SummaryType.Tree);
		assert.equal(retry.summary.tree.second?.type, SummaryType.Tree);
		const late = acceptedContext("late", 2);
		accept(pending, late);
		const next = projection.summarize(generationContext(late));
		assertHandle(next, "first");
		assert.equal(next.summary.tree.second?.type, SummaryType.Tree);
		assert.deepEqual(serialized, { first: 3, second: 3 });
	});

	// A matching sequence number does not prove that reuse paths exist in a different storage parent.
	it("regenerates for an unknown parent without disturbing the accepted mapping", () => {
		const parent = acceptedContext("known");
		accept(projection.summarize(generationContext()), parent);
		projection.summarize(generationContext(acceptedContext("different", 1)));
		assert.deepEqual(serialized, { first: 2, second: 2 });
		const result = projection.summarize(generationContext(parent));
		assertHandle(result, "first");
		assertHandle(result, "second");
		assert.deepEqual(serialized, { first: 2, second: 2 });
	});

	// Attach/full/untracked generation must be independently readable, regardless of a reusable tracked baseline.
	it("emits complete content for full and untracked generation", () => {
		const parent = acceptedContext("first");
		accept(projection.summarize(generationContext()), parent);
		const full = projection.summarize(generationContext(parent, { fullTree: true }));
		const untracked = projection.summarize(generationContext(parent, { trackState: false }));
		for (const result of [full, untracked]) {
			assert.equal(result.summary.tree.first?.type, SummaryType.Tree);
			assert.equal(result.summary.tree.second?.type, SummaryType.Tree);
		}
		assert.equal(untracked.onAccepted, undefined);
		assert.deepEqual(serialized, { first: 3, second: 3 });
	});

	// A part can be replaced at its parent; rebind subscriptions so later descendants of the new part stay tracked.
	it("invalidates a replaced part and listens to its replacement", () => {
		const parent = acceptedContext("first");
		accept(projection.summarize(generationContext()), parent);
		view.root.first = toTree(parseHtml("<p>replacement</p>"));
		const replaced = projection.summarize(generationContext(parent));
		assertHandle(replaced, "second");
		const nextParent = acceptedContext("replacement", 2);
		accept(replaced, nextParent);
		changePart(view, "first", "new descendant edit");
		const next = projection.summarize(generationContext(nextParent));
		assert.equal(next.summary.tree.first?.type, SummaryType.Tree);
		assertHandle(next, "second");
		assert.deepEqual(serialized, { first: 3, second: 1 });
	});

	// A moved node may not notify itself; subscriptions to both containing subtrees must invalidate both parts.
	it("invalidates both parts when native content moves between them", () => {
		const parent = acceptedContext("first");
		accept(projection.summarize(generationContext()), parent);
		view.root.second.moveToEnd(0, view.root.first);
		const moved = projection.summarize(generationContext(parent));
		assert.equal(moved.summary.tree.first?.type, SummaryType.Tree);
		assert.equal(moved.summary.tree.second?.type, SummaryType.Tree);
		assert.deepEqual(serialized, { first: 2, second: 2 });
	});

	// Root replacement changes every path's model source even if the previous per-part nodes emit no events.
	it("rebinds both parts when the entire document root is replaced", () => {
		const parent = acceptedContext("first");
		accept(projection.summarize(generationContext()), parent);
		view.root = new HtmlDocument({
			first: toTree(parseHtml("<p>new first</p>")),
			second: toTree(parseHtml("<p>new second</p>")),
		});
		const replaced = projection.summarize(generationContext(parent));
		assert.equal(replaced.summary.tree.first?.type, SummaryType.Tree);
		assert.equal(replaced.summary.tree.second?.type, SummaryType.Tree);
		const nextParent = acceptedContext("replacement", 2);
		accept(replaced, nextParent);
		changePart(view, "second", "new descendant edit");
		const next = projection.summarize(generationContext(nextParent));
		assertHandle(next, "first");
		assert.equal(next.summary.tree.second?.type, SummaryType.Tree);
		assert.deepEqual(serialized, { first: 2, second: 3 });
	});
});
