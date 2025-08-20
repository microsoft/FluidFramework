/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { AttachState } from "@fluidframework/container-definitions/internal";
import { MergeTreeDeltaType } from "@fluidframework/merge-tree/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
	type MockContainerRuntime,
} from "@fluidframework/test-runtime-utils/internal";

import { SharedStringFactory, type SharedString } from "../sequenceFactory.js";
import { SharedStringClass } from "../sharedString.js";

function setupSharedStringRollbackTest() {
	const containerRuntimeFactory = new MockContainerRuntimeFactory({ flushMode: 1 });
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: "1" });
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const sharedString = new SharedStringClass(
		dataStoreRuntime,
		"shared-string-1",
		SharedStringFactory.Attributes,
	);
	dataStoreRuntime.setAttachState(AttachState.Attached);
	sharedString.initializeLocal();
	sharedString.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
	return {
		sharedString,
		dataStoreRuntime,
		containerRuntimeFactory,
		containerRuntime,
	};
}

// Helper to create another client attached to the same containerRuntimeFactory
function createAdditionalClient(
	containerRuntimeFactory: MockContainerRuntimeFactory,
	id: string = "client-2",
): {
	sharedString: SharedStringClass;
	dataStoreRuntime: MockFluidDataStoreRuntime;
	containerRuntime: MockContainerRuntime;
} {
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: id });
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const sharedString = new SharedStringClass(
		dataStoreRuntime,
		`shared-string-${id}`,
		SharedStringFactory.Attributes,
	);
	dataStoreRuntime.setAttachState(AttachState.Attached);
	sharedString.initializeLocal();
	sharedString.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
	return { sharedString, dataStoreRuntime, containerRuntime };
}

describe("SharedString rollback with multiple clients (insert/remove)", () => {
	it("Client1 insert + Client2 insert + rollback on Client1", () => {
		const {
			sharedString: client1,
			containerRuntimeFactory,
			containerRuntime: cr1,
		} = setupSharedStringRollbackTest();
		const { sharedString: client2, containerRuntime: cr2 } = createAdditionalClient(
			containerRuntimeFactory,
			"2",
		);

		// Baseline text
		client1.insertText(0, "hello");
		cr1.flush();
		containerRuntimeFactory.processAllMessages();

		assert.equal(client1.getText(), "hello");
		assert.equal(client2.getText(), "hello");

		// Both clients make local edits (pending)
		client1.insertText(5, " world"); // pending on Client1
		client2.insertText(5, " there"); // pending on Client2

		// Before processing, remote should not see each other's pending edits
		assert.equal(client1.getText(), "hello world");
		assert.equal(client2.getText(), "hello there");

		// Process messages to synchronize
		cr1.flush();
		cr2.flush();
		containerRuntimeFactory.processAllMessages();

		// Both clients see each other's committed edits
		assert.equal(client1.getText(), "hello there world");
		assert.equal(client2.getText(), "hello there world");

		// Rollback pending edits on Client1 (which were already flushed locally)
		// To illustrate rollback, add another local insert
		client1.insertText(17, "!");
		assert.equal(client1.getText(), "hello there world!");

		cr1.rollback?.();
		assert.equal(
			client1.getText(),
			"hello there world",
			"rollback discards Client1 pending insert",
		);
		assert.equal(client2.getText(), "hello there world", "remote unchanged");
	});

	it("Client1 remove + Client2 insert + rollback on Client1", () => {
		const {
			sharedString: client1,
			containerRuntimeFactory,
			containerRuntime: cr1,
		} = setupSharedStringRollbackTest();
		const { sharedString: client2, containerRuntime: cr2 } = createAdditionalClient(
			containerRuntimeFactory,
			"2",
		);

		// Baseline text
		client1.insertText(0, "abcdef");
		cr1.flush();
		containerRuntimeFactory.processAllMessages();

		assert.equal(client2.getText(), "abcdef");

		// Client1 removes locally (pending)
		client1.removeText(0, 3); // "abc" removed locally
		assert.equal(client1.getText(), "def");
		assert.equal(client2.getText(), "abcdef");

		// Client2 inserts locally (pending)
		client2.insertText(3, "XYZ"); // adds at position 3
		assert.equal(client2.getText(), "abcXYZdef");
		assert.equal(client1.getText(), "def");

		// Flush both and process
		cr1.flush();
		cr2.flush();
		containerRuntimeFactory.processAllMessages();

		// Texts converge
		assert.equal(client1.getText(), "XYZdef");
		assert.equal(client2.getText(), "XYZdef");

		// Rollback Client1 pending removes (none left) just to confirm no crash
		cr1.rollback?.();
		assert.equal(client1.getText(), "XYZdef");
		assert.equal(client2.getText(), "XYZdef");
	});

	it("Client1 insert + Client2 remove + rollback on Client1", () => {
		const {
			sharedString: client1,
			containerRuntimeFactory,
			containerRuntime: cr1,
		} = setupSharedStringRollbackTest();
		const { sharedString: client2, containerRuntime: cr2 } = createAdditionalClient(
			containerRuntimeFactory,
			"2",
		);

		// Baseline text
		client1.insertText(0, "123456");
		cr1.flush();
		containerRuntimeFactory.processAllMessages();

		// Client1 inserts locally (pending)
		client1.insertText(6, "ABC");
		assert.equal(client1.getText(), "123456ABC");
		assert.equal(client2.getText(), "123456");

		// Client2 removes some text locally (pending)
		client2.removeText(2, 4); // removes "34"
		assert.equal(client2.getText(), "1256");
		assert.equal(client1.getText(), "123456ABC");

		// Rollback Client1 pending insert (if any)
		cr1.rollback?.();
		assert.equal(client1.getText(), "123456", "rollback discards pending insert");

		// Flush both and process
		cr1.flush();
		cr2.flush();
		containerRuntimeFactory.processAllMessages();

		assert.equal(client1.getText(), "1256", "rollback removes Client1 insert");
		assert.equal(client2.getText(), "1256", "remote unchanged after rollback");
	});

	it("Client1 insert + Client2 insert + rollback on Client2", () => {
		const {
			sharedString: client1,
			containerRuntimeFactory,
			containerRuntime: cr1,
		} = setupSharedStringRollbackTest();
		const { sharedString: client2, containerRuntime: cr2 } = createAdditionalClient(
			containerRuntimeFactory,
			"2",
		);

		// Baseline text
		client1.insertText(0, "hello");
		cr1.flush();
		containerRuntimeFactory.processAllMessages();

		assert.equal(client1.getText(), "hello");
		assert.equal(client2.getText(), "hello");

		// Both clients make local edits (pending)
		client1.insertText(5, " world"); // pending on Client1
		client2.insertText(5, " there"); // pending on Client2

		// Before processing, remote should not see each other's pending edits
		assert.equal(client1.getText(), "hello world");
		assert.equal(client2.getText(), "hello there");

		// Process messages to synchronize
		cr1.flush();
		cr2.flush();
		containerRuntimeFactory.processAllMessages();

		// Both clients see each other's committed edits
		assert.equal(client1.getText(), "hello there world");
		assert.equal(client2.getText(), "hello there world");

		// Rollback pending edits on Client1 (which were already flushed locally)
		// To illustrate rollback, add another local insert
		client2.insertText(17, "!");
		assert.equal(client2.getText(), "hello there world!");

		cr2.rollback?.();
		assert.equal(
			client2.getText(),
			"hello there world",
			"rollback discards Client2 pending insert",
		);
		assert.equal(client1.getText(), "hello there world", "remote unchanged");
	});
});

describe("SharedString replaceText with rollback and two clients", () => {
	it("Client1 replaceText + rollback without remote changes", () => {
		const {
			sharedString: client1,
			containerRuntimeFactory,
			containerRuntime: cr1,
		} = setupSharedStringRollbackTest();
		const { sharedString: client2 } = createAdditionalClient(containerRuntimeFactory, "2");

		// Baseline text
		client1.insertText(0, "hello world");
		cr1.flush();
		containerRuntimeFactory.processAllMessages();
		assert.equal(client2.getText(), "hello world");

		// Client1 replaces text locally (pending)
		client1.replaceText(6, 11, "there!");
		assert.equal(client1.getText(), "hello there!");
		assert.equal(client2.getText(), "hello world");

		// Rollback pending replace
		cr1.rollback?.();
		assert.equal(client1.getText(), "hello world", "rollback restores original text");
		assert.equal(client2.getText(), "hello world", "remote unchanged");
	});

	it("Client1 multiple replaceText + rollback", () => {
		const {
			sharedString: client1,
			containerRuntimeFactory,
			containerRuntime: cr1,
		} = setupSharedStringRollbackTest();
		const { sharedString: client2 } = createAdditionalClient(containerRuntimeFactory, "2");

		client1.insertText(0, "hello world");
		cr1.flush();
		containerRuntimeFactory.processAllMessages();

		// Multiple local replacements
		client1.replaceText(6, 11, "there!");
		client1.replaceText(0, 5, "hi");
		assert.equal(client1.getText(), "hi there!");
		assert.equal(client2.getText(), "hello world");

		// Rollback all pending replaces
		cr1.rollback?.();
		assert.equal(client1.getText(), "hello world", "rollback restores all replaced text");
		assert.equal(client2.getText(), "hello world", "remote unchanged");
	});

	it("Client1 replaceText with concurrent remote remove", () => {
		const {
			sharedString: client1,
			containerRuntimeFactory,
			containerRuntime: cr1,
		} = setupSharedStringRollbackTest();
		const { sharedString: client2, containerRuntime: cr2 } = createAdditionalClient(
			containerRuntimeFactory,
			"2",
		);

		// Baseline text
		client1.insertText(0, "abcdef");
		cr1.flush();
		containerRuntimeFactory.processAllMessages();

		// Client1 replaces locally (pending)
		client1.replaceText(2, 4, "XY"); // "abXYef"
		assert.equal(client1.getText(), "abXYef");

		// Client2 removes text concurrently (pending)
		client2.removeText(1, 3); // removes "bX" in their local view
		assert.equal(client2.getText(), "adef");

		// Rollback Client1 before flushing
		cr1.rollback?.();
		assert.equal(client1.getText(), "abcdef", "rollback restores original text on Client1");

		// Flush both and process messages
		cr1.flush();
		cr2.flush();
		containerRuntimeFactory.processAllMessages();

		// After processing, text converges
		assert.equal(client1.getText(), "adef");
		assert.equal(client2.getText(), "adef");
	});

	it("replaceText: Rollback on both clients", () => {
		const {
			sharedString: client1,
			containerRuntimeFactory,
			containerRuntime: cr1,
		} = setupSharedStringRollbackTest();
		const { sharedString: client2, containerRuntime: cr2 } = createAdditionalClient(
			containerRuntimeFactory,
			"2",
		);

		// Baseline text
		client1.insertText(0, "abcdef");
		cr1.flush();
		containerRuntimeFactory.processAllMessages();

		// Client1 replaces locally (pending)
		client1.replaceText(2, 4, "XY"); // "abXYef"
		assert.equal(client1.getText(), "abXYef");

		// Client2 removes text concurrently (pending)
		client2.removeText(1, 3); // removes "bX" in their local view
		assert.equal(client2.getText(), "adef");

		// Rollback Client1 before flushing
		cr1.rollback?.();
		assert.equal(client1.getText(), "abcdef", "rollback restores original text on Client1");

		// Rollback Client1 before flushing
		cr2.rollback?.();
		assert.equal(client2.getText(), "abcdef", "rollback restores original text on Client2");

		// Flush both and process messages
		cr1.flush();
		cr2.flush();
		containerRuntimeFactory.processAllMessages();

		// After processing, text converges
		assert.equal(client1.getText(), "abcdef");
		assert.equal(client2.getText(), "abcdef");
	});
});

describe("SharedString annotate with rollback", () => {
	it("can annotate text and rollback without remote changes", () => {
		const {
			sharedString: client1,
			containerRuntimeFactory,
			containerRuntime: cr1,
		} = setupSharedStringRollbackTest();
		const { sharedString: client2 } = createAdditionalClient(containerRuntimeFactory, "2");

		const text = "hello world";
		const styleProps = { style: "bold" };
		client1.insertText(0, text, styleProps);
		cr1.flush();
		containerRuntimeFactory.processAllMessages();
		assert.equal(client2.getText(), text);

		// Annotate a range locally (pending)
		const colorProps = { color: "green" };
		client1.annotateRange(6, text.length, colorProps);

		for (let i = 6; i < text.length; i++) {
			assert.deepEqual(
				{ ...client1.getPropertiesAtPosition(i) },
				{ ...styleProps, ...colorProps },
				"Could not annotate props locally",
			);
		}

		// Rollback pending annotation
		cr1.rollback?.();

		for (let i = 0; i < text.length; i++) {
			assert.deepEqual(
				{ ...client1.getPropertiesAtPosition(i) },
				{ ...styleProps },
				"Rollback reverted annotations",
			);
		}

		// Remote client remains unchanged
		for (let i = 0; i < text.length; i++) {
			assert.deepEqual(
				{ ...client2.getPropertiesAtPosition(i) },
				{ ...styleProps },
				"Remote client unchanged",
			);
		}
	});

	it("can handle null annotations with rollback", () => {
		const {
			sharedString: client1,
			containerRuntimeFactory,
			containerRuntime: cr1,
		} = setupSharedStringRollbackTest();
		const { sharedString: client2 } = createAdditionalClient(containerRuntimeFactory, "2");

		const text = "hello world";
		const startingProps = { style: "bold", color: null };
		client1.insertText(0, text, startingProps);
		cr1.flush();
		containerRuntimeFactory.processAllMessages();

		for (let i = 0; i < text.length; i++) {
			assert.strictEqual(client1.getPropertiesAtPosition(i)?.color, undefined);
			assert.strictEqual(client2.getPropertiesAtPosition(i)?.color, undefined);
		}

		// Annotate locally with null values (pending)
		const updatedProps = { style: null };
		client1.annotateRange(6, text.length, updatedProps);

		for (let i = 6; i < text.length; i++) {
			assert.strictEqual(client1.getPropertiesAtPosition(i)?.style, undefined);
		}

		// Rollback pending annotation
		cr1.rollback?.();

		for (let i = 6; i < text.length; i++) {
			assert.deepEqual(
				{ ...client1.getPropertiesAtPosition(i) },
				{ style: "bold" },
				"Rollback restores original props",
			);
		}
	});

	it("handles multiple annotations with rollback", () => {
		const {
			sharedString: client1,
			containerRuntimeFactory,
			containerRuntime: cr1,
		} = setupSharedStringRollbackTest();
		const { sharedString: client2 } = createAdditionalClient(containerRuntimeFactory, "2");

		const text = "hello world";
		client1.insertText(0, text);
		cr1.flush();
		containerRuntimeFactory.processAllMessages();

		const styleProps = { style: "italic" };
		const colorProps = { color: "red" };

		// Annotate ranges with different props
		client1.annotateRange(0, 5, styleProps);
		client1.annotateRange(6, 11, colorProps);

		// Verify pending annotations locally
		for (let i = 0; i < 5; i++) {
			assert.deepEqual(
				{ ...client1.getPropertiesAtPosition(i) },
				{ ...styleProps },
				"Could not add styleProps",
			);
		}
		for (let i = 6; i < 11; i++) {
			assert.deepEqual(
				{ ...client1.getPropertiesAtPosition(i) },
				{ ...colorProps },
				"Could not add colorProps",
			);
		}

		// Rollback pending annotations
		cr1.rollback?.();

		// Verify annotations reverted
		for (let i = 0; i < text.length; i++) {
			assert.deepEqual({ ...client1.getPropertiesAtPosition(i) }, {}, "Could not add props");
		}

		// Remote client should remain unchanged (no annotations)
		for (let i = 0; i < text.length; i++) {
			assert.deepEqual({ ...client2.getPropertiesAtPosition(i) }, {}, "Could not add props");
		}
	});
});

describe("SharedString rollback triggers correct sequenceDelta events with text", () => {
	interface Event {
		op: string;
		text: string;
	}

	function setupDeltaListener(sharedString: SharedString, events: Event[]) {
		sharedString.on("sequenceDelta", ({ deltaOperation, isLocal }) => {
			if (!isLocal) return;
			switch (deltaOperation) {
				case MergeTreeDeltaType.INSERT:
					events.push({ op: "insert", text: sharedString.getText() });
					break;
				case MergeTreeDeltaType.REMOVE:
					events.push({ op: "remove", text: sharedString.getText() });
					break;
				case MergeTreeDeltaType.ANNOTATE:
					events.push({ op: "annotate", text: sharedString.getText() });
					break;
				default:
					throw new Error(`Unexpected deltaOperation: ${deltaOperation}`);
			}
		});
	}

	it("rollback of insert triggers remove", () => {
		const { sharedString, containerRuntimeFactory, containerRuntime } =
			setupSharedStringRollbackTest();
		const events: Event[] = [];
		setupDeltaListener(sharedString, events);

		sharedString.insertText(0, "hello");
		containerRuntimeFactory.processAllMessages();
		assert.equal(sharedString.getText(), "hello");

		containerRuntime.rollback?.();

		assert(
			events.some((e) => e.op === "remove" && e.text === ""),
			"Rollback of insert should trigger remove of correct text",
		);
	});

	it("rollback of remove triggers insert", () => {
		const { sharedString, containerRuntimeFactory, containerRuntime } =
			setupSharedStringRollbackTest();
		const events: Event[] = [];
		setupDeltaListener(sharedString, events);

		sharedString.insertText(0, "world");
		containerRuntimeFactory.processAllMessages();
		sharedString.removeText(0, 5);
		assert.equal(sharedString.getText(), "");

		containerRuntime.rollback?.();

		assert(
			events.some((e) => e.op === "insert" && e.text === "world"),
			"Rollback of remove should trigger insert of correct text",
		);
	});

	it("rollback of annotate clears properties", () => {
		const { sharedString, containerRuntimeFactory, containerRuntime } =
			setupSharedStringRollbackTest();
		const events: Event[] = [];
		setupDeltaListener(sharedString, events);

		sharedString.insertText(0, "abc");
		containerRuntimeFactory.processAllMessages();

		const styleProps = { style: "bold" };
		sharedString.annotateRange(0, 3, styleProps);
		for (let i = 0; i < 3; i++) {
			assert.deepEqual({ ...sharedString.getPropertiesAtPosition(i) }, styleProps);
		}

		containerRuntime.rollback?.();

		for (let i = 0; i < 3; i++) {
			assert.deepEqual(
				{ ...sharedString.getPropertiesAtPosition(i) },
				{},
				"Rollback of annotate should clear properties",
			);
		}

		assert(
			events.some((e) => e.op === "annotate" && e.text === "abc"),
			"Rollback of annotate should trigger annotate event with correct text",
		);
	});

	it("multi-client: rollback of insert triggers remove", () => {
		const {
			sharedString: client1,
			containerRuntimeFactory,
			containerRuntime: cr1,
		} = setupSharedStringRollbackTest();
		const { sharedString: client2 } = createAdditionalClient(containerRuntimeFactory, "2");

		const eventsClient1: Event[] = [];
		setupDeltaListener(client1, eventsClient1);

		client1.insertText(0, "hello");
		cr1.flush();
		containerRuntimeFactory.processAllMessages();
		assert.equal(client1.getText(), "hello");
		assert.equal(client2.getText(), "hello");

		client1.insertText(5, "world");
		cr1.rollback?.();

		assert(
			eventsClient1.some((e) => e.op === "remove" && e.text === "hello"),
			"Rollback of insert should trigger remove of correct text on client1",
		);
		assert.equal(client1.getText(), "hello");
		assert.equal(client2.getText(), "hello");
	});

	it("multi-client: rollback of remove triggers insert", () => {
		const {
			sharedString: client1,
			containerRuntimeFactory,
			containerRuntime: cr1,
		} = setupSharedStringRollbackTest();
		const { sharedString: client2 } = createAdditionalClient(containerRuntimeFactory, "2");

		const eventsClient1: Event[] = [];
		setupDeltaListener(client1, eventsClient1);

		client1.insertText(0, "world");
		cr1.flush();
		containerRuntimeFactory.processAllMessages();

		client1.removeText(0, 5);
		assert.equal(client1.getText(), "");
		assert.equal(client2.getText(), "world");

		cr1.rollback?.();

		assert(
			eventsClient1.some((e) => e.op === "insert" && e.text === "world"),
			"Rollback of remove should trigger insert of correct text on client1",
		);
		assert.equal(client1.getText(), "world");
		assert.equal(client2.getText(), "world");
	});

	it("multi-client: rollback of annotate clears properties", () => {
		const {
			sharedString: client1,
			containerRuntimeFactory,
			containerRuntime: cr1,
		} = setupSharedStringRollbackTest();
		createAdditionalClient(containerRuntimeFactory, "2");

		const eventsClient1: Event[] = [];
		setupDeltaListener(client1, eventsClient1);

		client1.insertText(0, "abc");
		cr1.flush();
		containerRuntimeFactory.processAllMessages();

		const styleProps = { style: "bold" };
		client1.annotateRange(0, 3, styleProps);

		for (let i = 0; i < 3; i++) {
			assert.deepEqual({ ...client1.getPropertiesAtPosition(i) }, styleProps);
		}

		cr1.rollback?.();

		for (let i = 0; i < 3; i++) {
			assert.deepEqual(
				{ ...client1.getPropertiesAtPosition(i) },
				{},
				"Rollback of annotate should clear properties",
			);
		}

		assert(
			eventsClient1.some((e) => e.op === "annotate" && e.text === "abc"),
			"Rollback of annotate should trigger annotate event with correct text",
		);
	});
});
