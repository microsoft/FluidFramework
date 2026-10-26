/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { bootstrapProtocol, isBootstrapMessage, readGuestParameters } from "../bootstrap.js";

describe("Bootstrap envelope", () => {
	for (const type of ["initialize", "connected", "error"]) {
		it(`accepts ${type}`, () => {
			assert.equal(
				isBootstrapMessage({
					protocol: bootstrapProtocol,
					sessionId: "session",
					type,
					...(type === "error" ? { error: "Initialization failed" } : {}),
				}),
				true,
			);
		});
	}

	it("rejects malformed, unrelated, or extended envelopes", () => {
		const valid = { protocol: bootstrapProtocol, sessionId: "session", type: "initialize" };
		for (const value of [
			undefined,
			[],
			{},
			{ ...valid, protocol: "another-protocol" },
			{ ...valid, sessionId: "" },
			{ ...valid, sessionId: 1 },
			{ ...valid, type: "unknown" },
			{ ...valid, type: "ready" },
			{ ...valid, type: "error" },
			{ ...valid, type: "error", error: 1 },
			{ ...valid, extra: true },
			{ ...valid, error: "unexpected" },
		]) {
			assert.equal(isBootstrapMessage(value), false);
		}
	});

	it("reads the session and exact parent origin from the fragment", () => {
		assert.deepEqual(
			readGuestParameters(
				new URL(
					"https://example.com/guest.html#sessionId=session&parentOrigin=https%3A%2F%2Fexample.com",
				),
			),
			{ sessionId: "session", parentOrigin: "https://example.com" },
		);
	});

	it("rejects missing, duplicate, opaque, non-HTTP, and non-origin parameters", () => {
		for (const fragment of [
			"",
			"sessionId=session",
			"sessionId=&parentOrigin=https://example.com",
			"sessionId=session&parentOrigin=null",
			"sessionId=session&parentOrigin=file://",
			"sessionId=session&parentOrigin=https://example.com/path",
			"sessionId=session&parentOrigin=https://example.com/&parentOrigin=https://other.com",
			"sessionId=session&sessionId=other&parentOrigin=https://example.com",
		]) {
			assert.throws(() =>
				readGuestParameters(new URL(`https://example.com/guest.html#${fragment}`)),
			);
		}
	});
});
