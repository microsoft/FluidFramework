/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';

import {
	RestOrArray,
	filter,
	find,
	getOrCreate,
	identity,
	map,
	memoizeGetter,
	reduce,
	unwrapRestOrArray,
} from '../Common.js';

describe('Common', () => {
	it('function memoizeGetter() correctly memoizes', () => {
		let x = 0;
		const getAndInc = () => x++;
		const obj = {
			get getUncached(): number {
				return getAndInc();
			},
			get getCached(): number {
				return memoizeGetter(this, 'getCached', getAndInc());
			},
		};

		expect(obj.getUncached).to.equal(0);
		expect(obj.getUncached).to.equal(1);
		expect(obj.getCached).to.equal(2);
		expect(obj.getCached).to.equal(2); // Cached, no increment
	});

	it('identity function returns its input', () => {
		const inputs = [42, 'test', true];
		for (const input of inputs) {
			expect(identity(input)).to.equal(input);
		}
	});

	describe('getOrCreate', () => {
		it('returns existing values', () => {
			const map = new Map<number, string>();
			const key = 42;
			const value = 'test';
			map.set(key, value);
			expect(getOrCreate(map, key, () => expect.fail('should not call value creator for existing values'))).to.equal(
				value
			);
		});

		it('inserts new values', () => {
			const map = new Map<number, string>();
			const key = 42;
			const value = 'test';
			expect(getOrCreate(map, key, () => value)).to.equal(value);
			expect(map.get(key)).to.equal(value);
		});
	});

	it('maps iterables correctly', () => {
		const inputs = [0, 1, 2, 3];
		const mapper = (n: number) => n * 2;
		expect([...map(inputs, mapper)]).to.deep.equal(inputs.map(mapper));
	});

	it('filters iterables correctly', () => {
		const inputs = [0, 1, 2, 3];
		const predicate = (n: number) => n < 2;
		expect([...filter(inputs, predicate)]).to.deep.equal(inputs.filter(predicate));
	});

	describe('reduces iterables', () => {
		const reducer = (p: number, c: number) => p + c;

		it('that are empty', () => {
			const inputs: number[] = [];
			expect(reduce(inputs, reducer)).to.be.undefined;
		});

		it('that have a single element', () => {
			const inputs = [42];
			expect(reduce(inputs, reducer)).to.equal(inputs.reduce(reducer));
		});

		it('with no initial value', () => {
			const inputs = [0, 1, 2, 3];
			expect(reduce(inputs, reducer)).to.equal(inputs.reduce(reducer));
		});

		it('with an initial value', () => {
			const inputs = [0, 1, 2, 3];
			expect(reduce(inputs, reducer, 42)).to.equal(inputs.reduce(reducer, 42));
		});
	});

	it('finds elements in iterables', () => {
		const inputs = [0, 1, 2, 3];
		const predicateFind = (n: number) => n >= 2;
		expect(find(inputs, predicateFind)).to.equal(inputs.find(predicateFind));
		const predicateNever = (n: number) => n < 0;
		expect(find(inputs, predicateNever)).to.equal(inputs.find(predicateNever));
	});

	describe('unwrapRestOrArray', () => {
		function testUnwrap(...params: RestOrArray<number>): readonly number[] {
			return unwrapRestOrArray(params);
		}
		it('unwraps array arguments', () => {
			const input = [0, 1, 2, 3];
			const result = testUnwrap(input);
			expect(result).to.equal(input);
		});
		it('does not unwrap rest arguments', () => {
			const input = [0, 1, 2, 3];
			const spreadResult = testUnwrap(...input);
			const restResult = testUnwrap(0, 1, 2, 3);
			expect(Array.isArray(spreadResult)).to.equal(true);
			expect(Array.isArray(restResult)).to.equal(true);
			expect(spreadResult.length).to.equal(input.length);
			expect(restResult.length).to.equal(input.length);
		});
	});
});
