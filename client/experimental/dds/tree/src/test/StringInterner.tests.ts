/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { MutableStringInterner } from '../StringInterner';

describe('MutableStringInterner', () => {
	const inputStrings = ['test', 'test2', 'test3', 'test4'];

	it('can associate a string with an intern ID', () => {
		const interner = new MutableStringInterner();

		expect(interner.getOrCreateInternedId(inputStrings[0])).to.equal(0);
		expect(interner.getOrCreateInternedId(inputStrings[1])).to.equal(1);
		expect(interner.getOrCreateInternedId(inputStrings[0])).to.equal(0);
	});

	it('can handle empty strings', () => {
		const interner = new MutableStringInterner();

		expect(interner.getOrCreateInternedId('')).to.equal(0);
	});

	it('getInternedId returns undefined for un-created ids', () => {
		const interner = new MutableStringInterner();

		expect(interner.getInternedId(inputStrings[0])).to.equal(undefined);
		expect(interner.getOrCreateInternedId(inputStrings[0])).to.equal(0);
		expect(interner.getInternedId(inputStrings[0])).to.equal(0);
		expect(interner.getInternedId(inputStrings[1])).to.equal(undefined);
	});

	it('can retrieve the intern ID associated with a string', () => {
		const interner = new MutableStringInterner();

		expect(interner.getOrCreateInternedId(inputStrings[0])).to.equal(0);
		expect(interner.getOrCreateInternedId(inputStrings[1])).to.equal(1);
		expect(interner.getInternedId(inputStrings[0])).to.equal(0);
		expect(interner.getInternedId(inputStrings[1])).to.equal(1);

		expect(interner.getString(0)).to.equal(inputStrings[0]);
		expect(interner.getString(1)).to.equal(inputStrings[1]);
	});

	it("throws an error when trying to retrieve a string that hasn't been encountered", () => {
		const interner = new MutableStringInterner();

		expect(() => interner.getString(0)).to.throw('No string associated with 0.');
	});

	it('can return a serializable representation of its state', () => {
		const interner = new MutableStringInterner();

		for (const value of inputStrings) {
			interner.getOrCreateInternedId(value);
		}

		expect(interner.getSerializable()).to.deep.equal(inputStrings);
	});

	it('can be initialized with a list of input strings', () => {
		const interner = new MutableStringInterner(inputStrings);

		expect(interner.getOrCreateInternedId(inputStrings[3])).to.equal(3);
		expect(interner.getOrCreateInternedId(inputStrings[2])).to.equal(2);
		expect(interner.getOrCreateInternedId(inputStrings[1])).to.equal(1);
		expect(interner.getOrCreateInternedId(inputStrings[0])).to.equal(0);
	});

	it('can be initialized with a list of input strings that include duplicate IDs', () => {
		const interner = new MutableStringInterner([...inputStrings, ...inputStrings]);

		expect(interner.getOrCreateInternedId(inputStrings[3])).to.equal(3);
		expect(interner.getOrCreateInternedId(inputStrings[2])).to.equal(2);
		expect(interner.getOrCreateInternedId(inputStrings[1])).to.equal(1);
		expect(interner.getOrCreateInternedId(inputStrings[0])).to.equal(0);
	});

	it("doesn't change a string's intern ID when retrieving it multiple times", () => {
		const interner = new MutableStringInterner();

		expect(interner.getOrCreateInternedId(inputStrings[0])).to.equal(0);
		expect(interner.getOrCreateInternedId(inputStrings[1])).to.equal(1);
		expect(interner.getOrCreateInternedId(inputStrings[1])).to.equal(1);
		expect(interner.getOrCreateInternedId(inputStrings[0])).to.equal(0);
		expect(interner.getOrCreateInternedId(inputStrings[0])).to.equal(0);
		expect(interner.getOrCreateInternedId(inputStrings[1])).to.equal(1);
		expect(interner.getOrCreateInternedId(inputStrings[1])).to.equal(1);
	});
});
