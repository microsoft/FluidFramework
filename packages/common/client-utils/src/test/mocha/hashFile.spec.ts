/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { Buffer } from "node:buffer";

import * as HashFileBrowser from "../../hashFileBrowser.js";
import * as HashFileNode from "../../hashFileNode.js";

/**
 * The existing hash tests (under `src/test/playwright`) run only in a real browser, using the
 * browser `IsoBuffer`, whose instances span their whole backing buffer. In Node.js, `Buffer`s are
 * frequently views into a larger allocation (a `subarray`, or a small `Buffer` allocated from the
 * shared internal pool), so these tests verify that both the Node.js and browser
 * `hashFile`/`gitHashFile` implementations hash only the bytes of the view rather than its entire
 * backing buffer.
 */
describe("hashFile with Node.js Buffer views", () => {
	const content = "hello world";
	// Known digests of "hello world".
	const expectedSha1 = "2aae6c35c94fcfb415dbe95f408b9ce91ee846ed";
	const expectedSha256Base64 = "uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek=";
	// `git hash-object` of "hello world" (no trailing newline).
	const expectedGitHash = "95d09f2b10159347eece71399a7e2e907ea3df4f";

	/**
	 * Creates Node.js `Buffer`s containing `content` that only cover part of their backing buffer.
	 */
	function createViews(): [string, Buffer][] {
		const backing = Buffer.from(`!!!!${content}!!!!`, "utf8");
		const subarray = backing.subarray(4, 4 + content.length);
		const pooled = Buffer.from(content, "utf8");
		for (const view of [subarray, pooled]) {
			// Precondition: each view covers only part of its backing buffer.
			assert(view.buffer.byteLength > view.byteLength);
		}
		return [
			["subarray", subarray],
			["pooled", pooled],
		];
	}

	for (const [name, view] of createViews()) {
		for (const [impl, { hashFile, gitHashFile }] of [
			["node", HashFileNode],
			["browser", HashFileBrowser],
		] as const) {
			it(`${impl} hashFile only hashes the bytes of a ${name} Buffer`, async () => {
				assert.equal(await hashFile(view), expectedSha1);
				assert.equal(await hashFile(view, "SHA-256", "base64"), expectedSha256Base64);
			});

			it(`${impl} gitHashFile only hashes the bytes of a ${name} Buffer`, async () => {
				assert.equal(await gitHashFile(view), expectedGitHash);
			});
		}
	}
});
