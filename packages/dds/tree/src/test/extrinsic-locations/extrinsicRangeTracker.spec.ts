/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	validateAssertionError,
	validateUsageError,
} from "@fluidframework/test-runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

// eslint-disable-next-line import-x/no-internal-modules -- The helper intentionally has no barrel export.
import { ExtrinsicRangeTracker } from "../../extrinsic-locations/extrinsicRangeTracker.js";
import { TreeBeta } from "../../shared-tree/index.js";
import { SchemaFactory, TreeViewConfiguration } from "../../simple-tree/index.js";
import { describeHydration, hydrateNode } from "../simple-tree/index.js";
import { createTestUndoRedoStacks, getView } from "../utils.js";

const sf = new SchemaFactory("test.extrinsicRangeTracker");

class Body extends sf.array("Body", sf.string) {
	public fullString(): string {
		return this.join("");
	}
}

class Annotation extends sf.object("Annotation", {
	start: sf.number,
	end: sf.number,
	note: sf.string,
}) {}

class Review extends sf.object("Review", {
	annotations: sf.array("Annotations", Annotation),
}) {}

class Document extends sf.object("Document", {
	body: Body,
	review: Review,
	title: sf.string,
}) {}

function createDocument(): Document {
	return new Document({
		body: ["A", "B", "C"],
		review: { annotations: [{ start: 1, end: 3, note: "existing" }] },
		title: "Review",
	});
}

function createTracker(document: Document): ExtrinsicRangeTracker<Body, Annotation, string> {
	return new ExtrinsicRangeTracker<Body, Annotation, string>(
		document.body,
		document.review.annotations,
		(start, end, note) => new Annotation({ start, end, note }),
	);
}

describe("ExtrinsicRangeTracker", () => {
	describeHydration("custom schema", (_init, hydrated) => {
		function setup(): {
			document: Document;
			tracker: ExtrinsicRangeTracker<Body, Annotation, string>;
			range: Annotation;
		} {
			const document = createDocument();
			if (hydrated) {
				hydrateNode(document);
			}
			const range = document.review.annotations[0];
			assert(range !== undefined);
			return { document, tracker: createTracker(document), range };
		}

		it("tracks existing ranges without prescribing enclosing schema or data fields", () => {
			const { document, tracker, range } = setup();
			const snapshot = tracker.getExtrinsicRange(range);
			tracker.transactOnContent((content) => {
				assert.equal(content, document.body);
				content.insertAtStart("X");
				assert.equal(content.fullString(), "XABC");
				assert.deepEqual(tracker.getExtrinsicRange(range), { start: 2, end: 4 });
				assert.deepEqual([range.start, range.end], [1, 3]);
				content.removeRange(2, 4);
				assert.deepEqual(tracker.getExtrinsicRange(range), { start: 2, end: 2 });
			});
			assert.deepEqual(snapshot, { start: 1, end: 3 });
			assert.deepEqual([range.start, range.end], [2, 2]);
			assert.equal(document.review.annotations[0], range);
			assert.equal(range.note, "existing");
		});

		it("creates, repositions, and removes ranges within the shared editing scope", () => {
			const { document, tracker, range } = setup();
			tracker.transactOnContent((content) => {
				content.insertAtStart("X");
				const added = tracker.addExtrinsicRange(0, 2, "added");
				assert(added instanceof Annotation);
				assert.equal(added.note, "added");
				tracker.setExtrinsicRange(range, 2, 3);
				content.removeAt(0);
				assert.deepEqual(tracker.getExtrinsicRange(range), { start: 1, end: 2 });
				assert.deepEqual(tracker.getExtrinsicRange(added), { start: 0, end: 1 });
				tracker.removeExtrinsicRange(added);
				assert.throws(
					() => tracker.getExtrinsicRange(added),
					validateUsageError(/does not belong/),
				);
			});
			assert.deepEqual([...document.review.annotations], [range]);
			assert.deepEqual([range.start, range.end], [1, 2]);
			const later = tracker.addExtrinsicRange(0, 1, "after");
			tracker.setExtrinsicRange(later, 1, 3);
			assert.deepEqual([later.start, later.end], [1, 3]);
			tracker.removeExtrinsicRange(later);
			assert.deepEqual([...document.review.annotations], [range]);
		});

		it("validates endpoints before invoking the range factory", () => {
			const { document, range } = setup();
			let creations = 0;
			const tracker = new ExtrinsicRangeTracker<Body, Annotation, string>(
				document.body,
				document.review.annotations,
				(start, end, note) => {
					creations++;
					return new Annotation({ start, end, note });
				},
			);
			for (const [start, end] of [
				[-1, 0],
				[0, 4],
				[2, 1],
				[0.5, 2],
				[0, Number.NaN],
				[0, Infinity],
			]) {
				assert.throws(() => tracker.addExtrinsicRange(start, end, "invalid"), UsageError);
				assert.throws(() => tracker.setExtrinsicRange(range, start, end), UsageError);
			}
			assert.equal(creations, 0);
			assert.deepEqual([range.start, range.end], [1, 3]);
			assert.equal(document.review.annotations.length, 1);
		});

		it("checks range handles by identity", () => {
			const { tracker, range } = setup();
			const handle: { readonly note: string } = range;
			assert.deepEqual(tracker.getExtrinsicRange(handle), { start: 1, end: 3 });
			for (const foreign of [
				new Annotation({ start: 1, end: 3, note: "existing" }),
				{ start: 1, end: 3, note: "existing" },
			]) {
				assert.throws(
					() => tracker.getExtrinsicRange(foreign),
					validateUsageError(/does not belong/),
				);
				assert.throws(
					() => tracker.setExtrinsicRange(foreign, 0, 1),
					validateUsageError(/does not belong/),
				);
				assert.throws(
					() => tracker.removeExtrinsicRange(foreign),
					validateUsageError(/does not belong/),
				);
			}
		});

		it("delivers invalidation events before the content edit returns", () => {
			const { document, tracker } = setup();
			let cached = document.body.fullString();
			const off = TreeBeta.on(document.body, "nodeChanged", () => {
				cached = document.body.fullString();
			});
			tracker.transactOnContent((content) => {
				content.insertAtStart("X");
				assert.equal(cached, "XABC");
				content.removeAt(0);
				assert.equal(cached, "ABC");
			});
			off();
		});

		it("keeps anchors available to observers throughout endpoint writeback", () => {
			const { tracker, range } = setup();
			const observed: Readonly<{ start: number; end: number }>[] = [];
			const off = TreeBeta.on(range, "nodeChanged", () => {
				observed.push(tracker.getExtrinsicRange(range));
			});
			tracker.transactOnContent((content) => content.insertAtStart("X"));
			off();
			assert(observed.length > 0);
			assert(observed.every(({ start, end }) => start === 2 && end === 4));
		});

		it("rejects nested scopes without losing the outer scope or subsequent edits", () => {
			const { tracker, range } = setup();
			tracker.transactOnContent((content) => {
				content.insertAtStart("X");
				assert.throws(
					() => tracker.transactOnContent(() => {}),
					validateUsageError(/Cannot nest/),
				);
				tracker.setExtrinsicRange(range, 0, 2);
				content.removeAt(0);
			});
			assert.deepEqual([range.start, range.end], [0, 1]);
			tracker.transactOnContent((content) => content.insertAtEnd("D"));
			assert.deepEqual([range.start, range.end], [0, 1]);
		});
	});

	it("reuses an existing tracker after its tree is hydrated", () => {
		const document = createDocument();
		const tracker = createTracker(document);
		const range = tracker.addExtrinsicRange(0, 2, "added");
		tracker.transactOnContent((content) => content.insertAtStart("X"));
		hydrateNode(document);
		tracker.transactOnContent((content) => content.removeAt(0));
		assert.deepEqual([range.start, range.end], [0, 2]);
		assert.deepEqual(tracker.getExtrinsicRange(range), { start: 0, end: 2 });
	});

	it("preserves partial unhydrated edits and releases the scope after a callback throws", () => {
		const document = createDocument();
		const tracker = createTracker(document);
		const range = document.review.annotations[0];
		assert(range !== undefined);
		const error = new Error("callback failed");
		assert.throws(
			() =>
				tracker.transactOnContent((content) => {
					content.insertAtStart("X");
					throw error;
				}),
			(actual) => actual === error,
		);
		assert.deepEqual([range.start, range.end], [2, 4]);
		tracker.transactOnContent((content) => content.removeAt(0));
		assert.deepEqual([range.start, range.end], [1, 3]);
	});

	for (const hydrateContent of [false, true]) {
		it(`rejects mismatched tree contexts with ${hydrateContent ? "hydrated" : "unhydrated"} content`, () => {
			const document = createDocument();
			const other = createDocument();
			if (hydrateContent) {
				hydrateNode(document);
			}
			hydrateNode(other);
			const tracker = new ExtrinsicRangeTracker<Body, Annotation, string>(
				document.body,
				other.review.annotations,
				(start, end, note) => new Annotation({ start, end, note }),
			);
			let called = false;
			assert.throws(
				() =>
					tracker.transactOnContent(() => {
						called = true;
					}),
				validateAssertionError("Content and ranges must belong to the same tree context."),
			);
			assert.equal(called, false);
		});
	}

	it("rejects concurrent edits elsewhere in the enclosing document", () => {
		const view = getView(new TreeViewConfiguration({ schema: Document }));
		view.initialize(createDocument());
		const fork = view.fork();
		const tracker = createTracker(fork.root);
		tracker.transactOnContent((content) => content.insertAtStart("X"));
		view.root.title = "Updated";
		fork.rebaseOnto(view);
		assert.equal(fork.root.body.fullString(), "ABC");
		assert.deepEqual(
			fork.root.review.annotations.map(({ start, end, note }) => [start, end, note]),
			[[1, 3, "existing"]],
		);
		assert.equal(fork.root.title, "Updated");
		fork.dispose();
		view.dispose();
	});

	it("undoes and redoes content and range edits together", () => {
		const view = getView(new TreeViewConfiguration({ schema: Document }));
		view.initialize(createDocument());
		const tracker = createTracker(view.root);
		const initial = JSON.stringify(view.root);
		const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
		tracker.transactOnContent((content) => {
			content.insertAtStart("X");
			tracker.addExtrinsicRange(0, 2, "added");
		});
		const edited = JSON.stringify(view.root);
		const undo = undoStack.pop();
		assert(undo !== undefined);
		undo.revert();
		assert.equal(JSON.stringify(view.root), initial);
		const redo = redoStack.pop();
		assert(redo !== undefined);
		redo.revert();
		assert.equal(JSON.stringify(view.root), edited);
		unsubscribe();
		view.dispose();
	});
});
