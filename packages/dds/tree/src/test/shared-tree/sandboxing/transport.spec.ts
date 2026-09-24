/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "node:assert";

import { fluidHandleSymbol } from "@fluidframework/core-interfaces";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import { compareFluidHandles, isFluidHandle } from "@fluidframework/runtime-utils/internal";
import { MockHandle } from "@fluidframework/test-runtime-utils/internal";

import { brand, type isAssignableTo, type requireFalse } from "../../../util/index.js";

import {
	type BlobRequestId,
	type BlobRequestMessage,
	type HandleToken,
	isHandleToken,
	isLocalHandle,
	isSerializedHandle,
	parseHostGuestMessage,
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
			strict.equal(Object.getPrototypeOf(value), ArrayBuffer.prototype);
			return;
		}
		if (Array.isArray(value)) {
			strict.equal(Object.getPrototypeOf(value), Array.prototype);
		} else {
			strict.equal(Object.getPrototypeOf(value), null);
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
		strict.deepEqual(
			encoded,
			normalizeTransportData({
				untouched,
				nested: [
					{ type: "__sandbox_handle__", token: 0 },
					{ handle: { type: "__sandbox_handle__", token: 0 } },
				],
			}),
		);
		strict.equal(input.nested[0], handle);
		strict.deepEqual(host.encode(untouched), normalizeTransportData(untouched));
		strict.notEqual(host.encode(untouched), untouched);
		const decoded = guest.decode(structuredClone(encoded));
		const restored = host.decode(guest.encode(decoded));
		strict.deepEqual(restored, normalizeTransportData(input));
		strict.deepEqual(bound, []);
		host.bindHandles(restored);
		strict.deepEqual(bound, [handle]);
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
		strict.deepEqual(restored, normalized);
		strict.equal(Object.getPrototypeOf(input), Object.prototype);
		strict.equal(Object.getPrototypeOf(input.nested[0]), Object.prototype);
	});

	it("rejects ordinary records during semantic validation, including nested records", () => {
		for (const value of [{}, { nested: {} }, [{}]]) {
			strict.throws(
				() => validateTreePayloadVocabulary(value),
				/Invalid sandbox tree payload/,
			);
			strict.doesNotThrow(() => validateTreePayloadVocabulary(normalizeTransportData(value)));
		}
		const nested: Record<string, unknown> = Object.create(null);
		nested.child = {};
		strict.throws(() => validateTreePayloadVocabulary(nested), /Invalid sandbox tree payload/);
		strict.throws(
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
			strict.equal(Object.getPrototypeOf(wire), Object.prototype);
			const decoded = guest.decode(wire);
			assertNullPrototypeRecords(decoded);
			validateTreePayloadVocabulary(decoded);
			strict.deepEqual(decoded, normalizeTransportData(input));
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
			strict(typeof decoded === "object" && decoded !== null && "blob" in decoded);
			strict.deepEqual(decoded.blob, normalizeTransportData({ arrayBufferMarker: true }));
			assertNullPrototypeRecords(decoded);
			strict.throws(
				() => validateTreePayloadVocabulary(decoded.blob),
				/Invalid sandbox tree payload/,
			);

			const parsed = parseHostGuestMessage(decoded);
			strict(parsed.type === "blobResponse" && "blob" in parsed);
			strict(parsed.blob instanceof ArrayBuffer);
			strict.notEqual(parsed.blob, blob);
			strict.deepEqual(new Uint8Array(parsed.blob), new Uint8Array(blob));
			strict.deepEqual(new Uint8Array(blob), new Uint8Array([0, 127, 255]));

			for (const fake of [
				{ arrayBufferMarker: true },
				{ arrayBufferMarker: true, extra: 1 },
				structuredClone(decoded.blob),
			]) {
				const data = receiver.decode(structuredClone(sender.encode(fake)));
				validateTreePayloadVocabulary(data);
				strict.deepEqual(data, normalizeTransportData(fake));
				strict.throws(
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
					strict.throws(
						() => validateTreePayloadVocabulary(value),
						/Invalid sandbox tree payload/,
					);
				}
				strict.throws(
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
				strict.throws(
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
		strict(isFluidHandle(first));
		strict(isFluidHandle(second));
		strict.equal(first, second);
		strict(compareFluidHandles(first, second));
		strict(!compareFluidHandles(first, handle));
	});

	it("caches a single promise for concurrent and repeated get calls", async () => {
		const { host, guest, requests } = setupTransportCodecs();
		const proxy = guest.decode(host.encode(new MockHandle(new ArrayBuffer(1))));
		strict(isFluidHandle(proxy));
		const first = proxy.get();
		const second = proxy.get();
		strict.equal(first, second);
		strict.equal(requests.length, 1);
		const request = requests[0];
		const blob = await host.resolveBlob(request.token);
		guest.receiveBlobResponse({ type: "blobResponse", requestId: request.requestId, blob });
		strict.equal(await first, blob);
		strict.equal(proxy.get(), first);
		strict.equal(requests.length, 1);
	});

	it("caches resolution failures", async () => {
		const { host, guest, requests } = setupTransportCodecs();
		const proxy = guest.decode(host.encode(new MockHandle(new ArrayBuffer(1))));
		strict(isFluidHandle(proxy));
		const promise = proxy.get();
		guest.receiveBlobResponse({
			type: "blobResponse",
			requestId: requests[0].requestId,
			error: "Blob unavailable",
		});
		await strict.rejects(promise, /Blob unavailable/);
		strict.equal(proxy.get(), promise);
		strict.equal(requests.length, 1);
	});

	it("matches out-of-order blob responses to their requests", async () => {
		const { host, guest, requests } = setupTransportCodecs();
		const first = guest.decode(host.encode(new MockHandle(new ArrayBuffer(1))));
		const second = guest.decode(host.encode(new MockHandle(new ArrayBuffer(2))));
		strict(isFluidHandle(first));
		strict(isFluidHandle(second));
		const firstPromise = first.get();
		const secondPromise = second.get();
		const secondBlob = new ArrayBuffer(2);
		guest.receiveBlobResponse({
			type: "blobResponse",
			requestId: requests[1].requestId,
			blob: secondBlob,
		});
		strict.equal(await secondPromise, secondBlob);
		const firstBlob = new ArrayBuffer(1);
		guest.receiveBlobResponse({
			type: "blobResponse",
			requestId: requests[0].requestId,
			blob: firstBlob,
		});
		strict.equal(await firstPromise, firstBlob);
	});

	it("propagates transport failures and removes the pending request", async () => {
		const { host } = setupTransportCodecs();
		const guest = new GuestTransportCodec(() => {
			throw new Error("Cannot post message");
		});
		const proxy = guest.decode(host.encode(new MockHandle(new ArrayBuffer(1))));
		strict(isFluidHandle(proxy));
		await strict.rejects(proxy.get(), /Cannot post message/);
		strict.throws(
			() =>
				guest.receiveBlobResponse({
					type: "blobResponse",
					requestId: brand<BlobRequestId>(0),
					blob: new ArrayBuffer(1),
				}),
			/Unexpected sandbox blob response/,
		);
	});

	it("rejects pending requests on disposal", async () => {
		const { host, guest } = setupTransportCodecs();
		const proxy = guest.decode(host.encode(new MockHandle(new ArrayBuffer(1))));
		strict(isFluidHandle(proxy));
		const promise = proxy.get();
		guest.dispose();
		await strict.rejects(promise, /disposed/);
		strict.throws(() => guest.encode(proxy), /disposed/);
		host.dispose();
		await strict.rejects(host.resolveBlob(brand<HandleToken>(0)), /disposed/);
	});

	it("rejects new and foreign Guest handles", () => {
		const { host, guest } = setupTransportCodecs();
		const handle = new MockHandle(new ArrayBuffer(1));
		strict.throws(() => guest.encode(handle), /foreign/);
		const otherGuest = new GuestTransportCodec(() => strict.fail("Unexpected request"));
		const proxy = otherGuest.decode(host.encode(handle));
		strict.throws(() => guest.encode(proxy), /foreign/);
	});

	it("rejects invalid and unknown tokens for edits and resolution", async () => {
		const { host, guest } = setupTransportCodecs();
		host.encode(new MockHandle(new ArrayBuffer(1)));
		for (const token of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, "0", undefined]) {
			const encoded = { type: "__sandbox_handle__", token };
			strict.throws(() => host.decode(encoded), /Invalid sandbox handle token/);
			strict.throws(() => guest.decode(encoded), /Invalid sandbox handle token/);
		}
		strict.throws(
			() => host.decode({ type: "__sandbox_handle__", token: 1 }),
			/Unknown sandbox handle token/,
		);
		await strict.rejects(
			host.resolveBlob(brand<HandleToken>(1)),
			/Unknown sandbox handle token/,
		);
		await strict.rejects(
			host.resolveBlob(brand<HandleToken>(-1)),
			/Unknown sandbox handle token/,
		);
	});

	it("does not interpret Host URLs as sandbox handles", () => {
		const { host } = setupTransportCodecs();
		const value = { type: "__fluid_handle__", url: "/unauthorized" };
		strict.deepEqual(host.decode(value), normalizeTransportData(value));
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
			strict.throws(
				() => parseHostGuestMessage(normalizeTransportData(message)),
				/Invalid Host and Guest|Unsupported sandbox transport/,
			);
		}
		strict.throws(
			() =>
				guest.receiveBlobResponse({
					type: "blobResponse",
					requestId: brand<BlobRequestId>(0),
					blob: new ArrayBuffer(0),
				}),
			/Unexpected sandbox blob response/,
		);
	});

	it("validates identifier bounds for handle records and every blob message variant", () => {
		for (const id of [0, Number.MAX_SAFE_INTEGER]) {
			strict(isHandleToken(id));
			strict(isSerializedHandle({ type: "__sandbox_handle__", token: id }));
			for (const message of [
				{ type: "blobRequest", requestId: id, token: id },
				{ type: "blobResponse", requestId: id, blob: new ArrayBuffer(0) },
				{ type: "blobResponse", requestId: id, error: "failure" },
			]) {
				const normalized = normalizeTransportData(message);
				strict.deepEqual(
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
			strict(!isHandleToken(id));
			strict(!isSerializedHandle({ type: "__sandbox_handle__", token: id }));
			for (const message of [
				{ type: "blobRequest", requestId: 0, token: id },
				{ type: "blobRequest", requestId: id, token: 0 },
				{ type: "blobResponse", requestId: id, blob: new ArrayBuffer(0) },
				{ type: "blobResponse", requestId: id, error: "failure" },
			]) {
				strict.throws(
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
			strict(!isSerializedHandle(value));
			strict.throws(() => host.decode(value), /Invalid sandbox handle token/);
			strict.throws(() => guest.decode(value), /Invalid sandbox handle token/);
		}
		strict.equal(bound.length, 0);
		strict.equal(requests.length, 0);
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
			strict.deepEqual(onGuest, normalizeTransportData(value));
			const onHost = host.decode(structuredClone(guest.encode(onGuest)));
			strict.deepEqual(onHost, normalizeTransportData(value));
			strict(!isLocalHandle(onGuest));
			strict(!isLocalHandle(onHost));
		}
		strict.deepEqual(bound, []);
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
		strict.deepEqual(restored, normalizeTransportData(value));
		strict.deepEqual(bound, []);
		host.bindHandles(restored);
		strict.deepEqual(bound, [handle]);
	});

	it("preserves prototype-related property names in null-prototype records", () => {
		const { host, guest } = setupTransportCodecs();
		const value: unknown = JSON.parse(
			'{"type":"__sandbox_object__","__proto__":{"polluted":true},"constructor":{"prototype":"data"},"prototype":"data"}',
		);
		const decoded = guest.decode(structuredClone(host.encode(value)));
		validateTreePayloadVocabulary(decoded);
		strict.deepEqual(decoded, normalizeTransportData(value));
		strict(typeof decoded === "object" && decoded !== null);
		strict.equal(Object.getPrototypeOf(decoded), null);
		strict(Object.hasOwn(decoded, "__proto__"));
		strict.equal(Object.hasOwn(Object.prototype, "polluted"), false);
		strict.deepEqual(
			host.decode(structuredClone(guest.encode(decoded))),
			normalizeTransportData(value),
		);
		const nullPrototype: unknown = Object.assign(Object.create(null), { value: 1 });
		strict.deepEqual(guest.decode(host.encode(nullPrototype)), nullPrototype);
	});

	it("treats legacy string-property handle lookalikes as ordinary data", () => {
		const { host, guest, requests } = setupTransportCodecs();
		const value = { IFluidHandle: { IFluidHandle: true }, type: "__sandbox_handle__" };
		strict(
			isFluidHandle(value),
			"The legacy fallback is the reason for the strict local check",
		);
		strict(!isLocalHandle(value));
		const decoded = guest.decode(structuredClone(host.encode(value)));
		strict.deepEqual(decoded, normalizeTransportData(value));
		validateTreePayloadVocabulary(decoded);
		strict.deepEqual(
			host.decode(structuredClone(guest.encode(decoded))),
			normalizeTransportData(value),
		);
		strict.equal(requests.length, 0);
	});

	it("validates decoded handles as opaque leaves, not wire markers", () => {
		const { host, guest } = setupTransportCodecs();
		const handle = new MockHandle(new ArrayBuffer(0));
		const decoded = guest.decode(structuredClone(host.encode([handle])));
		strict(Array.isArray(decoded));
		strict(isLocalHandle(decoded[0]));
		strict(fluidHandleSymbol in decoded[0]);
		validateTreePayloadVocabulary(decoded);
		strict.doesNotThrow(() =>
			parseHostGuestMessage(normalizeTransportData({ type: "dataChange", change: decoded })),
		);
		strict.throws(
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
			strict.throws(() => host.encode(value), TypeError);
			strict.throws(() => guest.decode(value), TypeError);
		}
		const shared = { value: undefined };
		strict.deepEqual(
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
			strict.throws(() => host.encode(value), TypeError);
			strict.throws(() => guest.decode(value), TypeError);
		}
		strict.equal(accesses, 0);
		strict.throws(
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
			strict.throws(() => host.decode(value), /sandbox object escape/);
			strict.throws(() => guest.decode(value), /sandbox object escape/);
		}
		strict.deepEqual(bound, []);
	});

	it("copies and restricts the entire message before restoring any handle", () => {
		const { host, guest } = setupTransportCodecs();
		const wire = {
			nested: host.encode(new MockHandle(new ArrayBuffer(0))),
			unsupported: new Map(),
		};
		strict.throws(() => guest.decode(wire), /Unsupported sandbox transport object/);
		strict.throws(
			() =>
				host.decode({
					nested: { type: "__sandbox_handle__", token: Number.MAX_SAFE_INTEGER },
					unsupported: new Map(),
				}),
			/Unsupported sandbox transport object/,
		);
	});
});
