/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	createFuzzDescribe,
	generateTestSeeds,
	makeRandom,
	StressMode,
} from "@fluid-private/stochastic-test-utils";
import { fail } from "@fluidframework/core-utils/internal";
import {
	createIdCompressor,
	deserializeIdCompressor,
	type IIdCompressor,
	SerializationVersion,
	serializeIdCompressor,
	toIdCompressorWithCore,
} from "@fluidframework/id-compressor/internal";
import { compareFluidHandles } from "@fluidframework/runtime-utils/internal";
import { createChildLogger, UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	MockHandle,
	validateAssertionError,
	validateUsageError,
} from "@fluidframework/test-runtime-utils/internal";

import { asAlpha } from "../../../api.js";
import { FluidClientVersion } from "../../../codec/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import {
	SchemaFactoryAlpha,
	toInitialSchema,
	TreeViewConfiguration,
} from "../../../simple-tree/index.js";
import { configuredSharedTree } from "../../../treeFactory.js";
import { brand, hasSome } from "../../../util/index.js";
import {
	checkoutWithContent,
	createTestUndoRedoStacks,
	fieldCursorFromInsertable,
	mintRevisionTag,
	testIdCompressor,
	TestTreeProviderLite,
	viewCheckout,
} from "../../utils.js";

import {
	type GuestChangeMessage,
	type HostGuestMessage,
	type HostUpdateMessage,
	makePromiseWithResolvers,
	parseHostGuestMessage,
	SandboxProtocolError,
} from "./common.js";
import { Guest } from "./guest.js";
import { Host } from "./host.js";
import { GuestSynchronization } from "./guestSynchronization.js";
import { HostSynchronization } from "./hostSynchronization.js";
import { SandboxSessionEndpoint } from "./session.js";
import { normalizeTransportData } from "./transport.js";
import { getBranch, getCheckout, getFinalizedCommit } from "./synchronizationUtils.js";
import {
	buildDirectSessionPorts,
	buildIsolatedSessionPorts,
	createGuestForHost,
	disposeActiveSessions,
	handleArrayConfig,
	type SessionPorts,
	setup,
	setupCustom,
	stringArrayConfig,
} from "./sandboxingTestUtils.js";

/**
 * Creates a real child ID space shard token for envelope wire-shape tests.
 */
function createTestIdSpaceShardToken() {
	const [serializedIdSpaceShard] = createIdCompressor(SerializationVersion.V3).shard(1);
	assert(serializedIdSpaceShard !== undefined, "Expected a serialized test ID space shard");
	const idSpaceShard = deserializeIdCompressor(
		serializedIdSpaceShard,
		SerializationVersion.V3,
	);
	return (
		idSpaceShard.getShardSyncToken() ??
		assert.fail("Expected a child ID space shard synchronization token")
	);
}

/**
 * Gets a checkout's compressor for sandbox tests that verify ID space shard identity and progress.
 */
function getCheckoutIdCompressor(checkout: ReturnType<typeof getCheckout>): IIdCompressor {
	// eslint-disable-next-line @typescript-eslint/dot-notation -- The checkout's compressor is private.
	return checkout["idCompressor"];
}

describe("Host and Guest message protocol", () => {
	it("accepts initialization, branch updates, Guest changes, and acknowledgments", () => {
		const messages = [
			{
				type: "hostInitialization",
				baseRevision: 1,
				mainRevision: 2,
				trunkRevision: 1,
				tree: [],
				schema: {},
				commits: [{ value: 1 }],
				idCompressor: "serialized child",
			},
			{
				type: "hostUpdate",
				updateId: 0,
				baseRevision: "root",
				mainRevision: 1,
				trunkRevision: "root",
				commits: [{ value: 1 }],
			},
			{
				type: "guestChange",
				changeId: 0,
				mainRevision: 1,
				trunkRevision: "root",
				change: { value: 2 },
				idSpaceShardToken: createTestIdSpaceShardToken(),
			},
			{ type: "hostUpdateAck", updateId: 0 },
			{ type: "guestChangeAck", changeId: 0 },
		];

		for (const message of messages) {
			const normalized = normalizeTransportData(message);
			assert.equal(parseHostGuestMessage(normalized), normalized);
		}
	});

	it("rejects invalid message envelopes", () => {
		const validChange = {
			type: "guestChange",
			changeId: 0,
			mainRevision: "root",
			trunkRevision: "root",
			change: {},
		};
		const token = createTestIdSpaceShardToken();
		const invalidMessages: unknown[] = [
			null,
			"guestChange",
			{},
			{ type: "unknown" },
			{ type: "hostInitialization" },
			// Initialization requires the serialized child compressor, even when all other fields are present.
			{
				type: "hostInitialization",
				baseRevision: "root",
				mainRevision: "root",
				trunkRevision: "root",
				tree: [],
				schema: {},
				commits: [],
			},
			// A number cannot represent the serialized compressor state.
			{
				type: "hostInitialization",
				baseRevision: "root",
				mainRevision: "root",
				trunkRevision: "root",
				tree: [],
				schema: {},
				commits: [],
				idCompressor: 1,
			},
			{ type: "guestChange" },
			// A Guest change cannot be decoded safely without the child ID space shard progress token.
			validChange,
			{ ...validChange, idSpaceShardToken: null },
			// Disposal would let a change message reclaim the ID space while the Guest is still active.
			{ ...validChange, idSpaceShardToken: { ...token, disposed: true } },
			// Progress must be a nonnegative safe integer, and the child ID must be a valid session ID.
			{ ...validChange, idSpaceShardToken: { ...token, localGenCount: -1 } },
			{ ...validChange, idSpaceShardToken: { ...token, localGenCount: 1.5 } },
			{
				...validChange,
				idSpaceShardToken: { ...token, localGenCount: Number.MAX_SAFE_INTEGER + 1 },
			},
			{ ...validChange, idSpaceShardToken: { ...token, shardId: "not a session ID" } },
			// Unexpected fields must not bypass the token or message envelope validation.
			{ ...validChange, idSpaceShardToken: { ...token, unexpected: true } },
			{ ...validChange, idSpaceShardToken: token, extra: true },
			{ type: "hostUpdateAck" },
			{ type: "guestChangeAck" },
			{ type: "sessionFailure" },
			{ type: "sessionFailure", error: 0 },
			{ type: "sessionFailure", error: "failure", extra: true },
		];

		for (const message of invalidMessages) {
			assert.throws(
				() => parseHostGuestMessage(normalizeTransportData(message)),
				SandboxProtocolError,
			);
		}
	});

	it("preserves error identity and classification in local session reports", async () => {
		const causes: Error[] = [
			new SandboxProtocolError("Invalid protocol data"),
			new UsageError("Invalid application use"),
			new Error("Transport unavailable"),
		];
		assert.throws(
			() => fail("Sandbox test invariant"),
			(error: unknown) => {
				assert(error instanceof Error);
				assert(validateAssertionError("Sandbox test invariant")(error));
				causes.push(error);
				return true;
			},
		);
		for (const cause of causes) {
			const channel = new MessageChannel();
			const reported = makePromiseWithResolvers();
			const stoppedWith: Error[] = [];
			const reportedWith: Error[] = [];
			const endpoint = new SandboxSessionEndpoint(
				channel.port1,
				(error) => {
					stoppedWith.push(error);
				},
				(error) => {
					reportedWith.push(error);
					reported.resolver();
				},
			);
			try {
				assert.doesNotThrow(() => endpoint.fail(cause));
				assert.equal(reportedWith.length, 0);
				await reported.promise;
				assert.equal(endpoint.active, false);
				assert.equal(endpoint.error, stoppedWith[0]);
				assert.equal(endpoint.error, reportedWith[0]);
				assert.equal(endpoint.error?.cause, cause);
				assert.match(endpoint.error?.message ?? "", /recreate the Host and Guest/);
				endpoint.fail(new Error("Later failure"));
				assert.equal(endpoint.error?.cause, cause);
				assert.equal(stoppedWith.length, 1);
				assert.equal(reportedWith.length, 1);
				assert.throws(() => endpoint.breaker.use(), validateUsageError(/Invalid use/));
			} finally {
				endpoint.dispose();
				channel.port2.close();
			}
		}
	});
});

describe("Host and Guest correctness", () => {
	afterEach(function () {
		disposeActiveSessions(this.currentTest?.state === "failed");
	});

	it("initializes through the port with a distinct child compressor", async () => {
		const { guest, provider } = await setup(["initial"]);
		const root = provider.getCompressor(provider.trees[1]);
		const idSpaceShard = getCheckoutIdCompressor(getCheckout(guest.view));

		// The Guest has a distinct compressor with the Host's session ID, but it is a child, not another root.
		assert.notEqual(idSpaceShard, root);
		assert.equal(idSpaceShard.localSessionId, root.localSessionId);
		assert.equal(
			toIdCompressorWithCore(idSpaceShard).getShardSyncToken()?.disposed,
			false,
			"Expected an active child ID space shard, not a copy of the root",
		);
		assert.deepEqual([...guest.view.root], ["initial"]);
	});

	it("rejects an invalid serialized child before constructing the Guest view", async () => {
		const channel = new MessageChannel();
		const errors: Error[] = [];
		const guestPromise = Guest.create({
			config: stringArrayConfig,
			treeOptions: { jsonValidator: FormatValidatorBasic },
			port: channel.port2,
			logger: createChildLogger({ namespace: "Guest" }),
			handleProtocolError: (error) => errors.push(error),
		});
		// Attach the rejection check before delivery so the asynchronous failure is observed.
		const rejected = assert.rejects(guestPromise, /Invalid serialized sandbox ID compressor/);
		// The envelope passes message validation; only the serialized compressor is invalid.
		channel.port1.postMessage({
			type: "hostInitialization",
			baseRevision: "root",
			mainRevision: "root",
			trunkRevision: "root",
			tree: [],
			schema: {},
			commits: [],
			idCompressor: "not a serialized compressor",
		});
		try {
			await rejected;
			assert(errors[0]?.cause instanceof SandboxProtocolError);
		} finally {
			channel.port1.close();
		}
	});

	it("rejects a serialized root compressor in place of a child ID space shard", async () => {
		const channel = new MessageChannel();
		const guestPromise = Guest.create({
			config: stringArrayConfig,
			treeOptions: { jsonValidator: FormatValidatorBasic },
			port: channel.port2,
			logger: createChildLogger({ namespace: "Guest" }),
			handleProtocolError: () => {},
		});
		const rejected = assert.rejects(guestPromise, /Invalid serialized sandbox ID compressor/);
		// A serialized root is well formed, but it has no child allocation to prevent collisions within a shared session.
		channel.port1.postMessage({
			type: "hostInitialization",
			baseRevision: "root",
			mainRevision: "root",
			trunkRevision: "root",
			tree: [],
			schema: {},
			commits: [],
			idCompressor: serializeIdCompressor(createIdCompressor(SerializationVersion.V3), true),
		});
		try {
			await rejected;
		} finally {
			channel.port1.close();
		}
	});

	it("rejects a Host compressor that cannot create a child ID space shard", async () => {
		const { guest, host, provider } = await setup(["initial"]);
		// Reuse the application-owned main view so a failed replacement Host must leave it usable.
		guest.dispose();
		host.dispose();
		const channel = new MessageChannel();
		try {
			assert.throws(
				() =>
					new Host({
						main: host.main,
						port: channel.port1,
						bindingHandle: provider.trees[1].handle,
						idCompressor: createIdCompressor(SerializationVersion.V2),
						logger: createChildLogger({ namespace: "Host" }),
					}),
				/Sharding requires document version 3/,
			);
			host.main.root.push("still usable");
			assert.deepEqual([...host.main.root], ["initial", "still usable"]);
		} finally {
			channel.port2.close();
		}
	});

	it("reclaims an unsent ID space shard when Host initialization cannot be delivered", () => {
		const provider = new TestTreeProviderLite(
			2,
			configuredSharedTree({
				jsonValidator: FormatValidatorBasic,
				minVersionForCollab: FluidClientVersion.v2_80,
			}).getFactory(),
		);
		const main = asAlpha(provider.trees[1].viewWith(stringArrayConfig));
		main.initialize(["initial"]);
		provider.synchronizeMessages();
		const root = toIdCompressorWithCore(provider.getCompressor(provider.trees[1]));
		const channel = new MessageChannel();
		// Fail after the Host has created its child, but before the Guest receives initialization.
		channel.port1.postMessage = () => {
			throw new Error("Transport unavailable");
		};
		try {
			assert.throws(
				() =>
					new Host({
						main,
						port: channel.port1,
						bindingHandle: provider.trees[1].handle,
						idCompressor: root,
						logger: createChildLogger({ namespace: "Host" }),
					}),
				/Transport unavailable/,
			);
			// The root exits sharding mode when the unsent child's ID space is reclaimed.
			assert.equal(root.getShardSyncToken(), undefined);
			main.root.push("still usable");
		} finally {
			channel.port2.close();
			main.dispose();
		}
	});

	// The Host and Guest are intended to support being run in separate JavaScript realms.
	// Verify that protocol messages are serializable and that synchronization does not depend on shared object identity.
	it("uses structured clones for protocol messages", async () => {
		const channel = new MessageChannel();
		const change = { revision: "test revision" };
		const message: GuestChangeMessage = {
			type: "guestChange",
			changeId: brand(0),
			mainRevision: "root",
			trunkRevision: "root",
			change,
			idSpaceShardToken: createTestIdSpaceShardToken(),
		};
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

		assert.deepEqual(receivedMessage, normalizeTransportData(message));
		assert.notEqual(receivedMessage, message);
		if (receivedMessage.type === "guestChange") {
			assert.notEqual(receivedMessage.change, change);
		}
		channel.port1.close();
		channel.port2.close();
	});

	it("preserves marker-shaped tree data during initialization and edits in both directions", async () => {
		const factory = new SchemaFactoryAlpha("sandbox.marker-data");
		/** Allows transport discriminators and prototype-related names as ordinary tree keys. */
		class RecordNode extends factory.record("Record", [factory.string, factory.number]) {}
		/** Holds the lookalike records through initialization and edits. */
		class Records extends factory.array("Records", RecordNode) {}
		const values: Record<string, string | number>[] = [
			{ type: "__sandbox_handle__", token: 0 },
			{ type: "__sandbox_handle__", label: "ordinary user data" },
			{ type: "__sandbox_handle__", token: 0, extra: "data" },
			{ type: "__sandbox_object__", entries: "ordinary user data" },
			{ ["__proto__"]: "data", constructor: "data", prototype: "data" },
		];
		const config = new TreeViewConfiguration({ schema: Records });
		const { host, guest, provider, peer } = await setupCustom(
			values,
			config,
			buildDirectSessionPorts,
		);
		const read = (nodes: Iterable<RecordNode>) =>
			Array.from(nodes, (node) => Object.fromEntries(Object.entries(node)));
		assert.deepEqual(read(guest.view.root), values);
		host.main.root.insertAtEnd(...values);
		await host.updateGuestPromise;
		assert.deepEqual(read(guest.view.root), [...values, ...values]);
		guest.view.root.insertAtEnd(...values);
		await guest.updateHostPromise;
		assert.deepEqual(read(host.main.root), [...values, ...values, ...values]);
		provider.synchronizeMessages();
		assert.deepEqual(read(peer.root), [...values, ...values, ...values]);
	});

	it("passes blob handles from the Host to the Guest", async () => {
		const { host, guest } = await setupCustom([], handleArrayConfig, buildDirectSessionPorts);
		const value = new Uint8Array([1, 2, 3]).buffer;

		host.main.root.push(new MockHandle(value));
		await (host.updateGuestPromise ?? assert.fail("Expected update to be in progress"));

		const resolved = await guest.view.root[0].get();
		assert.deepEqual(resolved, value);
		assert.notEqual(resolved, value);
		assert.equal(value.byteLength, 3);
	});

	it("passes existing handles from the Guest back to the Host and peers", async () => {
		const value = new Uint8Array([4, 5]).buffer;
		const handle = new MockHandle(value);
		const { host, guest, peer, provider } = await setupCustom(
			[],
			handleArrayConfig,
			buildDirectSessionPorts,
		);
		host.main.root.push(handle);
		await host.updateGuestPromise;

		guest.view.root.push(guest.view.root[0]);
		await (guest.updateHostPromise ?? assert.fail("Expected push to be in progress"));

		assert.equal(host.main.root[1], host.main.root[0]);
		assert.deepEqual(await host.main.root[1].get(), value);
		provider.synchronizeMessages();
		assert(compareFluidHandles(peer.root[1], handle));
	});

	it("preserves proxy identity across initialization and updates", async () => {
		const handle = new MockHandle(new ArrayBuffer(2));
		const { host, guest } = await setupCustom(
			[handle, handle],
			handleArrayConfig,
			buildDirectSessionPorts,
		);
		const proxy = guest.view.root[0];
		assert.equal(proxy, guest.view.root[1]);
		assert.notEqual(proxy, host.main.root[0]);
		host.main.root.push(host.main.root[0]);
		await host.updateGuestPromise;
		assert.equal(proxy, guest.view.root[2]);
		assert.deepEqual(await proxy.get(), new ArrayBuffer(2));
	});

	it("clearly rejects resolution of handles to Fluid objects", async () => {
		const { host, guest, provider } = await setupCustom(
			[],
			handleArrayConfig,
			buildDirectSessionPorts,
		);
		host.main.root.push(provider.trees[1].handle);
		await host.updateGuestPromise;
		await assert.rejects(guest.view.root[0].get(), {
			name: "Error",
			message:
				"Cannot resolve this handle in the Guest: only blob handles resolving to an ArrayBuffer are supported. Handles to Fluid objects are not supported.",
		});
		assert.equal(host.error, undefined);
		assert.equal(guest.error, undefined);
	});

	it("propagates Host resolution failures through the port", async () => {
		const { host, guest } = await setupCustom([], handleArrayConfig, buildDirectSessionPorts);
		const handle = Object.assign(new MockHandle(new ArrayBuffer(0)), {
			get: async () => {
				throw new Error("Blob retrieval failed");
			},
		});
		host.main.root.push(handle);
		await host.updateGuestPromise;
		await assert.rejects(guest.view.root[0].get(), {
			name: "Error",
			message: "Blob retrieval failed",
		});
		guest.view.root.push(guest.view.root[0]);
		await guest.updateHostPromise;
		assert.equal(host.main.root.length, 2);
		assert.equal(host.error, undefined);
		assert.equal(guest.error, undefined);
	});

	for (const transaction of [false, true]) {
		it(`fails both endpoints on a foreign Guest handle and allows application-managed replacement (transaction: ${transaction})`, async () => {
			const errors: Error[] = [];
			const failed = makePromiseWithResolvers();
			const releaseBlob = makePromiseWithResolvers();
			const handle = Object.assign(new MockHandle(new ArrayBuffer(1)), {
				get: async () => {
					await releaseBlob.promise;
					return new ArrayBuffer(1);
				},
			});
			const { host, guest, provider, peer } = await setupCustom(
				[handle],
				handleArrayConfig,
				buildDirectSessionPorts,
				false,
				(error) => {
					errors.push(error);
					if (errors.length === 2) {
						failed.resolver();
					}
				},
			);
			const proxy = guest.view.root[0];
			const blobRejected = assert.rejects(proxy.get(), /recreate the Host and Guest/);
			guest.view.root.push(proxy);
			const push = guest.updateHostPromise ?? assert.fail("Expected pending Guest change");
			const pushRejected = assert.rejects(push, /recreate the Host and Guest/);
			const insertForeignHandle = () => {
				guest.view.root.push(new MockHandle(new ArrayBuffer(2)));
			};
			if (transaction) {
				guest.view.runTransaction(insertForeignHandle);
			} else {
				insertForeignHandle();
			}
			await Promise.all([failed.promise, blobRejected, pushRejected]);

			assert.match(guest.error?.message ?? "", /foreign/);
			assert.match(host.error?.message ?? "", /foreign/);
			assert(guest.error?.cause instanceof UsageError);
			assert(host.error?.cause instanceof Error);
			assert.equal(host.error.cause.constructor, Error);
			assert.equal(errors[0], guest.error);
			assert.equal(errors[1], host.error);
			assert.throws(
				(): Promise<void> | undefined => guest.updateHostPromise,
				validateUsageError(/Invalid use/),
			);
			assert.throws(
				(): Promise<void> | undefined => host.updateGuestPromise,
				validateUsageError(/Invalid use/),
			);
			releaseBlob.resolver();
			await releaseBlob.promise;
			guest.dispose();
			host.dispose();
			// The valid edit sent before the failure remains on main; the foreign handle never reaches it.
			assert.equal(host.main.root.length, 2);
			host.main.root.push(handle);
			provider.synchronizeMessages();
			assert.equal(peer.root.length, 3);

			const ports = buildDirectSessionPorts();
			const replacementHost = new Host({
				main: host.main,
				port: ports.hostPort,
				bindingHandle: provider.trees[1].handle,
				idCompressor: provider.getCompressor(provider.trees[1]),
				logger: createChildLogger({ namespace: "Host" }),
			});
			const replacementGuest = await createGuestForHost(handleArrayConfig, ports.guestPort);
			try {
				assert.equal(replacementGuest.view.root.length, 3);
				replacementGuest.view.root.push(replacementGuest.view.root[0]);
				await replacementGuest.updateHostPromise;
				replacementHost.main.root.push(handle);
				await replacementHost.updateGuestPromise;
				assert.equal(replacementGuest.view.root.length, 5);
				assert.equal(replacementHost.main.root.length, 5);
				assert.equal(errors.length, 2);
			} finally {
				replacementGuest.dispose();
				replacementHost.dispose();
				ports.dispose();
			}
		});
	}

	for (const [receiver, message, expected] of [
		[
			"Host",
			{
				type: "guestChange",
				changeId: 0,
				mainRevision: "root",
				trunkRevision: "root",
				change: { type: "__sandbox_handle__", token: 99 },
				idSpaceShardToken: createTestIdSpaceShardToken(),
			},
			/Unknown sandbox handle token/,
		],
		["Host", { type: "blobRequest", requestId: 0, token: 99 }, /Unknown sandbox handle token/],
		["Guest", { type: "blobResponse", blob: new ArrayBuffer(0) }, /Invalid Host and Guest/],
		[
			"Guest",
			{ type: "blobResponse", requestId: 99, blob: new ArrayBuffer(0) },
			/Unexpected sandbox blob response/,
		],
	] as const) {
		it(`fails the ${receiver} and rejects pending work for ${JSON.stringify(message)}`, async () => {
			const reported = makePromiseWithResolvers();
			const handle = new MockHandle(new ArrayBuffer(1));
			const { host, guest, interop, provider, peer } = await setupCustom(
				[handle],
				handleArrayConfig,
				buildIsolatedSessionPorts,
				false,
				() => reported.resolver(),
			);
			let synchronization: Promise<void> | undefined;
			let blobRejected: Promise<void> | undefined;
			if (receiver === "Host") {
				host.main.root.push(handle);
				synchronization = host.updateGuestPromise;
			} else {
				guest.view.root.push(guest.view.root[0]);
				synchronization = guest.updateHostPromise;
				blobRejected = assert.rejects(guest.view.root[0].get(), expected);
			}
			assert(synchronization !== undefined);
			const synchronizationRejected = assert.rejects(synchronization, expected);
			const target = receiver === "Host" ? interop.sendToHost : interop.sendToGuest;
			target.postMessage(message);
			await Promise.all([reported.promise, synchronizationRejected, blobRejected]);
			assert.match((receiver === "Host" ? host.error : guest.error)?.message ?? "", expected);
			assert(
				(receiver === "Host" ? host.error : guest.error)?.cause instanceof
					SandboxProtocolError,
			);
			host.main.root.push(handle);
			provider.synchronizeMessages();
			assert.equal(peer.root.length, host.main.root.length);
		});
	}

	it("fails the session when a resolved blob cannot be serialized", async () => {
		const reported = makePromiseWithResolvers();
		let reports = 0;
		const handle = new MockHandle(Object.assign(new ArrayBuffer(1), { extra: true }));
		const { host, guest } = await setupCustom(
			[handle],
			handleArrayConfig,
			buildDirectSessionPorts,
			false,
			() => {
				if (++reports === 2) {
					reported.resolver();
				}
			},
		);
		await assert.rejects(guest.view.root[0].get(), /buffers cannot have custom properties/);
		await reported.promise;
		assert(host.error !== undefined);
		assert(guest.error !== undefined);
		assert(host.error.cause instanceof SandboxProtocolError);
		assert(guest.error.cause instanceof Error);
		assert.equal(guest.error.cause.constructor, Error);
		host.main.root.push(handle);
		assert.equal(host.main.root.length, 2);
	});

	it("contains send failures in main-tree callbacks even when peer notification also fails", async () => {
		const reported = makePromiseWithResolvers();
		const transportError = new Error("Transport unavailable");
		const { host, guest } = await setupCustom(
			[],
			stringArrayConfig,
			() => {
				const ports = buildDirectSessionPorts();
				const postMessage = ports.hostPort.postMessage.bind(ports.hostPort);
				let initialized = false;
				ports.hostPort.postMessage = (message, transferOrOptions) => {
					if (initialized) {
						throw transportError;
					}
					initialized = true;
					if (Array.isArray(transferOrOptions)) {
						postMessage(message, transferOrOptions);
					} else {
						postMessage(message, transferOrOptions);
					}
				};
				return ports;
			},
			false,
			() => reported.resolver(),
		);
		assert.doesNotThrow(() => host.main.root.push("retained edit"));
		await reported.promise;
		assert.match(host.error?.message ?? "", /Peer notification failed: Transport unavailable/);
		assert.equal(host.error?.cause, transportError);
		assert.equal(guest.error, undefined);
		host.dispose();
		host.main.root.push("still usable");
		assert.deepEqual([...host.main.root], ["retained edit", "still usable"]);
	});

	it("continues synchronizing edits while a blob request is pending", async () => {
		const { host, guest } = await setupCustom([], handleArrayConfig, buildDirectSessionPorts);
		const requested = makePromiseWithResolvers();
		const release = makePromiseWithResolvers();
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
		assert.equal(proxy.get(), first);
		await requested.promise;
		guest.view.root.push(proxy);
		await guest.updateHostPromise;
		assert.equal(host.main.root.length, 2);
		host.main.root.push(handle);
		await host.updateGuestPromise;
		assert.equal(guest.view.root.length, 3);
		release.resolver();
		assert.deepEqual(await first, blob);
		assert.equal(requests, 1);
	});

	it("retains a handle for Guest deletion, undo, and redo", async () => {
		const { host, guest } = await setupCustom([], handleArrayConfig, buildDirectSessionPorts);
		const blob = new Uint8Array([8]).buffer;
		const handle = new MockHandle(blob);
		host.main.root.push(handle);
		await host.updateGuestPromise;
		const proxy = guest.view.root[0];
		const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(guest.view.events);
		try {
			guest.view.root.removeAt(0);
			await guest.updateHostPromise;
			assert.equal(host.main.root.length, 0);
			assert.deepEqual(await proxy.get(), blob);
			undoStack.pop()?.revert();
			await guest.updateHostPromise;
			assert.equal(guest.view.root[0], proxy);
			assert.equal(host.main.root[0], handle);
			redoStack.pop()?.revert();
			await guest.updateHostPromise;
			assert.equal(host.main.root.length, 0);
		} finally {
			unsubscribe();
		}
	});

	it("notifies the peer that an unauthorized blob token terminates the session", async () => {
		const { interop, host } = await setupCustom(
			[],
			handleArrayConfig,
			buildIsolatedSessionPorts,
			false,
			() => {},
		);
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
		assert.deepEqual(
			await received,
			normalizeTransportData({
				type: "sessionFailure",
				error: "Unknown sandbox handle token.",
			}),
		);
		assert(host.error !== undefined);
	});

	for (const receiver of ["Host", "Guest"] as const) {
		it(`rejects blob messages sent in the wrong direction to the ${receiver}`, async () => {
			let reportError: (error: Error) => void = () => assert.fail("Missing error resolver");
			const error = new Promise<Error>((resolve) => {
				reportError = resolve;
			});
			const { interop } = await setupCustom(
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
			assert(reported.cause instanceof SandboxProtocolError);
			assert.match(reported.cause.message, /received a message with type "blob/);
		});
	}

	for (const receiver of ["Host", "Guest"] as const) {
		it(`classifies an unsolicited acknowledgment to the ${receiver} as a protocol error`, async () => {
			const reported = makePromiseWithResolvers();
			const { host, guest, interop, provider, peer } = await setupCustom(
				[],
				stringArrayConfig,
				buildIsolatedSessionPorts,
				false,
				() => reported.resolver(),
			);
			const port = receiver === "Host" ? interop.sendToHost : interop.sendToGuest;
			port.postMessage(
				receiver === "Host"
					? { type: "hostUpdateAck", updateId: 99 }
					: { type: "guestChangeAck", changeId: 99 },
			);
			await reported.promise;
			const error = receiver === "Host" ? host.error : guest.error;
			assert(error?.cause instanceof SandboxProtocolError);
			assert.match(error.cause.message, /Unexpected .* acknowledgment/);
			host.main.root.push("still usable");
			provider.synchronizeMessages();
			assert.deepEqual([...peer.root], ["still usable"]);
		});

		it(`rejects out-of-order changes sent to the ${receiver}`, async () => {
			const reported = makePromiseWithResolvers();
			const { host, guest, interop } = await setupCustom(
				[],
				stringArrayConfig,
				buildIsolatedSessionPorts,
				false,
				() => reported.resolver(),
			);
			const { mainRevision, trunkRevision } = host.guestInitialization;
			if (receiver === "Host") {
				interop.sendToHost.postMessage({
					type: "guestChange",
					changeId: 1,
					mainRevision,
					trunkRevision,
					change: {},
					idSpaceShardToken: createTestIdSpaceShardToken(),
				});
			} else {
				interop.sendToGuest.postMessage({
					type: "hostUpdate",
					updateId: 1,
					baseRevision: mainRevision,
					mainRevision,
					trunkRevision,
					commits: [],
				});
			}
			await reported.promise;
			const error = receiver === "Host" ? host.error : guest.error;
			assert(error?.cause instanceof SandboxProtocolError);
			assert.match(error.cause.message, /identifier order/);
		});

		it(`classifies message deserialization failure on the ${receiver} as a protocol error`, async () => {
			const reported = makePromiseWithResolvers();
			const ports = buildDirectSessionPorts();
			const { host, guest } = await setupCustom(
				[],
				stringArrayConfig,
				() => ports,
				false,
				() => reported.resolver(),
			);
			const port = receiver === "Host" ? ports.hostPort : ports.guestPort;
			port.dispatchEvent(new MessageEvent("messageerror"));
			await reported.promise;
			const error = receiver === "Host" ? host.error : guest.error;
			assert(error?.cause instanceof SandboxProtocolError);
			assert.match(error.cause.message, /could not deserialize/);
		});
	}

	it("routes invalid messages to the protocol-error handler", async () => {
		let reportProtocolError: ((error: Error) => void) | undefined;
		const protocolError = new Promise<Error>((resolve) => {
			reportProtocolError = resolve;
		});
		assert(reportProtocolError !== undefined, "Protocol error reporter should be assigned");
		const { interop } = await setupCustom(
			[],
			stringArrayConfig,
			buildIsolatedSessionPorts,
			false,
			reportProtocolError,
		);

		interop.sendToHost.postMessage({ type: "unknown" });

		const error = await protocolError;
		assert.match(error.message, /Invalid Host and Guest protocol message/);
		assert(error.cause instanceof SandboxProtocolError);
	});

	for (const reason of ["a foreign ID space shard", "an old progress count"] as const) {
		it(`rejects ${reason} before applying a Guest change`, async () => {
			const reported = makePromiseWithResolvers();
			const { host, guest, provider, interop } = await setupCustom(
				[],
				stringArrayConfig,
				buildIsolatedSessionPorts,
				false,
				() => reported.resolver(),
			);
			const root = provider.getCompressor(provider.trees[1]);
			const idSpaceShard = toIdCompressorWithCore(
				getCheckoutIdCompressor(getCheckout(guest.view)),
			);
			const token =
				idSpaceShard.getShardSyncToken() ?? assert.fail("Expected Guest ID space shard token");
			const sibling =
				reason === "a foreign ID space shard"
					? (() => {
							const [serializedIdSpaceShard] = toIdCompressorWithCore(root).shard(1);
							assert(
								serializedIdSpaceShard !== undefined,
								"Expected a second active ID space shard",
							);
							return deserializeIdCompressor(serializedIdSpaceShard, SerializationVersion.V3);
						})()
					: undefined;
			// The stale case uses a count below the Guest's initial ID space shard progress.
			const idSpaceShardToken =
				reason === "a foreign ID space shard"
					? (sibling?.getShardSyncToken() ??
						assert.fail("Expected a sibling ID space shard token"))
					: { ...token, localGenCount: 0 };
			const before = serializeIdCompressor(root, true);
			// Even another ID space shard registered with the same root cannot act as this Guest.
			interop.sendToHost.postMessage({
				type: "guestChange",
				changeId: 0,
				mainRevision: host.guestInitialization.mainRevision,
				trunkRevision: host.guestInitialization.trunkRevision,
				change: {},
				idSpaceShardToken,
			});
			await reported.promise;
			assert(host.error?.cause instanceof SandboxProtocolError, String(host.error?.cause));
			assert.match(host.error.cause.message, /Guest ID space shard/);
			assert.deepEqual([...host.main.root], []);
			// Neither a foreign token nor a stale count may mutate the Host's compressor.
			assert.equal(serializeIdCompressor(root, true), before);
			assert.equal(guest.error, undefined);
			if (sibling !== undefined) {
				toIdCompressorWithCore(root).synchronizeWithShard(
					sibling.disposeShard() ??
						assert.fail("Expected sibling ID space shard disposal token"),
				);
			}
		});
	}

	it("rejects an earlier ID space shard token after acknowledging a Guest change", async () => {
		const reported = makePromiseWithResolvers();
		const ports = buildDirectSessionPorts();
		const { host, guest, provider } = await setupCustom(
			[],
			stringArrayConfig,
			() => ports,
			false,
			() => reported.resolver(),
		);
		let firstChange: GuestChangeMessage | undefined;
		// Capture the genuine token sent with the first edit so the second message can replay it.
		ports.hostPort.addEventListener("message", (event: MessageEvent<unknown>) => {
			const message = parseHostGuestMessage(normalizeTransportData(event.data));
			if (message.type === "guestChange") {
				firstChange ??= message;
			}
		});
		guest.view.root.push("first");
		await guest.updateHostPromise;
		await host.updateGuestPromise;
		const token = firstChange?.idSpaceShardToken ?? assert.fail("Expected a Guest change");
		const root = provider.getCompressor(provider.trees[1]);
		const before = serializeIdCompressor(root, true);

		// Use the next change ID and current Host revisions so stale progress is rejected before decoding the dummy change.
		ports.guestPort.postMessage({
			type: "guestChange",
			changeId: 1,
			mainRevision: getBranch(host.main).getHead().revision,
			trunkRevision: host.guestInitialization.trunkRevision,
			change: {},
			idSpaceShardToken: token,
		});
		await reported.promise;
		assert(host.error?.cause instanceof SandboxProtocolError);
		assert.match(host.error.cause.message, /Guest ID space shard progress did not advance/);
		assert.deepEqual([...host.main.root], ["first"]);
		assert.equal(serializeIdCompressor(root, true), before);
	});

	it("does not acknowledge a Guest change with an unknown base", async () => {
		let reportProtocolError: ((error: Error) => void) | undefined;
		const protocolError = new Promise<Error>((resolve) => {
			reportProtocolError = resolve;
		});
		assert(reportProtocolError !== undefined, "Protocol error reporter should be assigned");
		const { host, guest, interop } = await setupCustom(
			[],
			stringArrayConfig,
			buildIsolatedSessionPorts,
			false,
			reportProtocolError,
		);
		let acknowledgmentReceived = false;
		interop.sendToHost.addEventListener("message", (event: MessageEvent<unknown>) => {
			const message = parseHostGuestMessage(normalizeTransportData(event.data));
			acknowledgmentReceived ||= message.type === "guestChangeAck";
		});
		interop.sendToHost.start();

		const compressor = getCheckoutIdCompressor(getCheckout(guest.view));
		const idSpaceShardToken = toIdCompressorWithCore(compressor).getShardSyncToken();
		assert(idSpaceShardToken !== undefined, "Expected Guest ID space shard token");
		// Supply a valid token so the Host reports the unknown branch base, not an invalid envelope.
		interop.sendToHost.postMessage(
			host.codec.encode({
				type: "guestChange",
				changeId: 0,
				mainRevision: mintRevisionTag(),
				trunkRevision: mintRevisionTag(),
				change: { handle: new MockHandle(new ArrayBuffer(0)) },
				idSpaceShardToken,
			}),
		);
		await protocolError;
		await new Promise((resolve) => setTimeout(resolve, 0));

		assert.equal(acknowledgmentReceived, false);
		assert.equal(host.main.root.length, 0);
	});

	it("applies consecutive Guest changes to their authoring state despite concurrent insertions", async () => {
		const { peer, host, guest, provider } = await setup(["a", "b"]);
		guest.view.root.push("g1");
		guest.view.root.removeAt(0);
		peer.root.insertAtStart("p");
		provider.synchronizeMessages();

		await guest.updateHostPromise;
		await host.updateGuestPromise;
		provider.synchronizeMessages();
		await host.updateGuestPromise;

		const expected = ["p", "b", "g1"];
		for (const view of [host.main, host.local, guest.view, peer]) {
			assert.deepEqual([...view.root], expected);
		}
		assert.equal(host.error, undefined);
		assert.equal(guest.error, undefined);
	});

	it("preserves nested Guest commit metadata through Host synchronization", async () => {
		const { host, guest, peer, provider } = await setup([]);
		guest.view.runTransaction(
			() => {
				guest.view.runTransaction(() => guest.view.root.push("a"), {
					customMetadata: { tag: "inner" },
				});
			},
			{ customMetadata: { tag: "outer" } },
		);
		const expected = normalizeTransportData({
			metadata: { tag: "outer" },
			children: [{ metadata: { tag: "inner" }, children: [] }],
		});
		await guest.updateHostPromise;
		await host.updateGuestPromise;

		for (const view of [host.main, host.local, guest.view]) {
			assert.deepEqual(
				normalizeTransportData(view.branchHistory.getHead()?.customTree),
				expected,
			);
		}

		provider.synchronizeMessages();
		await host.updateGuestPromise;
		assert.deepEqual([...peer.root], ["a"]);
		for (const [name, view] of [
			["Host main", host.main],
			["Host local", host.local],
			["Guest", guest.view],
		] as const) {
			assert.deepEqual([...view.root], ["a"]);
			assert.deepEqual(
				normalizeTransportData(view.branchHistory.getHead()?.customTree),
				expected,
				name,
			);
		}
	});

	it("preserves nested Host commit metadata in Guest updates", async () => {
		const { host, guest } = await setup([]);
		host.main.runTransaction(
			() => {
				host.main.runTransaction(() => host.main.root.push("a"), {
					customMetadata: { tag: "inner" },
				});
			},
			{ customMetadata: { tag: "outer" } },
		);
		await host.updateGuestPromise;

		const customTree = guest.view.branchHistory.getHead()?.customTree;
		assert(customTree !== undefined, "Expected custom metadata on the Guest commit");
		assert.deepEqual(customTree.metadata, normalizeTransportData({ tag: "outer" }));
		assert.equal(customTree.children.length, 1);
		assert.deepEqual(
			customTree.children[0]?.metadata,
			normalizeTransportData({ tag: "inner" }),
		);
		assert.deepEqual(customTree.children[0]?.children, []);
	});

	it("preserves Host commit metadata during Guest initialization", async () => {
		const { host, guest, provider } = await setup([]);
		guest.dispose();
		host.dispose();
		host.main.runTransaction(() => host.main.root.push("a"), {
			customMetadata: { tag: "initialization" },
		});

		const ports = buildDirectSessionPorts();
		const initialization = new Promise<unknown>((resolve) => {
			ports.guestPort.addEventListener(
				"message",
				(event: MessageEvent<unknown>) => resolve(event.data),
				{ once: true },
			);
			ports.guestPort.start();
		});
		const replacementHost = new Host({
			main: host.main,
			port: ports.hostPort,
			bindingHandle: provider.trees[1].handle,
			idCompressor: provider.getCompressor(provider.trees[1]),
			logger: createChildLogger({ namespace: "Host" }),
		});
		const replacementGuest = await createGuestForHost(stringArrayConfig, ports.guestPort);
		try {
			const wireMessage = parseHostGuestMessage(normalizeTransportData(await initialization));
			assert(wireMessage.type === "hostInitialization", "Expected Host initialization");
			// The port carries serialized child state, not the live root compressor supplied to the Host.
			assert.equal(typeof wireMessage.idCompressor, "string");
			assert.equal(wireMessage.commits.length, 1);
			// The replacement Guest must use its own child instance while the Host retains the runtime root.
			const replacementCompressor = getCheckoutIdCompressor(
				getCheckout(replacementGuest.view),
			);
			assert.notEqual(replacementCompressor, provider.getCompressor(provider.trees[1]));
			assert.deepEqual(replacementGuest.view.branchHistory.getHead()?.custom, {
				tag: "initialization",
			});
		} finally {
			replacementGuest.dispose();
			replacementHost.dispose();
			ports.dispose();
		}
	});

	it("synchronizes an independent Host using its base as the finalized boundary", async () => {
		const checkout = checkoutWithContent(
			{
				schema: toInitialSchema(stringArrayConfig.schema),
				initialTree: fieldCursorFromInsertable(stringArrayConfig.schema, ["a"]),
			},
			{ codecOptions: { minVersionForCollab: FluidClientVersion.v2_80 } },
		);
		const main = viewCheckout(checkout, stringArrayConfig);
		const base = getFinalizedCommit(main);
		main.root.push("before");

		const ports = buildDirectSessionPorts();
		const independentHost = new Host({
			main,
			port: ports.hostPort,
			bindingHandle: new TestTreeProviderLite(1).trees[0].handle,
			idCompressor: testIdCompressor,
			logger: createChildLogger({ namespace: "Host" }),
		});
		try {
			assert.equal(independentHost.guestInitialization.baseRevision, base.revision);
			assert.equal(independentHost.guestInitialization.trunkRevision, base.revision);
			assert.notEqual(independentHost.guestInitialization.mainRevision, base.revision);
			const independentGuest = await createGuestForHost(stringArrayConfig, ports.guestPort);
			try {
				assert.deepEqual([...independentGuest.view.root], ["a", "before"]);
				main.root.push("host");
				await independentHost.updateGuestPromise;
				independentGuest.view.root.push("guest");
				await independentGuest.updateHostPromise;
				await independentHost.updateGuestPromise;

				assert.deepEqual([...main.root], ["a", "before", "host", "guest"]);
				assert.deepEqual([...independentGuest.view.root], [...main.root]);
				assert.equal(getFinalizedCommit(main), base);
				assert.equal(independentHost.error, undefined);
				assert.equal(independentGuest.error, undefined);
			} finally {
				independentGuest.dispose();
			}
		} finally {
			independentHost.dispose();
			ports.dispose();
			main.dispose();
		}
	});

	it("initializes the Guest with the current sequenced trunk revision", async () => {
		const { host, guest } = await setup(["a"]);
		guest.dispose();
		host.dispose();
		const synchronization = new HostSynchronization(
			host.main,
			() => {},
			() => {},
			(action) => action(),
			(error) => assert.fail(String(error)),
			createChildLogger({ namespace: "Host" }),
			() => assert.fail("No Guest changes expected"),
		);
		try {
			assert.equal(
				synchronization.guestInitialization.trunkRevision,
				synchronization.guestInitialization.mainRevision,
			);
			assert.equal(
				synchronization.guestInitialization.trunkRevision,
				synchronization.guestInitialization.baseRevision,
			);
		} finally {
			synchronization.dispose();
		}
	});

	it("advances the Guest trunk revision for remote peer commits", async () => {
		const { peer, host, guest, provider } = await setup(["a"]);
		guest.dispose();
		host.dispose();
		const sent: HostUpdateMessage[] = [];
		const synchronization = new HostSynchronization(
			host.main,
			(message) => {
				if (message.type === "hostUpdate") {
					sent.push(message);
				}
			},
			() => {},
			(action) => action(),
			(error) => assert.fail(String(error)),
			createChildLogger({ namespace: "Host" }),
			() => assert.fail("No Guest changes expected"),
		);
		try {
			const initialTrunkRevision = synchronization.guestInitialization.trunkRevision;
			peer.root.push("peer");
			provider.synchronizeMessages();

			assert.equal(sent.length, 1);
			const update = sent[0] ?? assert.fail("Expected an update for the remote commit");
			assert.notEqual(update.trunkRevision, initialTrunkRevision);
			assert.equal(update.trunkRevision, update.mainRevision);
		} finally {
			synchronization.dispose();
		}
	});

	it("accepts an empty update at an aliased initialization revision", async () => {
		const { host } = await setup(["a"]);
		const revision = mintRevisionTag();
		const sent: HostGuestMessage[] = [];
		const synchronization = new GuestSynchronization(
			host.main.fork(),
			{
				baseRevision: revision,
				mainRevision: revision,
				trunkRevision: revision,
				commits: [],
			},
			toIdCompressorWithCore(testIdCompressor),
			(message) => sent.push(message),
			(action) => action(),
			(error) => assert.fail(String(error)),
			createChildLogger({ namespace: "Guest" }),
		);
		try {
			synchronization.receiveHostUpdate({
				type: "hostUpdate",
				updateId: brand(0),
				baseRevision: revision,
				mainRevision: revision,
				trunkRevision: revision,
				commits: [],
			});
			assert.deepEqual(sent, [{ type: "hostUpdateAck", updateId: 0 }]);
			assert.deepEqual([...synchronization.view.root], ["a"]);
		} finally {
			synchronization.stop(new Error("Test complete"));
			synchronization.view.dispose();
			synchronization.dispose();
		}
	});

	for (const [trimHistory, concurrentPeerEdit] of [
		[false, false],
		[false, true],
		[true, false],
		[true, true],
	]) {
		it(`initializes with pending Host edits (trimmed history: ${trimHistory}, concurrent peer: ${concurrentPeerEdit})`, async () => {
			const { peer, host, guest, provider } = await setup(["a", "b"]);
			guest.dispose();
			host.dispose();
			if (trimHistory) {
				for (let i = 0; i < 5; i++) {
					peer.root.push("temporary");
					provider.synchronizeMessages();
					host.main.root.removeAt(2);
					provider.synchronizeMessages();
				}
			}
			if (concurrentPeerEdit) {
				peer.root.insertAtStart("p");
			}
			host.main.root.push("first");
			host.main.root.push("second");
			host.main.root.removeAt(0);

			const ports = buildDirectSessionPorts();
			const replacementHost = new Host({
				main: host.main,
				port: ports.hostPort,
				bindingHandle: provider.trees[1].handle,
				idCompressor: provider.getCompressor(provider.trees[1]),
				logger: createChildLogger({ namespace: "Host" }),
			});
			if (trimHistory) {
				assert.notEqual(replacementHost.guestInitialization.baseRevision, "root");
			}
			const replacementGuest = await createGuestForHost(stringArrayConfig, ports.guestPort);
			try {
				assert.deepEqual([...replacementGuest.view.root], ["b", "first", "second"]);
				replacementGuest.view.root.push("guest");
				const push = replacementGuest.updateHostPromise;
				provider.synchronizeMessages();
				await push;
				await replacementHost.updateGuestPromise;
				provider.synchronizeMessages();
				await replacementHost.updateGuestPromise;

				const expected = [
					...(concurrentPeerEdit ? ["p"] : []),
					"b",
					"first",
					"second",
					"guest",
				];
				for (const view of [
					replacementHost.main,
					replacementHost.local,
					replacementGuest.view,
					peer,
				]) {
					assert.deepEqual([...view.root], expected);
				}
				assert.equal(replacementHost.error, undefined);
				assert.equal(replacementGuest.error, undefined);
			} finally {
				replacementGuest.dispose();
				replacementHost.dispose();
				ports.dispose();
			}
		});
	}

	it("attempts by the Host and Guest to concurrently notify one-another of concurrent edits do not lead to inconsistencies or dropped edits", async () => {
		const { peer, host, guest, provider } = await setup([]);

		// Make edits in the Guest
		guest.view.root.push("B(g)");
		guest.view.root.push("C(g)");
		// The Guest edits are synchronously reflected in the Guest
		assert.deepEqual([...guest.view.root], ["B(g)", "C(g)"]);
		// The Guest edits are not reflected in the Host yet
		assert.deepEqual([...host.local.root], []);
		assert.deepEqual([...host.main.root], []);

		// The Guest should have started the process of pushing the edit to the Host
		const pushPromise =
			guest.updateHostPromise ?? assert.fail("Expected push to be in progress");

		// Before the Host has a chance to process the edits from the Guest, the peer makes an edit
		peer.root.push("B(p)");
		assert.deepEqual([...peer.root], ["B(p)"]);
		provider.synchronizeMessages();
		// The Host forwards the peer edit without waiting for the Guest edits.
		assert.deepEqual([...host.main.root], ["B(p)"]);
		assert.deepEqual([...host.local.root], []);

		// The Host should have started the process of updating the Guest with the peer change
		const updatePromise =
			host.updateGuestPromise ?? assert.fail("Expected update to be in progress");

		// Wait for the Guest edits to be pushed to the Host
		await pushPromise;

		// The Guest edits are now reflected in the Host
		// The concurrent Host update acknowledgment may also have advanced this branch already.
		assert.deepEqual([...host.local.root].slice(0, 2), ["B(g)", "C(g)"]);
		assert.deepEqual([...host.main.root], ["B(g)", "C(g)", "B(p)"]);
		// The Guest edits are not reflected in the peer yet
		assert.deepEqual([...peer.root], ["B(p)"]);

		provider.synchronizeMessages();

		// The Guest edits are now reflected in the peer
		assert.deepEqual([...peer.root], ["B(g)", "C(g)", "B(p)"]);

		// Wait for the update to be applied to the Guest
		await updatePromise;

		// The peer edit is now reflected in the local and Guest
		assert.deepEqual([...host.local.root], ["B(g)", "C(g)", "B(p)"]);
		assert.deepEqual([...guest.view.root], ["B(g)", "C(g)", "B(p)"]);
	});

	it("Host edits sequenced before peer edits", async () => {
		const { peer, host, guest, provider } = await setup([]);

		// Make an edit on the Host
		host.main.root.push("H");
		assert.deepEqual([...host.main.root], ["H"]);

		// The Guest edits are not reflected in the Guest or peer yet
		assert.deepEqual([...host.local.root], []);
		assert.deepEqual([...guest.view.root], []);
		assert.deepEqual([...peer.root], []);

		// The Host should have started the process of updating the Guest with the peer change
		const updatePromise =
			host.updateGuestPromise ?? assert.fail("Expected update to be in progress");

		// Before the Guest has a chance to process the edits from the Host, the peer makes an edit
		peer.root.push("P");
		assert.deepEqual([...peer.root], ["P"]);

		provider.synchronizeMessages();
		// The peer and Host edits are sequenced
		assert.deepEqual([...host.main.root], ["P", "H"]);
		assert.deepEqual([...peer.root], ["P", "H"]);

		// Wait for the update to be applied to the Guest
		await updatePromise;

		// The peer edit is now reflected in the local and Guest
		assert.deepEqual([...host.local.root], ["P", "H"]);
		assert.deepEqual([...guest.view.root], ["P", "H"]);
	});

	it("peer edits sequenced before Host edits", async () => {
		const { peer, host, guest, provider } = await setup([]);

		// Make an edit on the peer
		peer.root.push("P");
		assert.deepEqual([...peer.root], ["P"]);

		// Make an edit on the Host
		host.main.root.push("H");
		assert.deepEqual([...host.main.root], ["H"]);

		// The Host should have started the process of updating the Guest with the peer change
		const updatePromise =
			host.updateGuestPromise ?? assert.fail("Expected update to be in progress");

		provider.synchronizeMessages();

		// The peer and Host edits are sequenced
		assert.deepEqual([...host.main.root], ["H", "P"]);
		assert.deepEqual([...peer.root], ["H", "P"]);

		// Wait for the update to be applied to the Guest
		await updatePromise;

		// The peer edit is now reflected in the local and Guest
		assert.deepEqual([...host.local.root], ["H", "P"]);
		assert.deepEqual([...guest.view.root], ["H", "P"]);
	});

	it("Guest edits can be reverted", async () => {
		const { host, guest } = await setup([]);
		const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(guest.view.events);

		// Make undoable edits in the Guest
		guest.view.root.push("Ga");
		guest.view.root.push("Gb");
		guest.view.root.push("Gc");
		assert.deepEqual([...guest.view.root], ["Ga", "Gb", "Gc"]);
		assert.deepEqual(undoStack.length, 3, "Expected undo stack to have 3 entries");

		// The Guest should have started the process of pushing the edit to the Host
		let pushPromise =
			guest.updateHostPromise ?? assert.fail("Expected push to be in progress");
		await pushPromise;

		assert.deepEqual([...guest.view.root], ["Ga", "Gb", "Gc"]);
		assert.deepEqual([...host.local.root], ["Ga", "Gb", "Gc"]);
		assert.deepEqual([...host.main.root], ["Ga", "Gb", "Gc"]);

		// Make an edit on the Host
		host.main.root.insertAtStart("H");
		assert.deepEqual([...host.main.root], ["H", "Ga", "Gb", "Gc"]);

		// Wait for the update to be applied to the Guest
		const updatePromise =
			host.updateGuestPromise ?? assert.fail("Expected update to be in progress");
		await updatePromise;

		assert.deepEqual([...host.local.root], ["H", "Ga", "Gb", "Gc"]);
		assert.deepEqual([...guest.view.root], ["H", "Ga", "Gb", "Gc"]);

		assert.deepEqual(
			undoStack.length,
			3,
			"Expected Host change not to add a Guest-local undo entry",
		);

		// Undo the Guest edits
		undoStack.pop()?.revert();
		undoStack.pop()?.revert();
		undoStack.pop()?.revert();

		// The Guest should have started the process of pushing the edits to the Host
		pushPromise = guest.updateHostPromise ?? assert.fail("Expected push to be in progress");
		await pushPromise;

		assert.deepEqual([...guest.view.root], ["H"]);
		assert.deepEqual([...host.local.root], ["H"]);
		assert.deepEqual([...host.main.root], ["H"]);
		assert(redoStack.length === 3, "Expected redo stack to have 3 entries");

		// Undo the Guest edits
		redoStack.pop()?.revert();
		redoStack.pop()?.revert();
		redoStack.pop()?.revert();

		// The Guest should have started the process of pushing the edits to the Host
		pushPromise = guest.updateHostPromise ?? assert.fail("Expected push to be in progress");
		await pushPromise;

		assert.deepEqual([...host.local.root], ["H", "Ga", "Gb", "Gc"]);
		assert.deepEqual([...guest.view.root], ["H", "Ga", "Gb", "Gc"]);
		unsubscribe();
	});

	createFuzzDescribe({ defaultTestCount: 50 })(
		"Synchronization schedules",
		function ({ testCount, stressMode }) {
			this.timeout(10_000);
			/**
			 * The number of {@link Step | steps} in each scenario.
			 */
			const maxSteps = stressMode === StressMode.Short ? 20 : 100;
			/**
			 * A potential action that could be taken at each step of a run.
			 */
			enum Step {
				/** Make an edit on the Host */
				HostEdit = "He",
				/** Make an edit on the Guest */
				GuestEdit = "Ge",
				/** Remove the first element on the Guest. */
				GuestDelete = "Gd",
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
						const message =
							relay.hostToGuest.shift() ?? assert.fail("No Guest-bound messages");
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
						const message = relay.guestToHost.shift() ?? assert.fail("No Host-bound messages");
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

				relayPortConnectedToHost.addEventListener(
					"message",
					(event: MessageEvent<unknown>) => {
						try {
							relay.hostToGuest.push(
								parseHostGuestMessage(normalizeTransportData(event.data)),
							);
						} finally {
							messagesMovingToRelay -= 1;
							resolveIfSettled();
						}
					},
				);
				relayPortConnectedToGuest.addEventListener(
					"message",
					(event: MessageEvent<unknown>) => {
						try {
							relay.guestToHost.push(
								parseHostGuestMessage(normalizeTransportData(event.data)),
							);
						} finally {
							messagesMovingToRelay -= 1;
							resolveIfSettled();
						}
					},
				);
				relayPortConnectedToHost.start();
				relayPortConnectedToGuest.start();

				return {
					hostPort: trackedHostPort as unknown as MessagePort,
					guestPort: trackedGuestPort as unknown as MessagePort,
					interop: relay,
					deliverInitialization: async () => {
						await relay.waitForMessages();
						assert.equal(relay.hostToGuest[0]?.type, "hostInitialization");
						relay.dispatchToGuest();
						await relay.waitForMessages();
					},
					dispose: () => {
						relayPortConnectedToHost.close();
						relayPortConnectedToGuest.close();
					},
				};
			}

			for (const seed of generateTestSeeds(testCount, stressMode)) {
				it(`seed ${seed}`, async () => {
					const random = makeRandom(seed);
					const { teardown, peer, host, guest, provider, interop, logger } = await setupCustom(
						["a", "b"],
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
					try {
						while (actual.length < maxSteps) {
							const potentialNext: Step[] = [Step.GuestEdit, Step.HostEdit, Step.PeerEdit];
							if (guest.view.root.length > 0) {
								potentialNext.push(Step.GuestDelete);
							}
							if (hasSome(serviceQueue)) {
								potentialNext.push(serviceQueue[0]);
							}
							if (hasSome(interop.hostToGuest)) {
								potentialNext.push(
									interop.hostToGuest[0].type === "guestChangeAck"
										? Step.HostToGuestAck
										: Step.HostToGuestEdit,
								);
							}
							if (hasSome(interop.guestToHost)) {
								potentialNext.push(
									interop.guestToHost[0].type === "hostUpdateAck"
										? Step.GuestToHostAck
										: Step.GuestToHostEdit,
								);
							}
							const step = random.pick(potentialNext);
							logger(`--> [${actual.join(", ")}] + ${step}`);
							actual.push(step);
							switch (step) {
								case Step.GuestEdit: {
									guestEditCounter += 1;
									guest.view.root.push(`G${guestEditCounter}`);
									break;
								}
								case Step.HostEdit: {
									hostEditCounter += 1;
									host.main.root.insertAtStart(`H${hostEditCounter}`);
									break;
								}
								case Step.PeerEdit: {
									peerEditCounter += 1;
									peer.root.insertAtStart(`P${peerEditCounter}`);
									break;
								}
								case Step.GuestDelete: {
									guest.view.root.removeAt(0);
									break;
								}
								case Step.SequenceEdit:
								case Step.SequenceAck: {
									const expected = serviceQueue.shift();
									assert.equal(expected, step, actual.join(", "));
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
							if (interop.hostToGuest.length === 0 && interop.guestToHost.length === 0) {
								assert.deepEqual([...host.main.root], [...guest.view.root], actual.join(", "));
								assert.deepEqual(
									[...host.local.root],
									[...guest.view.root],
									actual.join(", "),
								);
							}

							if (host.updateGuestPromise === undefined) {
								assert.equal(
									host.local.isMissingEditsFrom(host.main),
									false,
									actual.join(", "),
								);
							}
						}
						// Complete every schedule so that undelivered changes cannot hide divergence.
						let remainingRounds = maxSteps * 8;
						do {
							assert(
								remainingRounds-- > 0,
								`Synchronization did not finish: ${actual.join(", ")}`,
							);
							provider.synchronizeMessages();
							await interop.waitForMessages();
							if (hasSome(interop.guestToHost)) {
								interop.dispatchToHost();
							}
							if (hasSome(interop.hostToGuest)) {
								interop.dispatchToGuest();
							}
							await interop.waitForMessages();
						} while (
							provider.peekNextMessage() !== undefined ||
							hasSome(interop.hostToGuest) ||
							hasSome(interop.guestToHost)
						);
						for (const view of [host.local, guest.view, peer]) {
							assert.deepEqual([...view.root], [...host.main.root], actual.join(", "));
						}
						assert.equal(host.updateGuestPromise, undefined);
						assert.equal(guest.updateHostPromise, undefined);
						assert.equal(host.error, undefined);
						assert.equal(guest.error, undefined);
					} finally {
						offPeerChange();
						offHostChange();
						teardown();
					}
				});
			}
		},
	);
});
