/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { matchProperties } from "../properties.js";

describe("Properties", () => {
	describe("matchProperties", () => {
		it("simple properties match", () => {
			assert(matchProperties({ a: "a" }, { a: "a" }));
		});
		it("simple properties don't match", () => {
			assert(!matchProperties({ a: "a" }, { a: "b" }));
		});
		it("multiple simple properties match", () => {
			assert(matchProperties({ a: "a", 1: 1 }, { a: "a", 1: 1 }));
		});
		it("multiple simple properties don't match", () => {
			assert(!matchProperties({ a: "a", 1: 1 }, { a: "b", 1: 2 }));
		});
		it("keys don't match", () => {
			assert(!matchProperties({ a: "a" }, { b: "a" }));
		});
		it("extra key", () => {
			assert(!matchProperties({ a: "a" }, { a: "a", b: "b" }));
		});
		it("complex properties match", () => {
			assert(matchProperties({ c: { a: "a" } }, { c: { a: "a" } }));
		});
		it("complex properties don't match", () => {
			assert(!matchProperties({ c: { a: "a" } }, { c: { a: "b" } }));
		});
		it("undefined and simple properties don't match", () => {
			assert(!matchProperties(undefined, { a: "a" }));
		});
		it("empty and simple properties don't match", () => {
			assert(!matchProperties({}, { a: "a" }));
		});
		it("undefined properties match", () => {
			assert(matchProperties(undefined, undefined));
		});
		it("empty properties match", () => {
			assert(matchProperties({}, {}));
		});
		it("undefined and empty properties match", () => {
			assert(matchProperties(undefined, {}));
		});
		it("empty and undefined properties match", () => {
			assert(matchProperties({}, undefined));
		});
	});
});
