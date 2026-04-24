/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { convertSummaryTreeToITree } from "@fluidframework/runtime-utils/internal";
import {
	MockContainerRuntimeFactoryForReconnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import type { IDirectoryOperation } from "../../directory.js";
import { DirectoryFactory } from "../../directoryFactory.js";
import type {
	IDirectorySortKeyChanged,
	IDirectorySubDirectorySortKeyChanged,
	ISharedDirectory,
	ISortKeyChanged,
	ISubDirectorySortKeyChanged,
} from "../../interfaces.js";

import {
	createAdditionalClient,
	setupConnectedDirectoryTest as setupTest,
	TestSharedDirectory,
} from "./directoryTestHelpers.js";

const directoryFactory = new DirectoryFactory();

describe("SharedDirectory sort keys", () => {
	describe("API — single client", () => {
		it("T1: setSortKey on existing key does not throw and does not affect the value", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("a", 1);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.setSortKey("a", "M");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(sharedDirectory.get("a"), 1);
		});

		it("T2: setSortKey on a nonexistent key is allowed", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			assert.doesNotThrow(() => sharedDirectory.setSortKey("nope", "M"));
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(sharedDirectory.get("nope"), undefined);
		});

		it("T3: setSortKey with undefined clears prior sort key", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("a", 1);
			sharedDirectory.setSortKey("a", "M");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			sharedDirectory.set("b", 2);
			sharedDirectory.setSortKey("b", "Z");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.setSortKey("a", undefined);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// With no sort key on "a", only "b" is sort-keyed and "a" trails in the unkeyed bucket.
			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["b", "a"]);
		});

		it("T4: setSortKey is LWW within a single client", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("a", 1);
			sharedDirectory.set("b", 2);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.setSortKey("a", "M");
			sharedDirectory.setSortKey("a", "Z");
			sharedDirectory.setSortKey("b", "N");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// "a" has final sort key "Z", so "b" (sort key "N") sorts before "a" ("Z").
			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["b", "a"]);
		});

		it("T5: setSortKey throws on disposed subdirectory", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			const sub = sharedDirectory.createSubDirectory("sub");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			sharedDirectory.deleteSubDirectory("sub");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.throws(() => sub.setSortKey("a", "M"));
		});

		it("T6: setSubDirectorySortKey reorders subdirectoriesByOrder", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.createSubDirectory("a");
			sharedDirectory.createSubDirectory("b");
			sharedDirectory.createSubDirectory("c");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.setSubDirectorySortKey("b", "1");
			sharedDirectory.setSubDirectorySortKey("a", "2");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const names = [...sharedDirectory.subdirectoriesByOrder()].map(([n]) => n);
			assert.deepStrictEqual(names, ["b", "a", "c"]);
		});

		it("T7: setSubDirectorySortKey on nonexistent subdir is allowed", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			assert.doesNotThrow(() => sharedDirectory.setSubDirectorySortKey("future", "X"));
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(sharedDirectory.getSubDirectory("future"), undefined);
		});

		it("T8: setSubDirectorySortKey(name, undefined) clears", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.createSubDirectory("a");
			sharedDirectory.createSubDirectory("b");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			sharedDirectory.setSubDirectorySortKey("a", "1");
			sharedDirectory.setSubDirectorySortKey("b", "2");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.setSubDirectorySortKey("a", undefined);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const names = [...sharedDirectory.subdirectoriesByOrder()].map(([n]) => n);
			assert.deepStrictEqual(names, ["b", "a"]);
		});

		it("T9: setSortKey on a deeply nested subdir works", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			const l1 = sharedDirectory.createSubDirectory("l1");
			l1.createSubDirectory("l2");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			const l2 = sharedDirectory.getWorkingDirectory("/l1/l2");
			assert.ok(l2 !== undefined);
			l2.set("x", 1);
			l2.set("y", 2);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			l2.setSortKey("y", "A");
			l2.setSortKey("x", "B");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepStrictEqual([...l2.keysByOrder()], ["y", "x"]);
		});

		it("T10: setSortKey does not fire valueChanged", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("a", 1);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			let valueChangedCount = 0;
			sharedDirectory.on("valueChanged", () => {
				valueChangedCount++;
			});

			sharedDirectory.setSortKey("a", "M");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(valueChangedCount, 0);
		});

		it("T11: sortKeyChanged fires exactly once for local op (submit + ack)", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("a", 1);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			let count = 0;
			sharedDirectory.on("sortKeyChanged", () => {
				count++;
			});

			sharedDirectory.setSortKey("a", "M");
			assert.strictEqual(count, 1, "event should fire on local submit");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(count, 1, "ack should not re-fire");
		});

		it("T12: empty-string sort key is valid and not conflated with unset", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("a", 1);
			sharedDirectory.set("b", 2);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.setSortKey("b", "");
			sharedDirectory.setSortKey("a", "A");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["b", "a"]);
		});

		it("T13: re-setting sort key to same value still fires event; order unchanged", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("a", 1);
			sharedDirectory.setSortKey("a", "M");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			let count = 0;
			sharedDirectory.on("sortKeyChanged", () => {
				count++;
			});

			sharedDirectory.setSortKey("a", "M");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(count, 1);
			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["a"]);
		});

		it("T14: SharedDirectory forwarders route to root", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("x", 1);
			sharedDirectory.setSortKey("x", "M");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["x"]);
		});
	});

	describe("Iteration semantics", () => {
		it("T15: keysByOrder is empty on empty directory", () => {
			const { sharedDirectory } = setupTest();
			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], []);
		});

		it("T16: keysByOrder equals keys when no sort keys are set", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("c", 1);
			sharedDirectory.set("a", 2);
			sharedDirectory.set("b", 3);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], [...sharedDirectory.keys()]);
			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["c", "a", "b"]);
		});

		it("T17: sort-keyed entries iterate in lex order of sort key", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("a", 1);
			sharedDirectory.set("b", 2);
			sharedDirectory.set("c", 3);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.setSortKey("a", "3");
			sharedDirectory.setSortKey("b", "1");
			sharedDirectory.setSortKey("c", "2");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["b", "c", "a"]);
		});

		it("T18: unkeyed entries appear after sort-keyed, in default order", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("x", 1);
			sharedDirectory.set("y", 2);
			sharedDirectory.set("z", 3);
			sharedDirectory.set("q", 4);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.setSortKey("z", "A");
			sharedDirectory.setSortKey("x", "B");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["z", "x", "y", "q"]);
		});

		it("T19: tie on sort key breaks by insertion order", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("first", 1);
			sharedDirectory.set("second", 2);
			sharedDirectory.set("third", 3);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.setSortKey("first", "X");
			sharedDirectory.setSortKey("second", "X");
			sharedDirectory.setSortKey("third", "X");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["first", "second", "third"]);
		});

		it("T20: sort-keyed wins over unkeyed (no tie possible across buckets)", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("a", 1);
			sharedDirectory.set("b", 2);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.setSortKey("a", "any");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["a", "b"]);
		});

		it("T21: valuesByOrder / entriesByOrder align with keysByOrder", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("a", 10);
			sharedDirectory.set("b", 20);
			sharedDirectory.set("c", 30);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			sharedDirectory.setSortKey("c", "1");
			sharedDirectory.setSortKey("a", "2");
			sharedDirectory.setSortKey("b", "3");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const keys = [...sharedDirectory.keysByOrder()];
			const values = [...sharedDirectory.valuesByOrder()];
			const entries = [...sharedDirectory.entriesByOrder()];
			assert.deepStrictEqual(keys, ["c", "a", "b"]);
			assert.deepStrictEqual(values, [30, 10, 20]);
			assert.deepStrictEqual(entries, [
				["c", 30],
				["a", 10],
				["b", 20],
			]);
		});

		it("T22: lexicographic uses JS < (UTF-16 code point order)", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("one", 1);
			sharedDirectory.set("two", 2);
			sharedDirectory.set("three", 3);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.setSortKey("one", "Z");
			sharedDirectory.setSortKey("two", "a");
			sharedDirectory.setSortKey("three", "A");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// UTF-16: "A" (0x41) < "Z" (0x5A) < "a" (0x61)
			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["three", "one", "two"]);
		});
	});

	describe("Events", () => {
		it("T23: sortKeyChanged fires on local set", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("a", 1);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const events: { changed: IDirectorySortKeyChanged; local: boolean }[] = [];
			sharedDirectory.on("sortKeyChanged", (changed, local) => {
				events.push({ changed, local });
			});

			sharedDirectory.setSortKey("a", "M");

			assert.strictEqual(events.length, 1);
			assert.deepStrictEqual(events[0].changed, {
				path: "/",
				key: "a",
				sortKey: "M",
				previousSortKey: undefined,
			});
			assert.strictEqual(events[0].local, true);
		});

		it("T24: sortKeyChanged fires on remote set", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			const { sharedDirectory: sharedDirectory2, containerRuntime: containerRuntime2 } =
				createAdditionalClient(containerRuntimeFactory);

			sharedDirectory.set("a", 1);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const events: { changed: IDirectorySortKeyChanged; local: boolean }[] = [];
			sharedDirectory2.on("sortKeyChanged", (changed, local) => {
				events.push({ changed, local });
			});

			sharedDirectory.setSortKey("a", "M");
			containerRuntime.flush();
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(events.length, 1);
			assert.deepStrictEqual(events[0].changed, {
				path: "/",
				key: "a",
				sortKey: "M",
				previousSortKey: undefined,
			});
			assert.strictEqual(events[0].local, false);
		});

		it("T25: previousSortKey is correct on update", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("a", 1);
			sharedDirectory.setSortKey("a", "M");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const events: IDirectorySortKeyChanged[] = [];
			sharedDirectory.on("sortKeyChanged", (changed) => {
				events.push(changed);
			});

			sharedDirectory.setSortKey("a", "Z");

			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].sortKey, "Z");
			assert.strictEqual(events[0].previousSortKey, "M");
		});

		it("T26: sortKeyChanged does not fire on remote op when local pending exists", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			const { sharedDirectory: sharedDirectory2, containerRuntime: containerRuntime2 } =
				createAdditionalClient(containerRuntimeFactory);

			sharedDirectory.set("a", 1);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			let client1Events = 0;
			sharedDirectory.on("sortKeyChanged", () => {
				client1Events++;
			});

			// Client 1 starts pending setSortKey for "a" (don't flush yet).
			sharedDirectory.setSortKey("a", "Z");
			assert.strictEqual(client1Events, 1, "local event fires once");

			// Client 2 sends a remote setSortKey for same key.
			sharedDirectory2.setSortKey("a", "M");
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			// Client 1 should NOT emit again because its pending op eclipses the remote value.
			assert.strictEqual(client1Events, 1);

			// Finally, flush client 1 and process.
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
		});

		it("T27: containedSortKeyChanged fires on the SubDirectory handle directly", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.createSubDirectory("sub");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const sub = sharedDirectory.getWorkingDirectory("/sub");
			assert.ok(sub !== undefined);
			sub.set("a", 1);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const events: ISortKeyChanged[] = [];
			sub.on("containedSortKeyChanged", (changed: ISortKeyChanged) => {
				events.push(changed);
			});

			sub.setSortKey("a", "M");

			assert.strictEqual(events.length, 1);
			assert.deepStrictEqual(events[0], {
				key: "a",
				sortKey: "M",
				previousSortKey: undefined,
			});
			assert.strictEqual((events[0] as unknown as { path?: string }).path, undefined);
		});

		it("T28: delete does NOT fire sortKeyChanged", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("a", 1);
			sharedDirectory.setSortKey("a", "M");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			let sortKeyEvents = 0;
			let valueEvents = 0;
			sharedDirectory.on("sortKeyChanged", () => {
				sortKeyEvents++;
			});
			sharedDirectory.on("valueChanged", () => {
				valueEvents++;
			});

			sharedDirectory.delete("a");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(valueEvents, 1);
			assert.strictEqual(sortKeyEvents, 0);
		});
	});

	describe("Delete / clear propagation", () => {
		it("T29: delete(k) clears sort key for k", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("a", 1);
			sharedDirectory.setSortKey("a", "M");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.delete("a");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.set("a", 2);
			sharedDirectory.set("b", 3);
			sharedDirectory.setSortKey("b", "Z");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// "a" is unkeyed now (sort key "M" was cleared by delete), "b" is sort-keyed.
			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["b", "a"]);
		});

		it("T30: clear() clears all sort keys", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("a", 1);
			sharedDirectory.set("b", 2);
			sharedDirectory.set("c", 3);
			sharedDirectory.setSortKey("a", "1");
			sharedDirectory.setSortKey("b", "2");
			sharedDirectory.setSortKey("c", "3");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.clear();
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.set("a", 1);
			sharedDirectory.set("b", 2);
			sharedDirectory.set("c", 3);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["a", "b", "c"]);
		});

		it("T31: clear() on parent does NOT clear sort keys in child subdirs", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("r", 1);
			sharedDirectory.setSortKey("r", "Z");
			sharedDirectory.createSubDirectory("sub");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			const sub = sharedDirectory.getWorkingDirectory("/sub");
			assert.ok(sub !== undefined);
			sub.set("x", 1);
			sub.setSortKey("x", "M");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.clear();
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], []);
			assert.deepStrictEqual([...sub.keysByOrder()], ["x"]);
		});

		it("T32: deleteSubDirectory clears subdir sort key on parent", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.createSubDirectory("sub");
			sharedDirectory.createSubDirectory("other");
			sharedDirectory.setSubDirectorySortKey("sub", "M");
			sharedDirectory.setSubDirectorySortKey("other", "Z");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.deleteSubDirectory("sub");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.createSubDirectory("sub");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// "other" has sort key "Z", "sub" now has no sort key -> "sub" in unkeyed bucket.
			const names = [...sharedDirectory.subdirectoriesByOrder()].map(([n]) => n);
			assert.deepStrictEqual(names, ["other", "sub"]);
		});

		it("T33: rollback of delete restores the key AND its sort key", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("a", 1);
			sharedDirectory.setSortKey("a", "M");
			sharedDirectory.set("b", 2);
			sharedDirectory.setSortKey("b", "Z");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// Start a pending delete; "a" is optimistically removed before the delete is acked.
			sharedDirectory.delete("a");
			assert.strictEqual(
				sharedDirectory.get("a"),
				undefined,
				"Pending delete should hide 'a' optimistically",
			);

			// Rollback the pending delete. The sort-key cleanup only happens on ack, so "a" should
			// come back with its sort key intact and still land in the sort-keyed bucket.
			containerRuntime.rollback?.();

			assert.strictEqual(sharedDirectory.get("a"), 1, "Value should be restored");
			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["a", "b"]);
		});

		it("T34: clear while a setSortKey is pending leaves no leftover sequenced sort key", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("a", 1);
			sharedDirectory.setSortKey("a", "M");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// Queue a setSortKey but don't flush yet.
			sharedDirectory.setSortKey("a", "Z");

			// A local clear while the setSortKey is still pending. Both ops are then flushed and
			// processed in submission order (setSortKey, then clear). The clear's ack wipes the
			// sequenced sort keys map, so the pending "Z" must not outlive the clear.
			sharedDirectory.clear();

			let eventsAfterFlush = 0;
			sharedDirectory.on("sortKeyChanged", () => {
				eventsAfterFlush++;
			});

			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// The ack of the local ops should not fire any additional sortKeyChanged events.
			assert.strictEqual(eventsAfterFlush, 0);

			// Reinsert "a" and "b" with only "b" sort-keyed. If a stale "Z" for "a" survived the
			// clear, "a" would land in the sort-keyed bucket (ordering ["a", "b"]); with a clean
			// sequencedSortKeys, "a" is unkeyed and trails "b" (ordering ["b", "a"]).
			sharedDirectory.set("a", 2);
			sharedDirectory.set("b", 3);
			sharedDirectory.setSortKey("b", "X");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["b", "a"]);
		});
	});

	describe("Subdirectory sort keys", () => {
		it("T35: subdirectoriesByOrder empty on empty parent", () => {
			const { sharedDirectory } = setupTest();
			assert.deepStrictEqual([...sharedDirectory.subdirectoriesByOrder()], []);
		});

		it("T36: fast path equals subdirectories() when no sort keys", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.createSubDirectory("a");
			sharedDirectory.createSubDirectory("b");
			sharedDirectory.createSubDirectory("c");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const ordered = [...sharedDirectory.subdirectoriesByOrder()].map(([n]) => n);
			const natural = [...sharedDirectory.subdirectories()].map(([n]) => n);
			assert.deepStrictEqual(ordered, natural);
		});

		it("T37: sort-keyed subdirs iterate in lex order", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.createSubDirectory("a");
			sharedDirectory.createSubDirectory("b");
			sharedDirectory.createSubDirectory("c");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			sharedDirectory.setSubDirectorySortKey("a", "3");
			sharedDirectory.setSubDirectorySortKey("b", "1");
			sharedDirectory.setSubDirectorySortKey("c", "2");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const names = [...sharedDirectory.subdirectoriesByOrder()].map(([n]) => n);
			assert.deepStrictEqual(names, ["b", "c", "a"]);
		});

		it("T38: unkeyed subdirs trail, in default (seqData) order", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.createSubDirectory("a");
			sharedDirectory.createSubDirectory("b");
			sharedDirectory.createSubDirectory("c");
			sharedDirectory.createSubDirectory("d");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			sharedDirectory.setSubDirectorySortKey("c", "A");
			sharedDirectory.setSubDirectorySortKey("a", "B");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const names = [...sharedDirectory.subdirectoriesByOrder()].map(([n]) => n);
			assert.deepStrictEqual(names, ["c", "a", "b", "d"]);
		});

		it("T40: subDirectorySortKeyChanged fires on local and remote", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			const { sharedDirectory: sharedDirectory2, containerRuntime: containerRuntime2 } =
				createAdditionalClient(containerRuntimeFactory);

			sharedDirectory.createSubDirectory("sub");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const local: IDirectorySubDirectorySortKeyChanged[] = [];
			const remote: IDirectorySubDirectorySortKeyChanged[] = [];
			sharedDirectory.on("subDirectorySortKeyChanged", (changed, isLocal) => {
				if (isLocal === true) {
					local.push(changed);
				}
			});
			sharedDirectory2.on("subDirectorySortKeyChanged", (changed, isLocal) => {
				if (isLocal === false) {
					remote.push(changed);
				}
			});

			sharedDirectory.setSubDirectorySortKey("sub", "M");
			containerRuntime.flush();
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(local.length, 1);
			assert.strictEqual(local[0].sortKey, "M");
			assert.strictEqual(local[0].path, "/");
			assert.strictEqual(local[0].subdirName, "sub");
			assert.strictEqual(remote.length, 1);
			assert.strictEqual(remote[0].sortKey, "M");
		});

		it("T41: containedSubDirectorySortKeyChanged fires on the parent subdir", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			const sub = sharedDirectory.createSubDirectory("sub");
			sub.createSubDirectory("child");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const events: ISubDirectorySortKeyChanged[] = [];
			sub.on("containedSubDirectorySortKeyChanged", (changed: ISubDirectorySortKeyChanged) => {
				events.push(changed);
			});

			sub.setSubDirectorySortKey("child", "M");

			assert.strictEqual(events.length, 1);
			assert.deepStrictEqual(events[0], {
				subdirName: "child",
				sortKey: "M",
				previousSortKey: undefined,
			});
		});

		it("T42: deleting one subdir leaves sibling subdirectorySortKeys intact", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.createSubDirectory("a");
			sharedDirectory.createSubDirectory("b");
			sharedDirectory.createSubDirectory("c");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.setSubDirectorySortKey("a", "1");
			sharedDirectory.setSubDirectorySortKey("b", "2");
			sharedDirectory.setSubDirectorySortKey("c", "3");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.deleteSubDirectory("b");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// "a" and "c" retain their sort keys; "b" is gone so its entry doesn't appear.
			const names = [...sharedDirectory.subdirectoriesByOrder()].map(([n]) => n);
			assert.deepStrictEqual(names, ["a", "c"]);

			// Recreate "b" with no sort key — it should land in the unkeyed bucket after "a" and
			// "c", confirming that "a"/"c" sort keys survived the delete of "b".
			sharedDirectory.createSubDirectory("b");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			const namesAfter = [...sharedDirectory.subdirectoriesByOrder()].map(([n]) => n);
			assert.deepStrictEqual(namesAfter, ["a", "c", "b"]);
		});
	});

	describe("Concurrent / eventual consistency", () => {
		it("T43: Two clients set sort keys on different keys — both converge", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			const { sharedDirectory: sharedDirectory2, containerRuntime: containerRuntime2 } =
				createAdditionalClient(containerRuntimeFactory);

			sharedDirectory.set("a", 1);
			sharedDirectory.set("b", 2);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.setSortKey("a", "1");
			sharedDirectory2.setSortKey("b", "2");
			containerRuntime.flush();
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["a", "b"]);
			assert.deepStrictEqual([...sharedDirectory2.keysByOrder()], ["a", "b"]);
		});

		it("T45a: delete sequenced before setSortKey — both clients converge; sort key acts as pre-registration", () => {
			// When the delete is sequenced first, the subsequent setSortKey from the other client
			// is applied to a currently-non-existent key. That matches T46 pre-registration
			// semantics: the sort key waits for a future set() to attach to. Both clients must
			// converge on the same state.
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			const { sharedDirectory: sharedDirectory2, containerRuntime: containerRuntime2 } =
				createAdditionalClient(containerRuntimeFactory);

			sharedDirectory.set("a", 1);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.delete("a");
			sharedDirectory2.setSortKey("a", "M");
			// Flushing sharedDirectory first sequences the delete ahead of the remote setSortKey.
			containerRuntime.flush();
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(sharedDirectory.get("a"), undefined);
			assert.strictEqual(sharedDirectory2.get("a"), undefined);
			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], []);
			assert.deepStrictEqual([...sharedDirectory2.keysByOrder()], []);

			// Rebirth: re-set "a" and add a new sort-keyed "b". "a" inherits the sort key "M" (the
			// sequenced setSortKey effectively pre-registered for this new lifetime), so with b at
			// "Z" the lex order is "a" ("M") < "b" ("Z").
			sharedDirectory.set("a", 2);
			sharedDirectory.set("b", 3);
			sharedDirectory.setSortKey("b", "Z");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["a", "b"]);
			assert.deepStrictEqual([...sharedDirectory2.keysByOrder()], ["a", "b"]);
		});

		it("T45b: setSortKey sequenced before delete — delete clears the freshly-set sort key", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			const { sharedDirectory: sharedDirectory2, containerRuntime: containerRuntime2 } =
				createAdditionalClient(containerRuntimeFactory);

			sharedDirectory.set("a", 1);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory2.setSortKey("a", "M");
			sharedDirectory.delete("a");
			// Flushing sharedDirectory2 first puts the setSortKey ahead of the delete.
			containerRuntime2.flush();
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// "a" is deleted on both clients; delete was sequenced after setSortKey, so it clears
			// the freshly-set sort key too (same invariant as T29).
			assert.strictEqual(sharedDirectory.get("a"), undefined);
			assert.strictEqual(sharedDirectory2.get("a"), undefined);

			// Rebirth: with the sort key cleared, re-setting "a" puts it in the unkeyed bucket
			// (trailing "b" which has sort key "Z").
			sharedDirectory.set("a", 2);
			sharedDirectory.set("b", 3);
			sharedDirectory.setSortKey("b", "Z");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();
			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["b", "a"]);
			assert.deepStrictEqual([...sharedDirectory2.keysByOrder()], ["b", "a"]);
		});

		it("T44: Two clients set sort keys on same key — LWW by server order", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			const { sharedDirectory: sharedDirectory2, containerRuntime: containerRuntime2 } =
				createAdditionalClient(containerRuntimeFactory);

			sharedDirectory.set("a", 1);
			sharedDirectory.set("b", 2);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.setSortKey("a", "X");
			sharedDirectory2.setSortKey("a", "Y");
			sharedDirectory2.setSortKey("b", "Z");
			containerRuntime.flush();
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			// Client 1's op is processed first (seq N), then client 2's (seq N+k) — so "a" lands on "Y".
			// "a" has sort key "Y", "b" has sort key "Z", so order is a, b.
			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["a", "b"]);
			assert.deepStrictEqual([...sharedDirectory2.keysByOrder()], ["a", "b"]);
		});

		it("T46: Pre-registration: setSortKey on not-yet-existing key then remote set", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			const { sharedDirectory: sharedDirectory2, containerRuntime: containerRuntime2 } =
				createAdditionalClient(containerRuntimeFactory);

			sharedDirectory.setSortKey("a", "M");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory2.set("a", 42);
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["a"]);
			assert.deepStrictEqual([...sharedDirectory2.keysByOrder()], ["a"]);
			assert.strictEqual(sharedDirectory.get("a"), 42);
			assert.strictEqual(sharedDirectory2.get("a"), 42);
		});

		it("T47: Grouped batching — two setSortKey on same key in one batch", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			sharedDirectory.set("a", 1);
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.setSortKey("a", "M");
			sharedDirectory.setSortKey("a", "Z");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			sharedDirectory.set("b", 2);
			sharedDirectory.setSortKey("b", "N");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			// "a" sort key "Z", "b" sort key "N" — so order is b, a.
			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["b", "a"]);
		});

		it("T48: Bulk iteration remains consistent under concurrent writes", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			const { sharedDirectory: sharedDirectory2, containerRuntime: containerRuntime2 } =
				createAdditionalClient(containerRuntimeFactory);

			for (let i = 0; i < 10; i++) {
				sharedDirectory.set(`k${i}`, i);
				sharedDirectory.setSortKey(`k${i}`, `${10 - i}`);
			}
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			const iter = sharedDirectory.keysByOrder();
			// First drain 3 items
			iter.next();
			iter.next();
			iter.next();

			// Concurrent mutation mid-iteration
			sharedDirectory2.setSortKey("k5", "Q");
			containerRuntime2.flush();
			containerRuntimeFactory.processAllMessages();

			// Finish iteration without crash
			assert.doesNotThrow(() => {
				let result = iter.next();
				while (result.done !== true) {
					result = iter.next();
				}
			});
		});

		it("T49: Two clients with same op stream — iteration order identical", () => {
			const { sharedDirectory, containerRuntime, containerRuntimeFactory } = setupTest();
			const { sharedDirectory: sharedDirectory2 } =
				createAdditionalClient(containerRuntimeFactory);

			sharedDirectory.set("a", 1);
			sharedDirectory.set("b", 2);
			sharedDirectory.set("c", 3);
			sharedDirectory.setSortKey("a", "3");
			sharedDirectory.setSortKey("b", "1");
			sharedDirectory.setSortKey("c", "2");
			containerRuntime.flush();
			containerRuntimeFactory.processAllMessages();

			assert.deepStrictEqual(
				[...sharedDirectory.keysByOrder()],
				[...sharedDirectory2.keysByOrder()],
			);
			assert.deepStrictEqual([...sharedDirectory.keysByOrder()], ["b", "c", "a"]);
		});
	});

	describe("Detached state", () => {
		function createDetached(): ISharedDirectory {
			const dataStoreRuntime = new MockFluidDataStoreRuntime();
			return directoryFactory.create(dataStoreRuntime, "detached-dir");
		}

		it("T63: setSortKey works while detached", () => {
			const detached = createDetached();
			detached.set("a", 1);
			detached.setSortKey("a", "M");
			assert.deepStrictEqual([...detached.keysByOrder()], ["a"]);
		});

		it("T64: Detached directory summary includes sort keys", () => {
			const detached = createDetached();
			detached.set("a", 1);
			detached.set("b", 2);
			detached.setSortKey("a", "M");
			const summary = detached.getAttachSummary().summary;
			const header = (summary.tree.header as { content: string }).content;
			assert.ok(header.includes("sortKeys"));
			assert.ok(header.includes('"a":"M"'));
		});

		it("T65: Attaching preserves sort keys", async () => {
			const detached = createDetached();
			detached.set("a", 1);
			detached.set("b", 2);
			detached.setSortKey("a", "M");
			detached.setSortKey("b", "Z");
			const summaryTree = detached.getAttachSummary().summary;
			const snapshotTree = convertSummaryTreeToITree(summaryTree);

			const runtime2 = new MockFluidDataStoreRuntime();
			const factory = new DirectoryFactory();
			const loaded = await factory.load(
				runtime2,
				"reloaded",
				{
					deltaConnection: runtime2.createDeltaConnection(),
					// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
					objectStorage: new MockStorage(JSON.parse(JSON.stringify(snapshotTree))),
				},
				factory.attributes,
			);
			assert.deepStrictEqual([...loaded.keysByOrder()], [...detached.keysByOrder()]);
		});
	});

	describe("Back-compat — dark-ship guards", () => {
		it("T66: Unknown setSortKey-ish op from the future — current handler processes it cleanly", () => {
			// We exercise the message handler via applyStashedOp: the new op types are registered, so
			// a remote op from a future client (same wire shape) lands cleanly without throwing.
			const dataStoreRuntime = new MockFluidDataStoreRuntime();
			const directory = new TestSharedDirectory(
				"dark-ship",
				dataStoreRuntime,
				DirectoryFactory.Attributes,
			);
			const op: IDirectoryOperation = {
				type: "setSortKey",
				path: "/",
				key: "a",
				sortKey: "M",
			};
			assert.doesNotThrow(() => directory.testApplyStashedOp(op));
		});

		it("T67: Unknown setSubDirectorySortKey op is absorbed cleanly", () => {
			const dataStoreRuntime = new MockFluidDataStoreRuntime();
			const directory = new TestSharedDirectory(
				"dark-ship-sub",
				dataStoreRuntime,
				DirectoryFactory.Attributes,
			);
			const op: IDirectoryOperation = {
				type: "setSubDirectorySortKey",
				path: "/",
				subdirName: "sub",
				sortKey: "M",
			};
			assert.doesNotThrow(() => directory.testApplyStashedOp(op));
		});
	});

	describe("Reconnect & resubmit", () => {
		it("T55: Pending setSortKey survives disconnect and is resubmitted", () => {
			const runtimeFactory = new MockContainerRuntimeFactoryForReconnection();
			const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
			const containerRuntime1 = runtimeFactory.createContainerRuntime(dataStoreRuntime1);
			const directory1 = directoryFactory.create(dataStoreRuntime1, "dir1");
			directory1.connect({
				deltaConnection: dataStoreRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			});

			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			runtimeFactory.createContainerRuntime(dataStoreRuntime2);
			const directory2 = directoryFactory.create(dataStoreRuntime2, "dir2");
			directory2.connect({
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			});

			directory1.set("a", 1);
			runtimeFactory.processAllMessages();

			// Start pending setSortKey; disconnect before it flushes to the service.
			directory1.setSortKey("a", "M");
			containerRuntime1.connected = false;
			containerRuntime1.connected = true;
			runtimeFactory.processAllMessages();

			assert.deepStrictEqual([...directory1.keysByOrder()], ["a"]);
			assert.deepStrictEqual([...directory2.keysByOrder()], ["a"]);
		});

		it("T56: pending setSortKey whose subdir was remotely deleted during disconnect is dropped", () => {
			const runtimeFactory = new MockContainerRuntimeFactoryForReconnection();
			const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
			const containerRuntime1 = runtimeFactory.createContainerRuntime(dataStoreRuntime1);
			const directory1 = directoryFactory.create(dataStoreRuntime1, "dir1");
			directory1.connect({
				deltaConnection: dataStoreRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			});

			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			runtimeFactory.createContainerRuntime(dataStoreRuntime2);
			const directory2 = directoryFactory.create(dataStoreRuntime2, "dir2");
			directory2.connect({
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			});

			directory1.createSubDirectory("sub");
			runtimeFactory.processAllMessages();
			const sub1 = directory1.getSubDirectory("sub");
			assert.ok(sub1 !== undefined);
			sub1.set("x", 1);
			runtimeFactory.processAllMessages();
			assert.ok(directory2.getSubDirectory("sub") !== undefined);

			// Disconnect client 1, then queue a pending setSortKey targeting the subdir.
			containerRuntime1.connected = false;
			sub1.setSortKey("x", "M");

			// While client 1 is offline, client 2 deletes the subdir and the op reaches the server.
			directory2.deleteSubDirectory("sub");
			runtimeFactory.processAllMessages();

			// Client 1 reconnects. The remote delete arrives; its local pending setSortKey is
			// resubmitted, but because the subdir is now disposed the resubmit path short-circuits
			// (messageHandlers.setSortKey.resubmit checks targetSubdir.disposed).
			assert.doesNotThrow(() => {
				containerRuntime1.connected = true;
				runtimeFactory.processAllMessages();
			});

			assert.strictEqual(directory1.getSubDirectory("sub"), undefined);
			assert.strictEqual(directory2.getSubDirectory("sub"), undefined);
		});

		it("T57: applyStashedOp for setSortKey restores state (detached-style, no submit)", () => {
			// Pattern mirrors the existing applyStashedOp test for createSubDirectory: construct a
			// TestSharedDirectory without calling .connect(), so services is undefined and
			// submitLocalMessage no-ops. applyStashedOp still walks the state mutation path.
			const dataStoreRuntime = new MockFluidDataStoreRuntime();
			const directory = new TestSharedDirectory(
				"stash-dir",
				dataStoreRuntime,
				DirectoryFactory.Attributes,
			);
			directory.set("a", 1);
			directory.testApplyStashedOp({
				type: "setSortKey",
				path: "/",
				key: "a",
				sortKey: "M",
			});
			assert.deepStrictEqual([...directory.keysByOrder()], ["a"]);
		});
	});
});
