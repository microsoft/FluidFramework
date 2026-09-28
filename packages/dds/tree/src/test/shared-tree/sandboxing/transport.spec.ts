/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { fluidHandleSymbol } from "@fluidframework/core-interfaces";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import {
	compareFluidHandles,
	isFluidHandle,
	toFluidHandleInternal,
} from "@fluidframework/runtime-utils/internal";
import { MockHandle, validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { brand, type isAssignableTo, type requireFalse } from "../../../util/index.js";

import {
	type BlobRequestId,
	type BlobRequestMessage,
	type HandleToken,
	isHandleToken,
	isLocalHandle,
	isSerializedHandle,
	parseHostGuestMessage,
	SandboxProtocolError,
	validateTreePayloadVocabulary,
} from "./common.js";
import {
	GuestTransportCodec,
	HostTransportCodec,
	normalizeTransportData,
} from "./transport.js";

/**
 * Compile-time checks that protocol ID brands are distinct and reject unbranded numbers.
 */
type _DistinctIds =
	| requireFalse<isAssignableTo<HandleToken, BlobRequestId>>
	| requireFalse<isAssignableTo<BlobRequestId, HandleToken>>
	| requireFalse<isAssignableTo<number, HandleToken>>
	| requireFalse<isAssignableTo<number, BlobRequestId>>;

describe("Sandbox transport codecs", () => {
	function assertNullPrototypeRecords(value: unknown): void {
		if (typeof value !== "object" || value === null || isLocalHandle(value)) {
			return;
		}
		if (value instanceof ArrayBuffer) {
			assert.equal(Object.getPrototypeOf(value), ArrayBuffer.prototype);
			return;
		}
		if (Array.isArray(value)) {
			assert.equal(Object.getPrototypeOf(value), Array.prototype);
		} else {
			assert.equal(Object.getPrototypeOf(value), null);
		}
		for (const child of Object.values(value)) {
			assertNullPrototypeRecords(child);
		}
	}

	function setupTransportCodecs() {
		const bound: IFluidHandleInternal[] = [];
		const host = new HostTransportCodec(
			Object.assign(new MockHandle(undefined), {
				bind: (handle: IFluidHandleInternal) => bound.push(handle),
			}),
		);
		const requests: BlobRequestMessage[] = [];
		const guest = new GuestTransportCodec((message) => requests.push(message));
		return { host, guest, bound, requests };
	}

	it("replaces nested handles without mutating input and binds restored handles", () => {
		const { host, guest, bound } = setupTransportCodecs();
		const handle = new MockHandle(new ArrayBuffer(1));
		const untouched = { value: 1 };
		const input = { untouched, nested: [handle, { handle }] };
		const encoded = host.encode(input);
		assert.deepEqual(
			encoded,
			normalizeTransportData({
				untouched,
				nested: [
					{ type: "__sandbox_handle__", token: 0 },
					{ handle: { type: "__sandbox_handle__", token: 0 } },
				],
			}),
		);
		assert.equal(input.nested[0], handle);
		assert.deepEqual(host.encode(untouched), normalizeTransportData(untouched));
		assert.notEqual(host.encode(untouched), untouched);
		const decoded = guest.decode(structuredClone(encoded));
		const restored = host.decode(guest.encode(decoded));
		assert.deepEqual(restored, normalizeTransportData(input));
		assert.deepEqual(bound, []);
		host.bindHandles(restored);
		assert.deepEqual(bound, [handle]);
	});

	it("normalizes every record, including generated handle and escape records", () => {
		const { host, guest } = setupTransportCodecs();
		const handle = new MockHandle(new ArrayBuffer(1));
		const input = {
			nested: [{ type: "__sandbox_handle__", token: 0, handle }],
			buffer: new ArrayBuffer(1),
		};
		const normalized = normalizeTransportData(input);
		assertNullPrototypeRecords(normalized);
		const encoded = host.encode(normalized);
		assertNullPrototypeRecords(encoded);
		const decoded = guest.decode(structuredClone(encoded));
		assertNullPrototypeRecords(decoded);
		const restored = host.decode(structuredClone(guest.encode(decoded)));
		assertNullPrototypeRecords(restored);
		assert.deepEqual(restored, normalized);
		assert.equal(Object.getPrototypeOf(input), Object.prototype);
		assert.equal(Object.getPrototypeOf(input.nested[0]), Object.prototype);
	});

	it("rejects ordinary records during semantic validation, including nested records", () => {
		for (const value of [{}, { nested: {} }, [{}]]) {
			assert.throws(
				() => validateTreePayloadVocabulary(value),
				/Invalid sandbox tree payload/,
			);
			assert.doesNotThrow(() => validateTreePayloadVocabulary(normalizeTransportData(value)));
		}
		const nested: Record<string, unknown> = Object.create(null);
		nested.child = {};
		assert.throws(() => validateTreePayloadVocabulary(nested), /Invalid sandbox tree payload/);
		assert.throws(
			() => parseHostGuestMessage({ type: "acknowledgment" }),
			/Invalid Host and Guest/,
		);
	});

	it("restores null prototypes after MessagePort reconstructs ordinary records", async () => {
		const { host, guest } = setupTransportCodecs();
		const input = { nested: [{ type: "__sandbox_object__", value: "data" }] };
		const encoded = host.encode(input);
		assertNullPrototypeRecords(encoded);
		const channel = new MessageChannel();
		try {
			const received = new Promise<unknown>((resolve) => {
				channel.port2.addEventListener(
					"message",
					(event: MessageEvent<unknown>) => resolve(event.data),
					{ once: true },
				);
				channel.port2.start();
			});
			channel.port1.postMessage(encoded);
			const wire = await received;
			assert.equal(Object.getPrototypeOf(wire), Object.prototype);
			const decoded = guest.decode(wire);
			assertNullPrototypeRecords(decoded);
			validateTreePayloadVocabulary(decoded);
			assert.deepEqual(decoded, normalizeTransportData(input));
		} finally {
			channel.port1.close();
			channel.port2.close();
		}
	});

	it("validates buffer placeholders by identity and unwraps only the blob response field", () => {
		const { host, guest } = setupTransportCodecs();
		const blob = new Uint8Array([0, 127, 255]).buffer;
		for (const [sender, receiver] of [
			[host, guest],
			[guest, host],
		]) {
			const message = { type: "blobResponse", requestId: 0, blob };
			const normalized = normalizeTransportData(message);
			const wire = structuredClone(sender.encode(normalized));
			const decoded = receiver.decode(wire);
			assert(typeof decoded === "object" && decoded !== null && "blob" in decoded);
			assert.deepEqual(decoded.blob, normalizeTransportData({ arrayBufferMarker: true }));
			assertNullPrototypeRecords(decoded);
			assert.throws(
				() => validateTreePayloadVocabulary(decoded.blob),
				/Invalid sandbox tree payload/,
			);

			const parsed = parseHostGuestMessage(decoded);
			assert(parsed.type === "blobResponse" && "blob" in parsed);
			assert(parsed.blob instanceof ArrayBuffer);
			assert.notEqual(parsed.blob, blob);
			assert.deepEqual(new Uint8Array(parsed.blob), new Uint8Array(blob));
			assert.deepEqual(new Uint8Array(blob), new Uint8Array([0, 127, 255]));

			for (const fake of [
				{ arrayBufferMarker: true },
				{ arrayBufferMarker: true, extra: 1 },
				structuredClone(decoded.blob),
			]) {
				const data = receiver.decode(structuredClone(sender.encode(fake)));
				validateTreePayloadVocabulary(data);
				assert.deepEqual(data, normalizeTransportData(fake));
				assert.throws(
					() => parseHostGuestMessage(normalizeTransportData({ ...message, blob: data })),
					/Invalid Host and Guest/,
				);
			}
		}
	});

	it("rejects buffers in tree payloads and non-blob protocol fields", () => {
		const { host, guest } = setupTransportCodecs();
		const blob = new ArrayBuffer(0);
		for (const codec of [host, guest]) {
			for (const payload of [
				blob,
				{ nested: blob },
				[blob],
				{ type: "__sandbox_handle__", nested: blob },
			]) {
				const normalized = normalizeTransportData(payload);
				const decoded = codec.decode(structuredClone(codec.encode(payload)));
				for (const value of [normalized, decoded, normalizeTransportData(decoded)]) {
					assert.throws(
						() => validateTreePayloadVocabulary(value),
						/Invalid sandbox tree payload/,
					);
				}
				assert.throws(
					() =>
						parseHostGuestMessage(
							codec.decode(
								structuredClone(codec.encode({ type: "dataChange", change: payload })),
							),
						),
					/Invalid sandbox tree payload/,
				);
			}
			for (const message of [
				blob,
				{ type: blob },
				{ type: "blobResponse", requestId: blob, blob },
				{ type: "blobResponse", requestId: 0, error: blob },
				{ type: "blobRequest", requestId: 0, token: blob },
			]) {
				assert.throws(
					() => parseHostGuestMessage(codec.decode(structuredClone(codec.encode(message)))),
					/Invalid Host and Guest/,
				);
			}
		}
	});

	it("deduplicates equivalent Host handles and preserves Guest equality", () => {
		const { host, guest } = setupTransportCodecs();
		const handle = new MockHandle(new ArrayBuffer(1));
		const equivalent = new MockHandle(new ArrayBuffer(1), handle.path);
		const first = guest.decode(host.encode(handle));
		const second = guest.decode(host.encode(equivalent));
		assert(isFluidHandle(first));
		assert(isFluidHandle(second));
		assert.equal(first, second);
		assert(compareFluidHandles(first, second));
		assert(!compareFluidHandles(first, handle));
	});

	it("caches a single promise for concurrent and repeated get calls", async () => {
		const { host, guest, requests } = setupTransportCodecs();
		const proxy = guest.decode(host.encode(new MockHandle(new ArrayBuffer(1))));
		assert(isFluidHandle(proxy));
		const first = proxy.get();
		const second = proxy.get();
		assert.equal(first, second);
		assert.equal(requests.length, 1);
		const request = requests[0];
		const blob = await host.resolveBlob(request.token);
		guest.receiveBlobResponse({ type: "blobResponse", requestId: request.requestId, blob });
		assert.equal(await first, blob);
		assert.equal(proxy.get(), first);
		assert.equal(requests.length, 1);
	});

	it("caches resolution failures", async () => {
		const { host, guest, requests } = setupTransportCodecs();
		const proxy = guest.decode(host.encode(new MockHandle(new ArrayBuffer(1))));
		assert(isFluidHandle(proxy));
		const promise = proxy.get();
		guest.receiveBlobResponse({
			type: "blobResponse",
			requestId: requests[0].requestId,
			error: "Blob unavailable",
		});
		await assert.rejects(promise, { name: "Error", message: "Blob unavailable" });
		assert.equal(proxy.get(), promise);
		assert.equal(requests.length, 1);
	});

	it("matches out-of-order blob responses to their requests", async () => {
		const { host, guest, requests } = setupTransportCodecs();
		const first = guest.decode(host.encode(new MockHandle(new ArrayBuffer(1))));
		const second = guest.decode(host.encode(new MockHandle(new ArrayBuffer(2))));
		assert(isFluidHandle(first));
		assert(isFluidHandle(second));
		const firstPromise = first.get();
		const secondPromise = second.get();
		const secondBlob = new ArrayBuffer(2);
		guest.receiveBlobResponse({
			type: "blobResponse",
			requestId: requests[1].requestId,
			blob: secondBlob,
		});
		assert.equal(await secondPromise, secondBlob);
		const firstBlob = new ArrayBuffer(1);
		guest.receiveBlobResponse({
			type: "blobResponse",
			requestId: requests[0].requestId,
			blob: firstBlob,
		});
		assert.equal(await firstPromise, firstBlob);
	});

	it("propagates transport failures and removes the pending request", async () => {
		const { host } = setupTransportCodecs();
		const transportError = new Error("Cannot post message");
		const guest = new GuestTransportCodec(() => {
			throw transportError;
		});
		const proxy = guest.decode(host.encode(new MockHandle(new ArrayBuffer(1))));
		assert(isFluidHandle(proxy));
		await assert.rejects(proxy.get(), (error: unknown) => error === transportError);
		assert.throws(
			() =>
				guest.receiveBlobResponse({
					type: "blobResponse",
					requestId: brand<BlobRequestId>(0),
					blob: new ArrayBuffer(1),
				}),
			SandboxProtocolError,
		);
	});

	it("rejects pending requests on disposal", async () => {
		const { host, guest } = setupTransportCodecs();
		const proxy = guest.decode(host.encode(new MockHandle(new ArrayBuffer(1))));
		assert(isFluidHandle(proxy));
		const promise = proxy.get();
		guest.dispose();
		await assert.rejects(promise, /disposed/);
		assert.throws(() => guest.encode(proxy), validateUsageError(/disposed/));
		assert.throws(
			() => guest.decode(host.encode(new MockHandle(new ArrayBuffer(0)))),
			validateUsageError(/disposed/),
		);
		host.dispose();
		await assert.rejects(
			host.resolveBlob(brand<HandleToken>(0)),
			validateUsageError(/disposed/),
		);
		assert.throws(
			() => host.encode(new MockHandle(new ArrayBuffer(0))),
			validateUsageError(/disposed/),
		);
	});

	it("rejects new and foreign Guest handles", () => {
		const { host, guest } = setupTransportCodecs();
		const handle = new MockHandle(new ArrayBuffer(1));
		assert.throws(() => guest.encode(handle), validateUsageError(/foreign/));
		const otherGuest = new GuestTransportCodec(() => assert.fail("Unexpected request"));
		const proxy = otherGuest.decode(host.encode(handle));
		assert.throws(() => guest.encode(proxy), validateUsageError(/foreign/));
	});

	it("classifies unsupported handle operations as usage errors", async () => {
		assert.throws(
			() => new HostTransportCodec(new MockHandle(undefined)),
			validateUsageError(/requires a SharedTree handle/),
		);
		const { host, guest } = setupTransportCodecs();
		const proxy = guest.decode(host.encode(new MockHandle("not a blob")));
		assert(isFluidHandle(proxy));
		await assert.rejects(
			host.resolveBlob(brand<HandleToken>(0)),
			validateUsageError(/only blob handles/),
		);
		assert.throws(
			() => toFluidHandleInternal(proxy).attachGraph(),
			validateUsageError(/Guest handles cannot attach/),
		);
		guest.dispose();
		await assert.rejects(proxy.get(), validateUsageError(/disposed/));
	});

	it("preserves local blob-resolution errors", async () => {
		const { host } = setupTransportCodecs();
		const resolutionError = new Error("Storage unavailable");
		host.encode(
			Object.assign(new MockHandle(new ArrayBuffer(0)), {
				get: async () => {
					throw resolutionError;
				},
			}),
		);
		await assert.rejects(
			host.resolveBlob(brand<HandleToken>(0)),
			(error: unknown) => error === resolutionError,
		);
	});

	it("rejects invalid and unknown tokens for edits and resolution", async () => {
		const { host, guest } = setupTransportCodecs();
		host.encode(new MockHandle(new ArrayBuffer(1)));
		for (const token of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, "0", undefined]) {
			const encoded = { type: "__sandbox_handle__", token };
			assert.throws(() => host.decode(encoded), SandboxProtocolError);
			assert.throws(() => guest.decode(encoded), SandboxProtocolError);
		}
		assert.throws(
			() => host.decode({ type: "__sandbox_handle__", token: 1 }),
			SandboxProtocolError,
		);
		await assert.rejects(host.resolveBlob(brand<HandleToken>(1)), SandboxProtocolError);
		await assert.rejects(host.resolveBlob(brand<HandleToken>(-1)), SandboxProtocolError);
	});

	it("does not interpret Host URLs as sandbox handles", () => {
		const { host } = setupTransportCodecs();
		const value = { type: "__fluid_handle__", url: "/unauthorized" };
		assert.deepEqual(host.decode(value), normalizeTransportData(value));
	});

	it("rejects malformed blob messages and unexpected responses", () => {
		const { guest } = setupTransportCodecs();
		for (const message of [
			{ type: "blobRequest", requestId: 0, token: -1 },
			{ type: "blobRequest", requestId: 0.5, token: 0 },
			{ type: "blobRequest", token: 0 },
			{ type: "blobResponse", requestId: 0, blob: "not a blob" },
			{ type: "blobResponse", requestId: 0, error: new Error("not a string") },
			{ type: "blobResponse", requestId: 0, blob: new ArrayBuffer(0), error: "both" },
			{ type: "blobRequest", requestId: 0 },
			{ type: "blobRequest", requestId: 0, token: 0, extra: true },
			{ type: "blobResponse", requestId: 0 },
			{ type: "blobResponse", requestId: 0, blob: undefined },
			{ type: "blobResponse", requestId: 0, blob: new Uint8Array(1) },
			{ type: "blobResponse", requestId: 0, blob: new ArrayBuffer(0), extra: true },
			{ type: "blobResponse", requestId: 0, error: "failure", extra: true },
		]) {
			assert.throws(
				() => parseHostGuestMessage(normalizeTransportData(message)),
				SandboxProtocolError,
			);
		}
		assert.throws(
			() =>
				guest.receiveBlobResponse({
					type: "blobResponse",
					requestId: brand<BlobRequestId>(0),
					blob: new ArrayBuffer(0),
				}),
			SandboxProtocolError,
		);
	});

	it("validates identifier bounds for handle records and every blob message variant", () => {
		for (const id of [0, Number.MAX_SAFE_INTEGER]) {
			assert(isHandleToken(id));
			assert(isSerializedHandle({ type: "__sandbox_handle__", token: id }));
			for (const message of [
				{ type: "blobRequest", requestId: id, token: id },
				{ type: "blobResponse", requestId: id, blob: new ArrayBuffer(0) },
				{ type: "blobResponse", requestId: id, error: "failure" },
			]) {
				const normalized = normalizeTransportData(message);
				assert.deepEqual(
					normalizeTransportData(parseHostGuestMessage(normalized)),
					normalized,
				);
			}
		}
		for (const id of [
			-1,
			0.5,
			Number.MAX_SAFE_INTEGER + 1,
			Number.NaN,
			Infinity,
			"0",
			null,
			undefined,
		]) {
			assert(!isHandleToken(id));
			assert(!isSerializedHandle({ type: "__sandbox_handle__", token: id }));
			for (const message of [
				{ type: "blobRequest", requestId: 0, token: id },
				{ type: "blobRequest", requestId: id, token: 0 },
				{ type: "blobResponse", requestId: id, blob: new ArrayBuffer(0) },
				{ type: "blobResponse", requestId: id, error: "failure" },
			]) {
				assert.throws(
					() => parseHostGuestMessage(normalizeTransportData(message)),
					/Invalid Host and Guest|Unsupported sandbox transport/,
				);
			}
		}
	});

	it("rejects malformed serialized handle records before binding or creating proxies", () => {
		const { host, guest, bound, requests } = setupTransportCodecs();
		host.encode(new MockHandle(new ArrayBuffer(1)));
		for (const value of [
			{ type: "__sandbox_handle__" },
			{ type: "__sandbox_handle__", token: 0, extra: true },
			{ type: "__sandbox_handle__", token: 0, url: "/unauthorized" },
		]) {
			assert(!isSerializedHandle(value));
			assert.throws(() => host.decode(value), /Invalid sandbox handle token/);
			assert.throws(() => guest.decode(value), /Invalid sandbox handle token/);
		}
		assert.equal(bound.length, 0);
		assert.equal(requests.length, 0);
	});

	it("round-trips marker-shaped ordinary data in both directions", () => {
		const { host, guest, bound } = setupTransportCodecs();
		const inputs = [
			{ type: "__sandbox_handle__", label: "ordinary user data" },
			{ type: "__sandbox_handle__", token: 0 },
			{ type: "__sandbox_handle__", token: 0, extra: true },
			{
				type: "__sandbox_object__",
				entries: [
					["type", "__sandbox_handle__"],
					["token", 0],
				],
			},
			{ type: "__sandbox_object__", entries: [], extra: true },
		];
		for (const value of [...inputs, { nested: inputs }]) {
			const onGuest = guest.decode(structuredClone(host.encode(value)));
			assert.deepEqual(onGuest, normalizeTransportData(value));
			const onHost = host.decode(structuredClone(guest.encode(onGuest)));
			assert.deepEqual(onHost, normalizeTransportData(value));
			assert(!isLocalHandle(onGuest));
			assert(!isLocalHandle(onHost));
		}
		assert.deepEqual(bound, []);
	});

	it("restores nested handles in escaped objects without reinterpreting ordinary marker roots", () => {
		const { host, guest, bound } = setupTransportCodecs();
		const handle = new MockHandle(new ArrayBuffer(0));
		const value = {
			type: "__sandbox_handle__",
			token: 0,
			nested: { type: "__sandbox_object__", entries: [handle] },
		};
		const decoded = guest.decode(structuredClone(host.encode(value)));
		validateTreePayloadVocabulary(decoded);
		const restored = host.decode(structuredClone(guest.encode(decoded)));
		assert.deepEqual(restored, normalizeTransportData(value));
		assert.deepEqual(bound, []);
		host.bindHandles(restored);
		assert.deepEqual(bound, [handle]);
	});

	it("preserves prototype-related property names in null-prototype records", () => {
		const { host, guest } = setupTransportCodecs();
		const value: unknown = JSON.parse(
			'{"type":"__sandbox_object__","__proto__":{"polluted":true},"constructor":{"prototype":"data"},"prototype":"data"}',
		);
		const decoded = guest.decode(structuredClone(host.encode(value)));
		validateTreePayloadVocabulary(decoded);
		assert.deepEqual(decoded, normalizeTransportData(value));
		assert(typeof decoded === "object" && decoded !== null);
		assert.equal(Object.getPrototypeOf(decoded), null);
		assert(Object.hasOwn(decoded, "__proto__"));
		assert.equal(Object.hasOwn(Object.prototype, "polluted"), false);
		assert.deepEqual(
			host.decode(structuredClone(guest.encode(decoded))),
			normalizeTransportData(value),
		);
		const nullPrototype: unknown = Object.assign(Object.create(null), { value: 1 });
		assert.deepEqual(guest.decode(host.encode(nullPrototype)), nullPrototype);
	});

	it("treats legacy string-property handle lookalikes as ordinary data", () => {
		const { host, guest, requests } = setupTransportCodecs();
		const value = { IFluidHandle: { IFluidHandle: true }, type: "__sandbox_handle__" };
		assert(
			isFluidHandle(value),
			"The legacy fallback is the reason for the strict local check",
		);
		assert(!isLocalHandle(value));
		const decoded = guest.decode(structuredClone(host.encode(value)));
		assert.deepEqual(decoded, normalizeTransportData(value));
		validateTreePayloadVocabulary(decoded);
		assert.deepEqual(
			host.decode(structuredClone(guest.encode(decoded))),
			normalizeTransportData(value),
		);
		assert.equal(requests.length, 0);
	});

	it("validates decoded handles as opaque leaves, not wire markers", () => {
		const { host, guest } = setupTransportCodecs();
		const handle = new MockHandle(new ArrayBuffer(0));
		const decoded = guest.decode(structuredClone(host.encode([handle])));
		assert(Array.isArray(decoded));
		assert(isLocalHandle(decoded[0]));
		assert(fluidHandleSymbol in decoded[0]);
		validateTreePayloadVocabulary(decoded);
		assert.doesNotThrow(() =>
			parseHostGuestMessage(normalizeTransportData({ type: "dataChange", change: decoded })),
		);
		assert.throws(
			() => validateTreePayloadVocabulary(new ArrayBuffer(0)),
			/Invalid sandbox tree payload/,
		);
	});

	it("rejects unsupported values, cycles, and sparse arrays in both directions", () => {
		const { host, guest } = setupTransportCodecs();
		const cycle: { self?: unknown } = {};
		cycle.self = cycle;
		const sparse: unknown[] = [];
		sparse.length = 1;
		for (const value of [
			new Map(),
			new Set(),
			new Date(),
			new Uint8Array(1),
			new SharedArrayBuffer(0),
			Number.NaN,
			Infinity,
			-Infinity,
			1n,
			Symbol("value"),
			() => {},
			cycle,
			sparse,
		]) {
			assert.throws(() => host.encode(value), SandboxProtocolError);
			assert.throws(() => guest.decode(value), SandboxProtocolError);
			assert.throws(() => normalizeTransportData(value), SandboxProtocolError);
		}
		const shared = { value: undefined };
		assert.deepEqual(
			guest.decode(host.encode([shared, shared, -0])),
			normalizeTransportData([shared, shared, -0]),
		);
	});

	it("does not invoke accessors or accept symbol and hidden properties", () => {
		const { host, guest } = setupTransportCodecs();
		let accesses = 0;
		const accessor = Object.defineProperty({}, "type", {
			enumerable: true,
			get: () => {
				accesses++;
				return "__sandbox_handle__";
			},
		});
		const hidden = Object.defineProperty({}, "hidden", { value: 1 });
		for (const value of [accessor, hidden, { [Symbol("key")]: 1 }]) {
			assert.throws(() => host.encode(value), SandboxProtocolError);
			assert.throws(() => guest.decode(value), SandboxProtocolError);
		}
		assert.equal(accesses, 0);
		assert.throws(
			() => guest.decode({ [fluidHandleSymbol]: {} }),
			/Handles must cross the sandbox boundary as tokens/,
		);
	});

	it("rejects malformed escapes and duplicate keys without binding handles", () => {
		const { host, guest, bound } = setupTransportCodecs();
		for (const value of [
			{ type: "__sandbox_object__" },
			{ type: "__sandbox_object__", entries: {} },
			{ type: "__sandbox_object__", entries: [], extra: 1 },
			{ type: "__sandbox_object__", entries: [[0, "value"]] },
			{ type: "__sandbox_object__", entries: [["key"]] },
			{ type: "__sandbox_object__", entries: [["key", 1, 2]] },
			{
				type: "__sandbox_object__",
				entries: [
					["__proto__", 1],
					["__proto__", 2],
				],
			},
		]) {
			assert.throws(() => host.decode(value), SandboxProtocolError);
			assert.throws(() => guest.decode(value), SandboxProtocolError);
		}
		assert.deepEqual(bound, []);
	});

	it("copies and restricts the entire message before restoring any handle", () => {
		const { host, guest } = setupTransportCodecs();
		const wire = {
			nested: host.encode(new MockHandle(new ArrayBuffer(0))),
			unsupported: new Map(),
		};
		assert.throws(() => guest.decode(wire), /Unsupported sandbox transport object/);
		assert.throws(
			() =>
				host.decode({
					nested: { type: "__sandbox_handle__", token: Number.MAX_SAFE_INTEGER },
					unsupported: new Map(),
				}),
			/Unsupported sandbox transport object/,
		);
	});
});
