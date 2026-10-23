/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ExtrinsicLocations } from "../../extrinsic-locations/index.js";

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
	data: sf.string,
}) {}

class Review extends sf.object("Review", {
	annotations: sf.map("Annotations", Annotation),
}) {}

class Document extends sf.object("Document", {
	body: Body,
	review: Review,
	title: sf.string,
}) {}

function createDocument(): Document {
	return new Document({
		body: ["A", "B", "C"],
		review: { annotations: { range: { start: 1, end: 3, data: "existing" } } },
		title: "Review",
	});
}

function createTracker(document: Document): ExtrinsicRangeTracker<Body, Annotation, string> {
	return new ExtrinsicRangeTracker<Body, Annotation, string>(
		document.body,
		() => document.review.annotations,
		() => document.review.annotations,
		(start, end, data) => new Annotation({ start, end, data }),
	);
}

function rangeBounds(
	ranges: Pick<ExtrinsicLocations.RangeCollection<unknown>, "getRange">,
	key: string,
): ExtrinsicLocations.RangeEndpoints {
	const range = ranges.getRange(key);
	assert(range !== undefined);
	return { start: range.start.index, end: range.end.index };
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
			const range = document.review.annotations.get("range");
			assert(range !== undefined);
			return { document, tracker: createTracker(document), range };
		}

		it("tracks existing ranges independently of the enclosing schema", () => {
			const { document, tracker, range } = setup();
			const snapshot = rangeBounds(tracker, "range");
			tracker.transactOnContent((content) => {
				assert.equal(content, document.body);
				content.insertAtStart("X");
				assert.equal(content.fullString(), "XABC");
				assert.deepEqual(rangeBounds(tracker, "range"), { start: 2, end: 4 });
				assert.deepEqual([range.start, range.end], [1, 3]);
				content.removeRange(2, 4);
				assert.deepEqual(rangeBounds(tracker, "range"), { start: 2, end: 2 });
			});
			assert.deepEqual(snapshot, { start: 1, end: 3 });
			assert.deepEqual([range.start, range.end], [2, 2]);
			assert.equal(document.review.annotations.get("range"), range);
			assert.equal(range.data, "existing");
		});

		it("creates, repositions, and removes ranges between content editing scopes", () => {
			const { document, tracker, range } = setup();
			tracker.transactOnContent((content) => content.insertAtStart("X"));
			const added = tracker.trackNewRange("added", { start: 0, end: 2 }, "added");
			assert.equal(added.data, "added");
			tracker.setRangeBounds("range", { start: 2, end: 3 });
			tracker.transactOnContent((content) => {
				content.removeAt(0);
				assert.deepEqual(rangeBounds(tracker, "range"), { start: 1, end: 2 });
				assert.deepEqual(rangeBounds(tracker, "added"), { start: 0, end: 1 });
			});
			tracker.removeTrackedRange("added");
			assert.equal(tracker.getRange("added"), undefined);
			assert.deepEqual([...document.review.annotations], [["range", range]]);
			assert.deepEqual([range.start, range.end], [1, 2]);
			const later = tracker.trackNewRange("later", { start: 0, end: 1 }, "after");
			tracker.setRangeBounds("later", { start: 1, end: 3 });
			assert.deepEqual([later.start.index, later.end.index], [1, 3]);
			tracker.removeTrackedRange("later");
			assert.deepEqual([...document.review.annotations], [["range", range]]);
		});

		it("rejects range mutations during content edits before creating range nodes", () => {
			const { document, range } = setup();
			let creations = 0;
			const tracker = new ExtrinsicRangeTracker<Body, Annotation, string>(
				document.body,
				() => document.review.annotations,
				() => document.review.annotations,
				(start, end, data) => {
					creations++;
					return new Annotation({ start, end, data });
				},
			);
			tracker.transactOnContent((content) => {
				content.insertAtStart("X");
				assert.throws(
					() => tracker.trackNewRange("added", { start: 0, end: 2 }, "added"),
					validateUsageError(/while editing content/),
				);
				assert.throws(
					() => tracker.setRangeBounds("range", { start: 0, end: 2 }),
					validateUsageError(/while editing content/),
				);
				assert.throws(
					() => tracker.removeTrackedRange("range"),
					validateUsageError(/while editing content/),
				);
				assert.equal(creations, 0);
				assert.deepEqual([...tracker.keys()], ["range"]);
				assert.deepEqual(rangeBounds(tracker, "range"), { start: 2, end: 4 });
				content.removeAt(0);
			});
			assert.deepEqual([range.start, range.end], [1, 3]);
			assert.equal(range.data, "existing");
			tracker.trackNewRange("added", { start: 0, end: 2 }, "added");
			assert.equal(creations, 1);
		});

		it("validates endpoints before invoking the range factory", () => {
			const { document, range } = setup();
			let creations = 0;
			const tracker = new ExtrinsicRangeTracker<Body, Annotation, string>(
				document.body,
				() => document.review.annotations,
				() => document.review.annotations,
				(start, end, data) => {
					creations++;
					return new Annotation({ start, end, data });
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
				assert.throws(
					() => tracker.trackNewRange("invalid", { start, end }, "invalid"),
					UsageError,
				);
				assert.throws(() => tracker.setRangeBounds("range", { start, end }), UsageError);
			}
			assert.throws(
				() => tracker.trackNewRange("range", { start: 0, end: 1 }, "duplicate"),
				validateUsageError(/already tracked/),
			);
			assert.equal(creations, 0);
			assert.deepEqual([range.start, range.end], [1, 3]);
			assert.equal(document.review.annotations.size, 1);
		});

		it("rejects keys that are not tracked", () => {
			const { tracker } = setup();
			assert.deepEqual(rangeBounds(tracker, "range"), { start: 1, end: 3 });
			for (const key of ["missing", "constructor", "__proto__"]) {
				assert.equal(tracker.getRange(key), undefined);
				assert.throws(
					() => tracker.setRangeBounds(key, { start: 0, end: 1 }),
					validateUsageError(/not tracked/),
				);
				assert.throws(
					() => tracker.removeTrackedRange(key),
					validateUsageError(/not tracked/),
				);
			}
		});

		it("keeps retained handles live through content edits and explicit repositioning", () => {
			const { tracker } = setup();
			const range = tracker.getRange("range");
			assert(range !== undefined);
			const startAnchor = range.start;
			const endAnchor = range.end;
			const snapshot = { start: startAnchor.index, end: endAnchor.index };
			tracker.transactOnContent((content) => {
				content.insertAtStart("X");
				assert.deepEqual([startAnchor.index, endAnchor.index], [2, 4]);
			});
			tracker.setRangeBounds("range", { start: 0, end: 2 });
			assert.deepEqual([startAnchor.index, endAnchor.index], [0, 2]);
			tracker.transactOnContent((content) => {
				content.removeAt(0);
				assert.deepEqual([startAnchor.index, endAnchor.index], [0, 1]);
			});
			assert.equal(range.start, startAnchor);
			assert.equal(range.end, endAnchor);
			assert.deepEqual([startAnchor.index, endAnchor.index], [0, 1]);
			assert.deepEqual(snapshot, { start: 1, end: 3 });
			assert.equal(range.data, "existing");
		});

		it("rejects disposal of borrowed endpoints without invalidating them", () => {
			const { tracker } = setup();
			const range = tracker.getRange("range");
			assert(range !== undefined);
			for (const anchor of [range.start, range.end]) {
				assert.throws(
					() => anchor.dispose(),
					validateUsageError(/owned by the tracked range/),
				);
				assert.throws(
					() => anchor.dispose(),
					validateUsageError(/owned by the tracked range/),
				);
			}
			assert.deepEqual([range.start.index, range.end.index], [1, 3]);
			tracker.transactOnContent((content) => content.insertAtStart("X"));
			assert.deepEqual([range.start.index, range.end.index], [2, 4]);
			tracker.removeTrackedRange("range");
			assert.throws(() => range.start.index, validateUsageError(/no longer tracked/));
			assert.throws(() => range.end.index, validateUsageError(/no longer tracked/));
		});

		it("replaces data without changing the stored range or active endpoint anchors", () => {
			const { tracker, range: stored } = setup();
			const range = tracker.getRange("range");
			const otherHandle = tracker.getRange("range");
			assert(range !== undefined && otherHandle !== undefined);
			const { start, end } = range;
			range.data = "replacement";
			assert.equal(stored.data, "replacement");
			assert.equal(otherHandle.data, "replacement");
			assert.deepEqual([start.index, end.index], [1, 3]);
			tracker.transactOnContent((content) => {
				content.insertAtStart("X");
				range.data = "during editing";
				assert.equal(otherHandle.data, "during editing");
				assert.deepEqual([stored.start, stored.end], [1, 3]);
				assert.deepEqual([start.index, end.index], [2, 4]);
				content.removeAt(0);
			});
			assert.equal(range.start, start);
			assert.equal(range.end, end);
			assert.equal(stored.data, "during editing");
			assert.deepEqual([start.index, end.index], [1, 3]);
		});

		it("does not retarget retained handles when a key is reused", () => {
			const { tracker } = setup();
			const original = tracker.getRange("range");
			assert(original !== undefined);
			tracker.removeTrackedRange("range");
			assert.equal(tracker.getRange("range"), undefined);
			assert.throws(() => original.start.index, validateUsageError(/no longer tracked/));
			assert.throws(
				() => {
					original.data = "removed";
				},
				validateUsageError(/no longer tracked/),
			);
			const replacement = tracker.trackNewRange("range", { start: 0, end: 1 }, "replacement");
			assert.deepEqual([replacement.start.index, replacement.end.index], [0, 1]);
			assert.throws(() => original.end.index, validateUsageError(/no longer tracked/));
			assert.throws(
				() => {
					original.data = "must not retarget";
				},
				validateUsageError(/no longer tracked/),
			);
			assert.throws(() => original.start.index, validateUsageError(/no longer tracked/));
			assert.equal(original.data, "existing");
			assert.equal(tracker.getRange("range")?.data, "replacement");
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
				observed.push(rangeBounds(tracker, "range"));
				assert.throws(
					() => tracker.trackNewRange("added", { start: 0, end: 1 }, "added"),
					validateUsageError(/while editing content/),
				);
				assert.throws(
					() => tracker.setRangeBounds("range", { start: 0, end: 1 }),
					validateUsageError(/while editing content/),
				);
				assert.throws(
					() => tracker.removeTrackedRange("range"),
					validateUsageError(/while editing content/),
				);
			});
			tracker.transactOnContent((content) => content.insertAtStart("X"));
			off();
			assert(observed.length > 0);
			assert(observed.every(({ start, end }) => start === 2 && end === 4));
		});

		it("rejects nested scopes without losing the outer scope or subsequent edits", () => {
			const { tracker, range } = setup();
			tracker.setRangeBounds("range", { start: 0, end: 2 });
			tracker.transactOnContent((content) => {
				content.insertAtStart("X");
				assert.throws(
					() => tracker.transactOnContent(() => {}),
					validateUsageError(/Cannot nest/),
				);
				content.removeAt(0);
			});
			assert.deepEqual([range.start, range.end], [0, 2]);
			tracker.transactOnContent((content) => content.insertAtEnd("D"));
			assert.deepEqual([range.start, range.end], [0, 2]);
		});
	});

	it("reuses an existing tracker after its tree is hydrated", () => {
		const document = createDocument();
		const tracker = createTracker(document);
		const range = tracker.trackNewRange("added", { start: 0, end: 2 }, "added");
		tracker.transactOnContent((content) => content.insertAtStart("X"));
		hydrateNode(document);
		tracker.transactOnContent((content) => content.removeAt(0));
		assert.deepEqual([range.start.index, range.end.index], [0, 2]);
		assert.deepEqual(rangeBounds(tracker, "added"), { start: 0, end: 2 });
	});

	it("preserves partial unhydrated edits and releases the scope after a callback throws", () => {
		const document = createDocument();
		const tracker = createTracker(document);
		const range = document.review.annotations.get("range");
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
				() => other.review.annotations,
				() => other.review.annotations,
				(start, end, data) => new Annotation({ start, end, data }),
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
			Array.from(fork.root.review.annotations.values(), ({ start, end, data }) => [
				start,
				end,
				data,
			]),
			[[1, 3, "existing"]],
		);
		assert.equal(fork.root.title, "Updated");
		fork.dispose();
		view.dispose();
	});

	it("rebases data replacement over concurrent content and unrelated edits", () => {
		const view = getView(new TreeViewConfiguration({ schema: Document }));
		view.initialize(createDocument());
		const fork = view.fork();
		const tracker = createTracker(fork.root);
		const range = tracker.getRange("range");
		assert(range !== undefined);
		const { start, end } = range;
		range.data = "replacement";
		view.root.title = "Updated";
		createTracker(view.root).transactOnContent((content) => content.insertAtStart("X"));

		fork.rebaseOnto(view);

		assert.equal(range.data, "replacement");
		assert.equal(fork.root.title, "Updated");
		assert.equal(fork.root.body.fullString(), "XABC");
		assert.deepEqual([start.index, end.index], [2, 4]);
	});

	it("undoes and redoes data replacement across an unrelated edit", () => {
		const view = getView(new TreeViewConfiguration({ schema: Document }));
		view.initialize(createDocument());
		const tracker = createTracker(view.root);
		const range = tracker.getRange("range");
		assert(range !== undefined);
		const { start, end } = range;
		const { undoStack, redoStack } = createTestUndoRedoStacks(view.events);
		range.data = "replacement";
		const undo = undoStack.pop();
		assert(undo !== undefined);
		view.root.title = "Updated";

		undo.revert();

		assert.equal(range.data, "existing");
		assert.equal(view.root.title, "Updated");
		assert.deepEqual([start.index, end.index], [1, 3]);
		const redo = redoStack.pop();
		assert(redo !== undefined);
		redo.revert();
		assert.equal(range.data, "replacement");
		assert.equal(view.root.title, "Updated");
		assert.deepEqual([start.index, end.index], [1, 3]);
	});

	it("undoes and redoes content and range edits together", () => {
		const view = getView(new TreeViewConfiguration({ schema: Document }));
		view.initialize(createDocument());
		const tracker = createTracker(view.root);
		const initial = JSON.stringify(view.root);
		const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
		view.runTransaction(() => {
			tracker.transactOnContent((content) => content.insertAtStart("X"));
			tracker.trackNewRange("added", { start: 0, end: 2 }, "added");
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

	it("invalidates a removed handle and restores it when undo restores the range", () => {
		const view = getView(new TreeViewConfiguration({ schema: Document }));
		view.initialize(createDocument());
		const tracker = createTracker(view.root);
		const range = tracker.getRange("range");
		assert(range !== undefined);
		const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
		tracker.removeTrackedRange("range");
		assert.throws(() => range.start.index, validateUsageError(/no longer tracked/));
		const undo = undoStack.pop();
		assert(undo !== undefined);
		undo.revert();
		assert.deepEqual([range.start.index, range.end.index], [1, 3]);
		const redo = redoStack.pop();
		assert(redo !== undefined);
		redo.revert();
		assert.throws(() => range.end.index, validateUsageError(/no longer tracked/));
		const restore = undoStack.pop();
		assert(restore !== undefined);
		restore.revert();
		range.data = "restored";
		assert.equal(range.data, "restored");
		unsubscribe();
		view.dispose();
	});
});
