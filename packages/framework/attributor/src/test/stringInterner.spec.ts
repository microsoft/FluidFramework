/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { MutableStringInterner } from "../stringInterner.js";

describe("MutableStringInterner", () => {
	const inputStrings = ["test", "test2", "test3", "test4"];

	it("can associate a string with an intern ID", () => {
		const interner = new MutableStringInterner();

		assert.equal(interner.getOrCreateInternedId(inputStrings[0]), 0);
		assert.equal(interner.getOrCreateInternedId(inputStrings[1]), 1);
		assert.equal(interner.getOrCreateInternedId(inputStrings[0]), 0);
	});

	it("can handle empty strings", () => {
		const interner = new MutableStringInterner();

		assert.equal(interner.getOrCreateInternedId(""), 0);
	});

	it("getInternedId returns undefined for un-created ids", () => {
		const interner = new MutableStringInterner();

		assert.equal(interner.getInternedId(inputStrings[0]), undefined);
		assert.equal(interner.getOrCreateInternedId(inputStrings[0]), 0);
		assert.equal(interner.getInternedId(inputStrings[0]), 0);
		assert.equal(interner.getInternedId(inputStrings[1]), undefined);
	});

	it("can retrieve the intern ID associated with a string", () => {
		const interner = new MutableStringInterner();

		assert.equal(interner.getOrCreateInternedId(inputStrings[0]), 0);
		assert.equal(interner.getOrCreateInternedId(inputStrings[1]), 1);
		assert.equal(interner.getInternedId(inputStrings[0]), 0);
		assert.equal(interner.getInternedId(inputStrings[1]), 1);

		assert.equal(interner.getString(0), inputStrings[0]);
		assert.equal(interner.getString(1), inputStrings[1]);
	});

	it("throws an error when trying to retrieve a string that hasn't been encountered", () => {
		const interner = new MutableStringInterner();

		assert.throws(
			() => interner.getString(0),
			/No string associated with 0\./,
			"error should be thrown",
		);
	});

	it("can return a serializable representation of its state", () => {
		const interner = new MutableStringInterner();

		for (const value of inputStrings) {
			interner.getOrCreateInternedId(value);
		}

		assert.deepEqual(interner.getSerializable(), inputStrings);
	});

	it("can be initialized with a list of input strings", () => {
		const interner = new MutableStringInterner(inputStrings);

		assert.equal(interner.getOrCreateInternedId(inputStrings[3]), 3);
		assert.equal(interner.getOrCreateInternedId(inputStrings[2]), 2);
		assert.equal(interner.getOrCreateInternedId(inputStrings[1]), 1);
		assert.equal(interner.getOrCreateInternedId(inputStrings[0]), 0);
	});

	it("can be initialized with a list of input strings that include duplicate IDs", () => {
		const interner = new MutableStringInterner([...inputStrings, ...inputStrings]);

		assert.equal(interner.getOrCreateInternedId(inputStrings[3]), 3);
		assert.equal(interner.getOrCreateInternedId(inputStrings[2]), 2);
		assert.equal(interner.getOrCreateInternedId(inputStrings[1]), 1);
		assert.equal(interner.getOrCreateInternedId(inputStrings[0]), 0);
	});

	it("doesn't change a string's intern ID when retrieving it multiple times", () => {
		const interner = new MutableStringInterner();

		assert.equal(interner.getOrCreateInternedId(inputStrings[0]), 0);
		assert.equal(interner.getOrCreateInternedId(inputStrings[1]), 1);
		assert.equal(interner.getOrCreateInternedId(inputStrings[1]), 1);
		assert.equal(interner.getOrCreateInternedId(inputStrings[0]), 0);
		assert.equal(interner.getOrCreateInternedId(inputStrings[0]), 0);
		assert.equal(interner.getOrCreateInternedId(inputStrings[1]), 1);
		assert.equal(interner.getOrCreateInternedId(inputStrings[1]), 1);
	});
});
