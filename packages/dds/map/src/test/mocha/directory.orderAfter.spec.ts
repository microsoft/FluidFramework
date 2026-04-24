/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import {
	MockContainerRuntimeFactory,
	MockContainerRuntimeFactoryForReconnection,
	type MockContainerRuntimeForReconnection,
	MockFluidDataStoreRuntime,
	MockSharedObjectServices,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { DirectoryFactory, type ISharedDirectory, SharedDirectory } from "../../index.js";

function createConnectedDirectory(
	id: string,
	runtimeFactory: MockContainerRuntimeFactory,
): ISharedDirectory {
	const dataStoreRuntime = new MockFluidDataStoreRuntime({
		registry: [SharedDirectory.getFactory()],
	});
	runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};
	const directory = SharedDirectory.create(dataStoreRuntime, id);
	directory.connect(services);
	return directory;
}

function assertOrder(directory: ISharedDirectory, expected: string[]): void {
	const actual: string[] = [];
	for (const [name] of directory.subdirectories()) {
		actual.push(name);
	}
	assert.deepEqual(actual, expected);
}

describe("IDirectory.createSubDirectoryOrderedAfter", () => {
	// --- Local / detached state ---

	describe("Local state (detached)", () => {
		let directory: ISharedDirectory;

		beforeEach("createDirectory", () => {
			const dataStoreRuntime = new MockFluidDataStoreRuntime({
				attachState: AttachState.Detached,
				registry: [SharedDirectory.getFactory()],
			});
			directory = SharedDirectory.create(dataStoreRuntime, "directory");
		});

		it("inserts after an existing anchor immediately (Q7 optimistic positioning)", () => {
			directory.createSubDirectory("a");
			directory.createSubDirectory("b");
			directory.createSubDirectoryOrderedAfter("c", "a");
			assertOrder(directory, ["a", "c", "b"]);
		});

		it("returns the created IDirectory on the happy path (Q3)", () => {
			directory.createSubDirectory("a");
			const result = directory.createSubDirectoryOrderedAfter("c", "a");
			assert.notEqual(result, undefined);
			assert.equal(directory.getSubDirectory("c"), result);
		});

		it("appends and returns an IDirectory when the anchor does not exist (Q1)", () => {
			directory.createSubDirectory("a");
			const result = directory.createSubDirectoryOrderedAfter("c", "nonexistent");
			assert.notEqual(result, undefined);
			assertOrder(directory, ["a", "c"]);
		});

		it("appends when the anchor was previously deleted locally (Q1)", () => {
			directory.createSubDirectory("a");
			directory.createSubDirectory("b");
			directory.deleteSubDirectory("a");
			directory.createSubDirectoryOrderedAfter("c", "a");
			assertOrder(directory, ["b", "c"]);
		});

		it("returns the existing subdirectory when newSubdirName already exists (Q6)", () => {
			directory.createSubDirectory("a");
			const existing = directory.createSubDirectory("c");
			const result = directory.createSubDirectoryOrderedAfter("c", "a");
			assert.equal(result, existing);
			// Position of "c" is not changed by the collided call.
			assertOrder(directory, ["a", "c"]);
		});

		it("multiple sequential local inserts after the same anchor: later inserts sort earlier", () => {
			directory.createSubDirectory("a");
			directory.createSubDirectory("b");
			directory.createSubDirectoryOrderedAfter("c", "a");
			directory.createSubDirectoryOrderedAfter("d", "a");
			// Requirements §4.2: later-stamped (here, later-sequenced-locally) sorts earlier (closer to anchor).
			assertOrder(directory, ["a", "d", "c", "b"]);
		});

		it("chain: insert after a subdirectory that was itself inserted after another", () => {
			directory.createSubDirectory("a");
			directory.createSubDirectory("b");
			directory.createSubDirectoryOrderedAfter("c", "a");
			directory.createSubDirectoryOrderedAfter("e", "c");
			assertOrder(directory, ["a", "c", "e", "b"]);
		});

		it("inserting after the first sibling places new child at position 1", () => {
			directory.createSubDirectory("a");
			directory.createSubDirectory("b");
			directory.createSubDirectory("c");
			directory.createSubDirectoryOrderedAfter("x", "a");
			assertOrder(directory, ["a", "x", "b", "c"]);
		});

		it("inserting after the last sibling is equivalent to append", () => {
			directory.createSubDirectory("a");
			directory.createSubDirectory("b");
			directory.createSubDirectoryOrderedAfter("x", "b");
			assertOrder(directory, ["a", "b", "x"]);
		});
	});

	// --- Detached-to-attached state transition ---

	describe("Detached -> attached transition", () => {
		it("preserves ordered-after positioning through attach", async () => {
			const factory = SharedDirectory.getFactory();
			const dataStoreRuntime = new MockFluidDataStoreRuntime();
			const directory = factory.create(dataStoreRuntime, "dir");

			directory.createSubDirectory("a");
			directory.createSubDirectory("b");
			directory.createSubDirectoryOrderedAfter("c", "a");

			assertOrder(directory, ["a", "c", "b"]);

			// Simulate attach by reloading via a summary round-trip.
			const summary = directory.getAttachSummary().summary;
			const containerRuntimeFactory = new MockContainerRuntimeFactory();
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
			const services = MockSharedObjectServices.createFromSummary(summary);
			services.deltaConnection = dataStoreRuntime2.createDeltaConnection();

			const directory2 = await factory.load(
				dataStoreRuntime2,
				"dir2",
				services,
				factory.attributes,
			);
			assertOrder(directory2, ["a", "c", "b"]);
		});
	});

	// --- Connected state: single client round-trip ---

	describe("Connected state, single client", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactory;
		let directory: ISharedDirectory;

		beforeEach("createDirectory", () => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			directory = createConnectedDirectory("dir", containerRuntimeFactory);
		});

		it("ordered insert survives ack and remains positioned correctly", () => {
			directory.createSubDirectory("a");
			directory.createSubDirectory("b");
			directory.createSubDirectoryOrderedAfter("c", "a");

			containerRuntimeFactory.processAllMessages();

			assertOrder(directory, ["a", "c", "b"]);
		});
	});

	// --- Spec Example 1: simultaneous insertions, different names ---

	describe("Spec Example 1: simultaneous inserts, different names", () => {
		it("{#1, #2} -> [A, D, C, B]", () => {
			const runtimeFactory = new MockContainerRuntimeFactory();
			const d1 = createConnectedDirectory("d1", runtimeFactory);
			const d2 = createConnectedDirectory("d2", runtimeFactory);

			d1.createSubDirectory("a");
			d1.createSubDirectory("b");
			runtimeFactory.processAllMessages();

			d1.createSubDirectoryOrderedAfter("c", "a");
			d2.createSubDirectoryOrderedAfter("d", "a");

			runtimeFactory.processAllMessages();

			assertOrder(d1, ["a", "d", "c", "b"]);
			assertOrder(d2, ["a", "d", "c", "b"]);
		});

		it("{#2, #1} -> [A, C, D, B]", () => {
			const runtimeFactory = new MockContainerRuntimeFactory();
			const d1 = createConnectedDirectory("d1", runtimeFactory);
			const d2 = createConnectedDirectory("d2", runtimeFactory);

			d1.createSubDirectory("a");
			d1.createSubDirectory("b");
			runtimeFactory.processAllMessages();

			// Client #2 submits first (will be stamped first).
			d2.createSubDirectoryOrderedAfter("d", "a");
			d1.createSubDirectoryOrderedAfter("c", "a");

			runtimeFactory.processAllMessages();

			assertOrder(d1, ["a", "c", "d", "b"]);
			assertOrder(d2, ["a", "c", "d", "b"]);
		});
	});

	// --- Spec Example 2: simultaneous insertions, same name (merge) ---

	describe("Spec Example 2: simultaneous inserts, same name (merge)", () => {
		it("{#1, #2} -> [A, C, B] (first-stamped positioning wins)", () => {
			const runtimeFactory = new MockContainerRuntimeFactory();
			const d1 = createConnectedDirectory("d1", runtimeFactory);
			const d2 = createConnectedDirectory("d2", runtimeFactory);

			d1.createSubDirectory("a");
			d1.createSubDirectory("b");
			runtimeFactory.processAllMessages();

			// Both clients create "c" with different anchors.
			d1.createSubDirectoryOrderedAfter("c", "a");
			d2.createSubDirectoryOrderedAfter("c", "b");

			runtimeFactory.processAllMessages();

			assertOrder(d1, ["a", "c", "b"]);
			assertOrder(d2, ["a", "c", "b"]);
		});

		it("{#2, #1} -> [A, B, C] (client#2's 'after b' wins)", () => {
			const runtimeFactory = new MockContainerRuntimeFactory();
			const d1 = createConnectedDirectory("d1", runtimeFactory);
			const d2 = createConnectedDirectory("d2", runtimeFactory);

			d1.createSubDirectory("a");
			d1.createSubDirectory("b");
			runtimeFactory.processAllMessages();

			// Client #2 submits first.
			d2.createSubDirectoryOrderedAfter("c", "b");
			d1.createSubDirectoryOrderedAfter("c", "a");

			runtimeFactory.processAllMessages();

			assertOrder(d1, ["a", "b", "c"]);
			assertOrder(d2, ["a", "b", "c"]);
		});
	});

	// --- Spec Example 3: simultaneous insert and deletion of anchor ---

	describe("Spec Example 3: simultaneous insert + delete of anchor", () => {
		it("{#1, #2} (delete first) -> [B, C] (C falls back to append)", () => {
			const runtimeFactory = new MockContainerRuntimeFactory();
			const d1 = createConnectedDirectory("d1", runtimeFactory);
			const d2 = createConnectedDirectory("d2", runtimeFactory);

			d1.createSubDirectory("a");
			d1.createSubDirectory("b");
			runtimeFactory.processAllMessages();

			d1.deleteSubDirectory("a");
			d2.createSubDirectoryOrderedAfter("c", "a");

			runtimeFactory.processAllMessages();

			assertOrder(d1, ["b", "c"]);
			assertOrder(d2, ["b", "c"]);
		});

		it("{#2, #1} (insert first) -> [C, B] (C after A, then A deleted)", () => {
			const runtimeFactory = new MockContainerRuntimeFactory();
			const d1 = createConnectedDirectory("d1", runtimeFactory);
			const d2 = createConnectedDirectory("d2", runtimeFactory);

			d1.createSubDirectory("a");
			d1.createSubDirectory("b");
			runtimeFactory.processAllMessages();

			// Client #2 submits insert first.
			d2.createSubDirectoryOrderedAfter("c", "a");
			d1.deleteSubDirectory("a");

			runtimeFactory.processAllMessages();

			assertOrder(d1, ["c", "b"]);
			assertOrder(d2, ["c", "b"]);
		});
	});

	// --- Spec Example 4: simultaneous insertions and deletion ---

	describe("Spec Example 4: simultaneous inserts + delete of anchor", () => {
		interface ExampleFixture {
			factory: MockContainerRuntimeFactory;
			d1: ISharedDirectory;
			d2: ISharedDirectory;
			d3: ISharedDirectory;
		}

		function setupExample4(): ExampleFixture {
			const factory = new MockContainerRuntimeFactory();
			const d1 = createConnectedDirectory("d1", factory);
			const d2 = createConnectedDirectory("d2", factory);
			const d3 = createConnectedDirectory("d3", factory);

			d1.createSubDirectory("a");
			d1.createSubDirectory("b");
			d1.createSubDirectory("c");
			factory.processAllMessages();

			return { factory, d1, d2, d3 };
		}

		it("{#1, #2, #3} -> [B, C, D, E]", () => {
			const { factory, d1, d2, d3 } = setupExample4();

			d1.deleteSubDirectory("a");
			d2.createSubDirectoryOrderedAfter("d", "a");
			d3.createSubDirectoryOrderedAfter("e", "a");

			factory.processAllMessages();

			assertOrder(d1, ["b", "c", "d", "e"]);
			assertOrder(d2, ["b", "c", "d", "e"]);
			assertOrder(d3, ["b", "c", "d", "e"]);
		});

		it("{#1, #3, #2} -> [B, C, E, D]", () => {
			const { factory, d1, d2, d3 } = setupExample4();

			d1.deleteSubDirectory("a");
			d3.createSubDirectoryOrderedAfter("e", "a");
			d2.createSubDirectoryOrderedAfter("d", "a");

			factory.processAllMessages();

			assertOrder(d1, ["b", "c", "e", "d"]);
			assertOrder(d2, ["b", "c", "e", "d"]);
			assertOrder(d3, ["b", "c", "e", "d"]);
		});

		it("{#2, #3, #1} -> [E, D, B, C]", () => {
			const { factory, d1, d2, d3 } = setupExample4();

			d2.createSubDirectoryOrderedAfter("d", "a");
			d3.createSubDirectoryOrderedAfter("e", "a");
			d1.deleteSubDirectory("a");

			factory.processAllMessages();

			assertOrder(d1, ["e", "d", "b", "c"]);
			assertOrder(d2, ["e", "d", "b", "c"]);
			assertOrder(d3, ["e", "d", "b", "c"]);
		});

		it("{#2, #1, #3} -> [D, B, C, E]", () => {
			const { factory, d1, d2, d3 } = setupExample4();

			d2.createSubDirectoryOrderedAfter("d", "a");
			d1.deleteSubDirectory("a");
			d3.createSubDirectoryOrderedAfter("e", "a");

			factory.processAllMessages();

			assertOrder(d1, ["d", "b", "c", "e"]);
			assertOrder(d2, ["d", "b", "c", "e"]);
			assertOrder(d3, ["d", "b", "c", "e"]);
		});
	});

	// --- Q2: anchor deleted + re-created before stamp ---

	describe("Q2: anchor deleted and re-created before stamp", () => {
		it("uses the currently-sequenced sibling under that name as the anchor", () => {
			// Base [A, B]. On d1: delete A, create new A, then insert C after A.
			// Expected: the new A is the anchor; C orders after the new A.
			const runtimeFactory = new MockContainerRuntimeFactory();
			const d1 = createConnectedDirectory("d1", runtimeFactory);
			const d2 = createConnectedDirectory("d2", runtimeFactory);

			d1.createSubDirectory("a");
			d1.createSubDirectory("b");
			runtimeFactory.processAllMessages();

			d1.deleteSubDirectory("a");
			d1.createSubDirectory("a"); // recreated (append semantics -> goes to end)
			d2.createSubDirectoryOrderedAfter("c", "a");

			runtimeFactory.processAllMessages();

			// After processing: the A that existed was deleted; a new A was appended.
			// When "insert C after A" stamps, it finds the (re-created) A and orders after it.
			// Final sequence: [B, A, C].
			assertOrder(d1, ["b", "a", "c"]);
			assertOrder(d2, ["b", "a", "c"]);
		});
	});

	// --- Q7: local optimistic positioning ---

	describe("Q7: local optimistic positioning", () => {
		it("shows requested position immediately before ack", () => {
			const runtimeFactory = new MockContainerRuntimeFactory();
			const d1 = createConnectedDirectory("d1", runtimeFactory);

			d1.createSubDirectory("a");
			d1.createSubDirectory("b");
			runtimeFactory.processAllMessages();

			d1.createSubDirectoryOrderedAfter("c", "a");
			// Not yet stamped -- local view must already show the requested position.
			assertOrder(d1, ["a", "c", "b"]);

			runtimeFactory.processAllMessages();
			assertOrder(d1, ["a", "c", "b"]);
		});

		it("local position may shift on ack if concurrent remote activity changes it", () => {
			// Two clients concurrently insert after the same anchor.
			// Before ack, each local view has its own insertion in position 1.
			// After ack, the later-stamped one sorts earlier (closer to anchor).
			const runtimeFactory = new MockContainerRuntimeFactory();
			const d1 = createConnectedDirectory("d1", runtimeFactory);
			const d2 = createConnectedDirectory("d2", runtimeFactory);

			d1.createSubDirectory("a");
			d1.createSubDirectory("b");
			runtimeFactory.processAllMessages();

			d1.createSubDirectoryOrderedAfter("c", "a");
			d2.createSubDirectoryOrderedAfter("d", "a");

			// Pre-stamp: each client sees only its own op.
			assertOrder(d1, ["a", "c", "b"]);
			assertOrder(d2, ["a", "d", "b"]);

			// Stamp d1 first, then d2: d2's insertion sorts earlier per §4.2.
			runtimeFactory.processAllMessages();

			assertOrder(d1, ["a", "d", "c", "b"]);
			assertOrder(d2, ["a", "d", "c", "b"]);
		});
	});

	// --- Snapshot round-trip with afterParent chains ---

	describe("Snapshot round-trip", () => {
		it("preserves ordering-hint-derived order across summarize + load", async () => {
			const runtimeFactory = new MockContainerRuntimeFactory();
			const d1 = createConnectedDirectory("d1", runtimeFactory);

			d1.createSubDirectory("a");
			d1.createSubDirectory("b");
			d1.createSubDirectoryOrderedAfter("c", "a");
			d1.createSubDirectoryOrderedAfter("e", "c"); // chain length 2
			runtimeFactory.processAllMessages();

			assertOrder(d1, ["a", "c", "e", "b"]);

			const factory = SharedDirectory.getFactory();
			const dataStoreRuntime = new MockFluidDataStoreRuntime();
			runtimeFactory.createContainerRuntime(dataStoreRuntime);
			const services = MockSharedObjectServices.createFromSummary(
				d1.getAttachSummary().summary,
			);
			services.deltaConnection = dataStoreRuntime.createDeltaConnection();

			const d2 = await factory.load(
				dataStoreRuntime,
				"d2-loaded",
				services,
				factory.attributes,
			);

			assertOrder(d2, ["a", "c", "e", "b"]);
		});
	});

	// --- Reconnect / resubmit ---

	describe("Reconnect / resubmit", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
		let containerRuntime1: MockContainerRuntimeForReconnection;
		let containerRuntime2: MockContainerRuntimeForReconnection;
		let d1: ISharedDirectory;
		let d2: ISharedDirectory;
		let factory: DirectoryFactory;

		beforeEach("createDirectories", () => {
			containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
			factory = SharedDirectory.getFactory();

			const dsr1 = new MockFluidDataStoreRuntime();
			containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dsr1);
			const services1 = {
				deltaConnection: dsr1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			d1 = factory.create(dsr1, "d1");
			d1.connect(services1);

			const dsr2 = new MockFluidDataStoreRuntime();
			containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dsr2);
			const services2 = {
				deltaConnection: dsr2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			d2 = factory.create(dsr2, "d2");
			d2.connect(services2);
		});

		it("unacked ordered create survives reconnect and positions correctly", () => {
			d1.createSubDirectory("a");
			d1.createSubDirectory("b");
			containerRuntimeFactory.processAllMessages();

			containerRuntime1.connected = false;
			d1.createSubDirectoryOrderedAfter("c", "a");
			containerRuntime1.connected = true;

			containerRuntimeFactory.processAllMessages();

			assertOrder(d1, ["a", "c", "b"]);
			assertOrder(d2, ["a", "c", "b"]);
		});

		it("anchor deleted during offline window -> insert falls back to append", () => {
			d1.createSubDirectory("a");
			d1.createSubDirectory("b");
			containerRuntimeFactory.processAllMessages();

			containerRuntime1.connected = false;
			d1.createSubDirectoryOrderedAfter("c", "a");

			// While d1 is offline, d2 deletes the anchor.
			d2.deleteSubDirectory("a");
			containerRuntimeFactory.processAllMessages();

			containerRuntime1.connected = true;
			containerRuntimeFactory.processAllMessages();

			// Anchor is gone at stamp time; C falls back to append.
			assertOrder(d1, ["b", "c"]);
			assertOrder(d2, ["b", "c"]);
		});

		it("same-name concurrent create during offline window -> merge applies", () => {
			d1.createSubDirectory("a");
			d1.createSubDirectory("b");
			containerRuntimeFactory.processAllMessages();

			containerRuntime1.connected = false;
			d1.createSubDirectoryOrderedAfter("c", "a");

			// d2 creates same-name "c" (plain append) while d1 is offline and is stamped first.
			d2.createSubDirectory("c");
			containerRuntimeFactory.processAllMessages();

			containerRuntime1.connected = true;
			containerRuntimeFactory.processAllMessages();

			// Same-name merge: first-stamped wins; d2's plain append positions "c" at the end.
			// d1's ordering hint is ignored per Requirements §4.3.
			assertOrder(d1, ["a", "b", "c"]);
			assertOrder(d2, ["a", "b", "c"]);
		});
	});
});
