/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";
import { sizeof } from "../utils";

describe("helpers", () => {
	describe("sizeof", () => {
		const data = "Hello, World!";
		const dataSize = Buffer.byteLength(data, "utf8"); // 13 bytes

		it("should return correct size for string", () => {
			assert.strictEqual(sizeof(data), dataSize);
		});
		it("should return correct size for Buffer", () => {
			const buffer = Buffer.from(data, "utf8");
			assert.strictEqual(sizeof(buffer), dataSize);
		});
		it("should return correct size for ArrayBufferView", () => {
			const uint8Array = new Uint8Array(Buffer.from(data, "utf8"));
			assert.strictEqual(sizeof(uint8Array), dataSize);
		});
		it("should return correct size for Iterable string", () => {
			function* iterator() {
				for (const char of data) {
					yield char;
				}
			}
			const iterable = iterator();
			assert.strictEqual(sizeof(iterable), dataSize);
		});
		it("should return correct size for Iterable ArrayBufferView", () => {
			const uint8Array1 = new Uint8Array(Buffer.from(data.split(" ")[0], "utf8"));
			const uint8Array2 = new Uint8Array(Buffer.from(data.split(" ")[1], "utf8"));
			function* iterator() {
				yield uint8Array1;
				yield uint8Array2;
			}
			const iterable = iterator();
			assert.strictEqual(sizeof(iterable), dataSize - 1); // space is 1 byte
		});
	});
});
