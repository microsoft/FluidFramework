/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "node:assert";

import { assert, fail } from "@fluidframework/core-utils/internal";
import { compareFluidHandles } from "@fluidframework/runtime-utils/internal";
import { MockHandle } from "@fluidframework/test-runtime-utils/internal";

// eslint-disable-next-line import-x/no-internal-modules -- The test requires internal Simple Tree APIs.
import type { TreeViewAlpha } from "../../../simple-tree/api/index.js";
import { SchemaFactoryAlpha, TreeViewConfiguration } from "../../../simple-tree/index.js";
import { hasSome } from "../../../util/index.js";
import { StringArray, createTestUndoRedoStacks } from "../../utils.js";

import {
	type DataChangeMessage,
	type HostGuestMessage,
	makePromiseWithResolver,
	parseHostGuestMessage,
} from "./common.js";
import { Host } from "./host.js";
import { normalizeTransportData } from "./handles.js";
import {
	buildDirectSessionPorts,
	buildIsolatedSessionPorts,
	disposeActiveSessions,
	handleArrayConfig,
	type SessionPorts,
	setup,
	setupCustom,
	stringArrayConfig,
} from "./sandboxingTestUtils.js";

describe("Host and Guest message protocol", () => {
	it("accepts data changes and acknowledgments", () => {
		const dataChange = normalizeTransportData({ type: "dataChange", change: { value: 1 } });
		const acknowledgment = normalizeTransportData({ type: "acknowledgment" });

		strict.equal(parseHostGuestMessage(dataChange), dataChange);
		strict.equal(parseHostGuestMessage(acknowledgment), acknowledgment);
	});

	it("rejects invalid message envelopes", () => {
		const invalidMessages: unknown[] = [
			null,
			"dataChange",
			{},
			{ type: "unknown" },
			{ type: "dataChange" },
		];

		for (const message of invalidMessages) {
			strict.throws(
				() => parseHostGuestMessage(normalizeTransportData(message)),
				/Invalid Host and Guest protocol message/,
			);
		}
	});
});

describe("Host and Guest correctness", () => {
	afterEach(function () {
		disposeActiveSessions(this.currentTest?.state === "failed");
	});

	// The Host and Guest are intended to support being run in separate JavaScript realms.
	// Verify that protocol messages are serializable and that synchronization does not depend on shared object identity.
	it("uses structured clones for protocol messages", async () => {
		const channel = new MessageChannel();
		const change = { revision: "test revision" };
		const message: DataChangeMessage = { type: "dataChange", change };
		const received = new Promise<HostGuestMessage>((resolve) => {
			channel.port2.addEventListener(
				"message",
				(event: MessageEvent<unknown>) =>
					resolve(parseHostGuestMessage(normalizeTransportData(event.data))),
				{ once: true },
			);
			channel.port2.start();
		});

		channel.port1.postMessage(message);
		const receivedMessage = await received;

		strict.deepEqual(receivedMessage, normalizeTransportData(message));
		strict.notEqual(receivedMessage, message);
		if (receivedMessage.type === "dataChange") {
			strict.notEqual(receivedMessage.change, change);
		}
		channel.port1.close();
		channel.port2.close();
	});

	it("preserves marker-shaped tree data during initialization and edits in both directions", async () => {
		const factory = new SchemaFactoryAlpha("sandbox.marker-data");
		class RecordNode extends factory.record("Record", [factory.string, factory.number]) {}
		class Records extends factory.array("Records", RecordNode) {}
		const values: Record<string, string | number>[] = [
			{ type: "__sandbox_handle__", token: 0 },
			{ type: "__sandbox_handle__", label: "ordinary user data" },
			{ type: "__sandbox_handle__", token: 0, extra: "data" },
			{ type: "__sandbox_object__", entries: "ordinary user data" },
			{ ["__proto__"]: "data", constructor: "data", prototype: "data" },
		];
		const config = new TreeViewConfiguration({ schema: Records });
		const { host, guest, provider, peer } = setupCustom(
			values,
			config,
			buildDirectSessionPorts,
		);
		const read = (nodes: Iterable<RecordNode>) =>
			Array.from(nodes, (node) => Object.fromEntries(Object.entries(node)));
		strict.deepEqual(read(guest.view.root), values);
		host.main.root.insertAtEnd(...values);
		await host.updateGuestPromise;
		strict.deepEqual(read(guest.view.root), [...values, ...values]);
		guest.view.root.insertAtEnd(...values);
		await guest.updateHostPromise;
		strict.deepEqual(read(host.main.root), [...values, ...values, ...values]);
		provider.synchronizeMessages();
		strict.deepEqual(read(peer.root), [...values, ...values, ...values]);
	});

	it("passes blob handles from the Host to the Guest", async () => {
		const { host, guest } = setupCustom([], handleArrayConfig, buildDirectSessionPorts);
		const value = new Uint8Array([1, 2, 3]).buffer;

		host.main.root.push(new MockHandle(value));
		await (host.updateGuestPromise ?? strict.fail("Expected update to be in progress"));

		const resolved = await guest.view.root[0].get();
		strict.deepEqual(resolved, value);
		strict.notEqual(resolved, value);
		strict.equal(value.byteLength, 3);
	});

	it("passes existing handles from the Guest back to the Host and peers", async () => {
		const value = new Uint8Array([4, 5]).buffer;
		const handle = new MockHandle(value);
		const { host, guest, peer, provider } = setupCustom(
			[],
			handleArrayConfig,
			buildDirectSessionPorts,
		);
		host.main.root.push(handle);
		await host.updateGuestPromise;

		guest.view.root.push(guest.view.root[0]);
		await (guest.updateHostPromise ?? strict.fail("Expected push to be in progress"));

		strict.equal(host.main.root[1], host.main.root[0]);
		strict.deepEqual(await host.main.root[1].get(), value);
		provider.synchronizeMessages();
		strict(compareFluidHandles(peer.root[1], handle));
	});

	it("preserves proxy identity across initialization and updates", async () => {
		const handle = new MockHandle(new ArrayBuffer(2));
		const { host, guest } = setupCustom(
			[handle, handle],
			handleArrayConfig,
			buildDirectSessionPorts,
		);
		const proxy = guest.view.root[0];
		strict.equal(proxy, guest.view.root[1]);
		strict.notEqual(proxy, host.main.root[0]);
		host.main.root.push(host.main.root[0]);
		await host.updateGuestPromise;
		strict.equal(proxy, guest.view.root[2]);
		strict.deepEqual(await proxy.get(), new ArrayBuffer(2));
	});

	it("clearly rejects resolution of handles to Fluid objects", async () => {
		const { host, guest, provider } = setupCustom(
			[],
			handleArrayConfig,
			buildDirectSessionPorts,
		);
		host.main.root.push(provider.trees[1].handle);
		await host.updateGuestPromise;
		await strict.rejects(guest.view.root[0].get(), {
			message:
				"Cannot resolve this handle in the Guest: only blob handles resolving to an ArrayBuffer are supported. Handles to Fluid objects are not supported.",
		});
	});

	it("propagates Host resolution failures through the port", async () => {
		const { host, guest } = setupCustom([], handleArrayConfig, buildDirectSessionPorts);
		const handle = Object.assign(new MockHandle(new ArrayBuffer(0)), {
			get: async () => {
				throw new Error("Blob retrieval failed");
			},
		});
		host.main.root.push(handle);
		await host.updateGuestPromise;
		await strict.rejects(guest.view.root[0].get(), /Blob retrieval failed/);
	});

	it("continues synchronizing edits while a blob request is pending", async () => {
		const { host, guest } = setupCustom([], handleArrayConfig, buildDirectSessionPorts);
		const requested = makePromiseWithResolver();
		const release = makePromiseWithResolver();
		const blob = new Uint8Array([7]).buffer;
		let requests = 0;
		const handle = Object.assign(new MockHandle(blob), {
			get: async () => {
				requests++;
				requested.resolver();
				await release.promise;
				return blob;
			},
		});
		host.main.root.push(handle);
		await host.updateGuestPromise;
		const proxy = guest.view.root[0];
		const first = proxy.get();
		strict.equal(proxy.get(), first);
		await requested.promise;
		guest.view.root.push(proxy);
		await guest.updateHostPromise;
		strict.equal(host.main.root.length, 2);
		host.main.root.push(handle);
		await host.updateGuestPromise;
		strict.equal(guest.view.root.length, 3);
		release.resolver();
		strict.deepEqual(await first, blob);
		strict.equal(requests, 1);
	});

	it("retains a handle for Guest deletion, undo, and redo", async () => {
		const { host, guest } = setupCustom([], handleArrayConfig, buildDirectSessionPorts);
		const blob = new Uint8Array([8]).buffer;
		const handle = new MockHandle(blob);
		host.main.root.push(handle);
		await host.updateGuestPromise;
		const proxy = guest.view.root[0];
		const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(guest.view.events);
		try {
			guest.view.root.removeAt(0);
			await guest.updateHostPromise;
			strict.equal(host.main.root.length, 0);
			strict.deepEqual(await proxy.get(), blob);
			undoStack.pop()?.revert();
			await guest.updateHostPromise;
			strict.equal(guest.view.root[0], proxy);
			strict.equal(host.main.root[0], handle);
			redoStack.pop()?.revert();
			await guest.updateHostPromise;
			strict.equal(host.main.root.length, 0);
		} finally {
			unsubscribe();
		}
	});

	it("returns an error for an unauthorized blob token", async () => {
		const { interop } = setupCustom([], handleArrayConfig, buildIsolatedSessionPorts);
		const received = new Promise<HostGuestMessage>((resolve) => {
			interop.sendToHost.addEventListener(
				"message",
				(event: MessageEvent<unknown>) =>
					resolve(parseHostGuestMessage(normalizeTransportData(event.data))),
				{ once: true },
			);
			interop.sendToHost.start();
		});
		interop.sendToHost.postMessage({ type: "blobRequest", requestId: 0, token: 0 });
		strict.deepEqual(
			await received,
			normalizeTransportData({
				type: "blobResponse",
				requestId: 0,
				error: "Unknown sandbox handle token.",
			}),
		);
	});

	for (const receiver of ["Host", "Guest"] as const) {
		it(`rejects blob messages sent in the wrong direction to the ${receiver}`, async () => {
			let reportError: (error: Error) => void = () => strict.fail("Missing error resolver");
			const error = new Promise<Error>((resolve) => {
				reportError = resolve;
			});
			const { interop } = setupCustom(
				[],
				handleArrayConfig,
				buildIsolatedSessionPorts,
				false,
				reportError,
			);
			if (receiver === "Host") {
				interop.sendToHost.postMessage({
					type: "blobResponse",
					requestId: 0,
					error: "failure",
				});
			} else {
				interop.sendToGuest.postMessage({ type: "blobRequest", requestId: 0, token: 0 });
			}
			const reported = await error;
			strict.match(reported.message, /cannot receive blob/);
		});
	}

	it("routes invalid messages to the protocol-error handler", async () => {
		let reportProtocolError: ((error: Error) => void) | undefined;
		const protocolError = new Promise<Error>((resolve) => {
			reportProtocolError = resolve;
		});
		assert(reportProtocolError !== undefined, "Protocol error reporter should be assigned");
		const { interop } = setupCustom(
			[],
			stringArrayConfig,
			buildIsolatedSessionPorts,
			false,
			reportProtocolError,
		);

		interop.sendToHost.postMessage({ type: "unknown" });

		const error = await protocolError;
		strict.match(error.message, /Invalid Host and Guest protocol message/);
	});

	it("does not acknowledge an invalid SharedTree change", async () => {
		let reportProtocolError: ((error: Error) => void) | undefined;
		const protocolError = new Promise<Error>((resolve) => {
			reportProtocolError = resolve;
		});
		assert(reportProtocolError !== undefined, "Protocol error reporter should be assigned");
		const channel = new MessageChannel();
		const local = {
			applyChange: () => {
				throw new Error("Cannot apply change. Invalid serialized change format.");
			},
			dispose: () => {},
		} as unknown as TreeViewAlpha<typeof StringArray>;
		const main = {
			fork: () => local,
			events: { on: () => () => {} },
			dispose: () => {},
		} as unknown as TreeViewAlpha<typeof StringArray>;
		let bindings = 0;
		const host = new Host(
			main,
			channel.port1,
			Object.assign(new MockHandle(undefined), {
				bind: () => {
					bindings++;
				},
			}),
			reportProtocolError,
		);
		let acknowledgmentReceived = false;
		channel.port2.addEventListener("message", () => {
			acknowledgmentReceived = true;
		});
		channel.port2.start();

		channel.port2.postMessage(
			host.codec.encode({
				type: "dataChange",
				change: { handle: new MockHandle(new ArrayBuffer(0)) },
			}),
		);
		await protocolError;
		await new Promise((resolve) => setTimeout(resolve, 0));

		strict.equal(acknowledgmentReceived, false);
		strict.equal(bindings, 0);
		host.dispose();
		channel.port2.close();
	});

	it("attempts by the Host and Guest to concurrently notify one-another of concurrent edits do not lead to inconsistencies or dropped edits", async () => {
		const { peer, host, guest, provider } = setup([]);

		// Make edits in the Guest
		guest.view.root.push("B(g)");
		guest.view.root.push("C(g)");
		// The Guest edits are synchronously reflected in the Guest
		strict.deepEqual([...guest.view.root], ["B(g)", "C(g)"]);
		// The Guest edits are not reflected in the Host yet
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);

		// The Guest should have started the process of pushing the edit to the Host
		const pushPromise =
			guest.updateHostPromise ?? strict.fail("Expected push to be in progress");

		// Before the Host has a chance to process the edits from the Guest, the peer makes an edit
		peer.root.push("B(p)");
		strict.deepEqual([...peer.root], ["B(p)"]);
		provider.synchronizeMessages();
		// The peer edit is now reflected in the Host but not the local or Guest yet
		strict.deepEqual([...host.main.root], ["B(p)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...guest.view.root], ["B(g)", "C(g)"]);

		// The Host should have started the process of updating the Guest with the peer change
		const updatePromise =
			host.updateGuestPromise ?? strict.fail("Expected update to be in progress");

		// Wait for the Guest edits to be pushed to the Host
		await pushPromise;

		// The Guest edits are now reflected in the Host
		strict.deepEqual([...host.local.root], ["B(g)", "C(g)"]);
		strict.deepEqual([...host.main.root], ["B(g)", "C(g)", "B(p)"]);
		// The Guest edits are not reflected in the peer yet
		strict.deepEqual([...peer.root], ["B(p)"]);

		provider.synchronizeMessages();

		// The Guest edits are now reflected in the peer
		strict.deepEqual([...peer.root], ["B(g)", "C(g)", "B(p)"]);

		// Wait for the update to be applied to the Guest
		await updatePromise;

		// The peer edit is now reflected in the local and Guest
		strict.deepEqual([...host.local.root], ["B(g)", "C(g)", "B(p)"]);
		strict.deepEqual([...guest.view.root], ["B(g)", "C(g)", "B(p)"]);
	});

	it("Host edits sequenced before peer edits", async () => {
		const { peer, host, guest, provider } = setup([]);

		// Make an edit on the Host
		host.main.root.push("H");
		strict.deepEqual([...host.main.root], ["H"]);

		// The Guest edits are not reflected in the Guest or peer yet
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...guest.view.root], []);
		strict.deepEqual([...peer.root], []);

		// The Host should have started the process of updating the Guest with the peer change
		const updatePromise =
			host.updateGuestPromise ?? strict.fail("Expected update to be in progress");

		// Before the Guest has a chance to process the edits from the Host, the peer makes an edit
		peer.root.push("P");
		strict.deepEqual([...peer.root], ["P"]);

		provider.synchronizeMessages();
		// The peer and Host edits are sequenced
		strict.deepEqual([...host.main.root], ["P", "H"]);
		strict.deepEqual([...peer.root], ["P", "H"]);

		// The Guest is still in the process of updating
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...guest.view.root], []);

		// Wait for the update to be applied to the Guest
		await updatePromise;

		// The peer edit is now reflected in the local and Guest
		strict.deepEqual([...host.local.root], ["P", "H"]);
		strict.deepEqual([...guest.view.root], ["P", "H"]);
	});

	it("peer edits sequenced before Host edits", async () => {
		const { peer, host, guest, provider } = setup([]);

		// Make an edit on the peer
		peer.root.push("P");
		strict.deepEqual([...peer.root], ["P"]);

		// Make an edit on the Host
		host.main.root.push("H");
		strict.deepEqual([...host.main.root], ["H"]);

		// The Host should have started the process of updating the Guest with the peer change
		const updatePromise =
			host.updateGuestPromise ?? strict.fail("Expected update to be in progress");

		provider.synchronizeMessages();

		// The peer and Host edits are sequenced
		strict.deepEqual([...host.main.root], ["H", "P"]);
		strict.deepEqual([...peer.root], ["H", "P"]);

		// The Guest is still in the process of updating
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...guest.view.root], []);

		// Wait for the update to be applied to the Guest
		await updatePromise;

		// The peer edit is now reflected in the local and Guest
		strict.deepEqual([...host.local.root], ["H", "P"]);
		strict.deepEqual([...guest.view.root], ["H", "P"]);
	});

	it("Guest edits can be reverted", async () => {
		const { host, guest } = setup([]);
		const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(guest.view.events);

		// Make undoable edits in the Guest
		guest.view.root.push("Ga");
		guest.view.root.push("Gb");
		guest.view.root.push("Gc");
		strict.deepEqual([...guest.view.root], ["Ga", "Gb", "Gc"]);
		strict.deepEqual(undoStack.length, 3, "Expected undo stack to have 3 entries");

		// The Guest should have started the process of pushing the edit to the Host
		let pushPromise =
			guest.updateHostPromise ?? strict.fail("Expected push to be in progress");
		await pushPromise;

		strict.deepEqual([...guest.view.root], ["Ga", "Gb", "Gc"]);
		strict.deepEqual([...host.local.root], ["Ga", "Gb", "Gc"]);
		strict.deepEqual([...host.main.root], ["Ga", "Gb", "Gc"]);

		// Make an edit on the Host
		host.main.root.insertAtStart("H");
		strict.deepEqual([...host.main.root], ["H", "Ga", "Gb", "Gc"]);

		// Wait for the update to be applied to the Guest
		const updatePromise =
			host.updateGuestPromise ?? strict.fail("Expected update to be in progress");
		await updatePromise;

		strict.deepEqual([...host.local.root], ["H", "Ga", "Gb", "Gc"]);
		strict.deepEqual([...guest.view.root], ["H", "Ga", "Gb", "Gc"]);

		strict.deepEqual(
			undoStack.length,
			4,
			"Expected Host change to add an entry to the undo stack",
		);
		undoStack.pop()?.dispose();

		// Undo the Guest edits
		undoStack.pop()?.revert();
		undoStack.pop()?.revert();
		undoStack.pop()?.revert();

		// The Guest should have started the process of pushing the edits to the Host
		pushPromise = guest.updateHostPromise ?? strict.fail("Expected push to be in progress");
		await pushPromise;

		strict.deepEqual([...guest.view.root], ["H"]);
		strict.deepEqual([...host.local.root], ["H"]);
		strict.deepEqual([...host.main.root], ["H"]);
		assert(redoStack.length === 3, "Expected redo stack to have 3 entries");

		// Undo the Guest edits
		redoStack.pop()?.revert();
		redoStack.pop()?.revert();
		redoStack.pop()?.revert();

		// The Guest should have started the process of pushing the edits to the Host
		pushPromise = guest.updateHostPromise ?? strict.fail("Expected push to be in progress");
		await pushPromise;

		strict.deepEqual([...host.local.root], ["H", "Ga", "Gb", "Gc"]);
		strict.deepEqual([...guest.view.root], ["H", "Ga", "Gb", "Gc"]);
		unsubscribe();
	});

	// TODO: investigate and fix the memory leaks in this test, then run it with higher number of steps.
	it("All permutations", async function () {
		this.timeout(20_000);
		/**
		 * The number of {@link Step | steps} in each scenario.
		 */
		const maxSteps = 4;
		/**
		 * A potential action that could be taken at each step of a run.
		 */
		enum Step {
			/** Make an edit on the Host */
			HostEdit = "He",
			/** Make an edit on the Guest */
			GuestEdit = "Ge",
			/** Make an edit on the peer */
			PeerEdit = "Pe",
			/** Make the Host receive a sequenced edit from the peer */
			SequenceEdit = "Se",
			/** Make the Host receive its own sequenced edit */
			SequenceAck = "Sa",
			/** Notify the Guest of an update sent by the Host. */
			HostToGuestEdit = "H2Ge",
			/** Notify the Host of a Guest-bound update ack sent by the Guest. */
			GuestToHostAck = "G2Ha",
			/** Notify the Host of an edit sent by the Guest. */
			GuestToHostEdit = "G2He",
			/** Notify the Guest of a Host-bound edit ack sent by the Host. */
			HostToGuestAck = "H2Ga",
		}

		/** Controls queued message delivery between the Host and the Guest. */
		interface MessageRelay {
			/** Messages that the Host sent and the relay has not sent to the Guest. */
			readonly hostToGuest: HostGuestMessage[];
			/** Messages that the Guest sent and the relay has not sent to the Host. */
			readonly guestToHost: HostGuestMessage[];

			/** Sends the first queued Host message to the Guest. */
			dispatchToGuest(): void;
			/** Sends the first queued Guest message to the Host. */
			dispatchToHost(): void;
			/** Waits until all dispatched messages reach a relay queue or participant. */
			waitForMessages(): Promise<void>;
		}

		/**
		 * Builds a two-channel relay that controls message delivery.
		 *
		 * @remarks
		 * Serves as a middle-man between the Host and Guest, allowing
		 * tests to control when messages are delivered, and to monitor them.
		 *
		 * @returns The session ports and relay controls.
		 */
		function buildMessageRelay(): SessionPorts<MessageRelay> {
			// Host <--hostRelayChannel--> Relay <--guestRelayChannel--> Guest

			/** Connects the Host to the relay. */
			const hostRelayChannel = new MessageChannel();

			/** Connects the relay to the Guest. */
			const guestRelayChannel = new MessageChannel();

			/** The relay-owned endpoint that receives Host messages and sends messages to the Host. */
			const relayPortConnectedToHost = hostRelayChannel.port2;

			/** The relay-owned endpoint that receives Guest messages and sends messages to the Guest. */
			const relayPortConnectedToGuest = guestRelayChannel.port1;

			/** The number of messages that participants sent but the relay has not received. */
			let messagesMovingToRelay = 0;

			/** The number of messages that the relay sent but participants have not processed. */
			let messagesMovingToParticipants = 0;

			/** Functions that resolve calls to `waitForMessages()`. */
			const settledResolvers: (() => void)[] = [];

			/** Resolves each waiter when no message is moving through a channel. */
			const resolveIfSettled = (): void => {
				if (messagesMovingToRelay === 0 && messagesMovingToParticipants === 0) {
					for (const resolve of settledResolvers.splice(0)) {
						resolve();
					}
				}
			};

			/**
			 * Tracks messages that move between a participant and its relay endpoint.
			 */
			class TrackedParticipantPort extends EventTarget {
				public constructor(
					/** The MessagePort that is being observed and tracked. */
					private readonly observedPort: MessagePort,
				) {
					super();
					this.observedPort.addEventListener("message", (event: MessageEvent<unknown>) => {
						try {
							this.dispatchEvent(new MessageEvent("message", { data: event.data }));
						} finally {
							messagesMovingToParticipants -= 1;
							resolveIfSettled();
						}
					});
					this.observedPort.addEventListener("messageerror", () => {
						try {
							this.dispatchEvent(new MessageEvent("messageerror"));
						} finally {
							messagesMovingToParticipants -= 1;
							resolveIfSettled();
						}
					});
				}

				/**
				 * Sends a message to the relay and tracks its delivery.
				 *
				 * @param message - The message to send.
				 * @param transferOrOptions - Transferable objects or structured-clone options.
				 */
				public postMessage(
					message: unknown,
					transferOrOptions?: Transferable[] | StructuredSerializeOptions,
				): void {
					messagesMovingToRelay += 1;
					try {
						// The branches select different `MessagePort.postMessage` overloads.
						// TypeScript cannot pass the union directly because no overload accepts both types.
						if (Array.isArray(transferOrOptions)) {
							this.observedPort.postMessage(message, transferOrOptions);
						} else {
							this.observedPort.postMessage(message, transferOrOptions);
						}
					} catch (error) {
						messagesMovingToRelay -= 1;
						resolveIfSettled();
						throw error;
					}
				}

				/** Starts message delivery on the inner port. */
				public start(): void {
					this.observedPort.start();
				}

				/** Closes the inner port. */
				public close(): void {
					this.observedPort.close();
				}
			}

			/** The Host-owned endpoint, wrapped to track messages moving through its channel. */
			const trackedHostPort = new TrackedParticipantPort(hostRelayChannel.port1);
			/** The Guest-owned endpoint, wrapped to track messages moving through its channel. */
			const trackedGuestPort = new TrackedParticipantPort(guestRelayChannel.port2);

			const relay: MessageRelay = {
				hostToGuest: [],
				guestToHost: [],
				dispatchToGuest: (): void => {
					const message = relay.hostToGuest.shift() ?? fail("No Guest-bound messages");
					messagesMovingToParticipants += 1;
					try {
						relayPortConnectedToGuest.postMessage(message);
					} catch (error) {
						messagesMovingToParticipants -= 1;
						resolveIfSettled();
						throw error;
					}
				},
				dispatchToHost: (): void => {
					const message = relay.guestToHost.shift() ?? fail("No Host-bound messages");
					messagesMovingToParticipants += 1;
					try {
						relayPortConnectedToHost.postMessage(message);
					} catch (error) {
						messagesMovingToParticipants -= 1;
						resolveIfSettled();
						throw error;
					}
				},
				waitForMessages: async (): Promise<void> => {
					if (messagesMovingToRelay !== 0 || messagesMovingToParticipants !== 0) {
						await new Promise<void>((resolve) => settledResolvers.push(resolve));
					}
				},
			};

			relayPortConnectedToHost.addEventListener("message", (event: MessageEvent<unknown>) => {
				try {
					relay.hostToGuest.push(parseHostGuestMessage(normalizeTransportData(event.data)));
				} finally {
					messagesMovingToRelay -= 1;
					resolveIfSettled();
				}
			});
			relayPortConnectedToGuest.addEventListener("message", (event: MessageEvent<unknown>) => {
				try {
					relay.guestToHost.push(parseHostGuestMessage(normalizeTransportData(event.data)));
				} finally {
					messagesMovingToRelay -= 1;
					resolveIfSettled();
				}
			});
			relayPortConnectedToHost.start();
			relayPortConnectedToGuest.start();

			return {
				hostPort: trackedHostPort as unknown as MessagePort,
				guestPort: trackedGuestPort as unknown as MessagePort,
				interop: relay,
				dispose: () => {
					relayPortConnectedToHost.close();
					relayPortConnectedToGuest.close();
				},
			};
		}

		type Edit = "Edit";
		const Edit: Edit = "Edit";
		let scenario = 0;
		/**
		 * The steps that could be taken at each step of a run.
		 * The inner arrays represents alternative steps that could be taken at that step of the run.
		 * The outer array represents the steps of the run.
		 *
		 * Note: to test a specific scenario, you can initialize `potential` with a specific sequence of steps.
		 * E.g., `[[Step.GuestEdit], [Step.GuestEdit], [Step.GuestToHostEdit], [Step.SequenceAck], [Step.GuestToHostEdit], [Step.SequenceAck]]`.
		 */
		const potential: Step[][] = [[Step.GuestEdit, Step.HostEdit, Step.PeerEdit]];
		while (hasSome(potential)) {
			scenario += 1;
			const { teardown, peer, host, guest, provider, interop, logger } = setupCustom(
				[],
				stringArrayConfig,
				buildMessageRelay,
				false,
			);
			let peerEditCounter = 0;
			let hostEditCounter = 0;
			let guestEditCounter = 0;
			const serviceQueue: (Step.SequenceEdit | Step.SequenceAck)[] = [];
			const offPeerChange = peer.events.on("changed", ({ isLocal }) => {
				if (isLocal) {
					serviceQueue.push(Step.SequenceEdit);
				}
			});
			const offHostChange = host.main.events.on("changed", ({ isLocal }) => {
				if (isLocal) {
					serviceQueue.push(Step.SequenceAck);
				}
			});
			const actual: Step[] = [];
			while (actual.length < maxSteps) {
				if (actual.length === potential.length) {
					const potentialNext: Step[] = [Step.GuestEdit, Step.HostEdit, Step.PeerEdit];
					if (hasSome(serviceQueue)) {
						potentialNext.push(serviceQueue[0]);
					}
					if (hasSome(interop.hostToGuest)) {
						potentialNext.push(
							interop.hostToGuest[0].type === "acknowledgment"
								? Step.HostToGuestAck
								: Step.HostToGuestEdit,
						);
					}
					if (hasSome(interop.guestToHost)) {
						potentialNext.push(
							interop.guestToHost[0].type === "acknowledgment"
								? Step.GuestToHostAck
								: Step.GuestToHostEdit,
						);
					}
					potential.push(potentialNext);
				}
				const step: Step = potential[actual.length][0] ?? fail("No next step available");
				logger(`--> [${actual.join(", ")}] + ${step}`);
				switch (step) {
					case Step.GuestEdit: {
						guestEditCounter += 1;
						guest.view.root.push(`G${guestEditCounter}`);
						break;
					}
					case Step.HostEdit: {
						hostEditCounter += 1;
						host.main.root.push(`H${hostEditCounter}`);
						break;
					}
					case Step.PeerEdit: {
						peerEditCounter += 1;
						peer.root.push(`P${peerEditCounter}`);
						break;
					}
					case Step.SequenceEdit:
					case Step.SequenceAck: {
						const expected = serviceQueue.shift();
						strict.equal(expected, step);
						let nextMessage = provider.peekNextMessage();
						while (
							nextMessage?.type === "op" &&
							(nextMessage.contents as { type?: string }).type === "idAllocation"
						) {
							provider.synchronizeMessages({ count: 1 });
							nextMessage = provider.peekNextMessage();
						}
						provider.synchronizeMessages({ count: 1 });
						break;
					}
					case Step.HostToGuestEdit:
					case Step.HostToGuestAck: {
						interop.dispatchToGuest();
						break;
					}
					case Step.GuestToHostEdit:
					case Step.GuestToHostAck: {
						interop.dispatchToHost();
						break;
					}
					default: {
						throw new Error(`Unexpected step: ${step}`);
					}
				}
				await interop.waitForMessages();
				actual.push(step);
				if (interop.hostToGuest.length === 0 && interop.guestToHost.length === 0) {
					strict.deepEqual([...host.main.root], [...guest.view.root]);
					strict.deepEqual([...host.local.root], [...guest.view.root]);
				}

				if (host.updateGuestPromise === undefined) {
					strict.equal(host.local.isMissingEditsFrom(host.main), false);
				}

				if (actual.length === maxSteps) {
					potential.push([]);
					do {
						potential.pop();
						potential.at(-1)?.shift();
					} while (potential.at(-1)?.length === 0);
				}
			}
			offPeerChange();
			offHostChange();
			teardown();
		}
		console.log(`${scenario} scenarios tested`);
	});
});
