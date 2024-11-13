/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { DiscriminatedUnionDispatcher } from "../../../../codec/index.js";
import {
	Counter,
	getChecked,
	jsonMinimizingFilter,
	readStream,
	readStreamNumber,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkCodecUtilities.js";
import { makeArray } from "../../../../util/index.js";

describe("chunkEncodingUtilities", () => {
	describe("counter", () => {
		it("minimal", () => {
			const counter = new Counter<string>();
			const emptyTable = counter.buildTable();
			assert.deepEqual(emptyTable, {
				valueToIndex: new Map(),
				indexToValue: [],
			});
		});

		it("usage", () => {
			const counter = new Counter<string>();
			counter.add("a", 1);
			counter.add("b", 3);
			counter.add("c");
			counter.add("c");

			const log: unknown[] = [];

			const table = counter.buildTable((s, v, c) => {
				log.push([s, v, c]);
				return true;
			});

			assert.deepEqual(log, [
				["b", 0, 3],
				["c", 1, 2],
				["a", 2, 1],
			]);
			assert.deepEqual(table, {
				valueToIndex: new Map([
					["b", 0],
					["c", 1],
					["a", 2],
				]),
				indexToValue: ["b", "c", "a"],
			});
		});

		it("filtering", () => {
			const counter = new Counter<string>();
			counter.add("a", 1);
			counter.add("b", 2);
			counter.add("c", 3);

			// Filter in
			{
				const log: unknown[] = [];
				const table = counter.buildTable((s, v, c) => {
					log.push([s, v, c]);
					return true;
				});

				assert.deepEqual(log, [
					["c", 0, 3],
					["b", 1, 2],
					["a", 2, 1],
				]);
				assert.deepEqual(table.indexToValue, ["c", "b", "a"]);
			}

			// Filter out
			{
				const log: unknown[] = [];
				const table = counter.buildTable((s, v, c) => {
					log.push([s, v, c]);
					return false;
				});

				assert.deepEqual(log, [
					["c", 0, 3],
					["b", 0, 2],
					["a", 0, 1],
				]);
				assert.deepEqual(table.indexToValue, []);
			}

			// Filter some
			{
				const log: unknown[] = [];
				const table = counter.buildTable((s, v, c) => {
					log.push([s, v, c]);
					return s === "b";
				});

				assert.deepEqual(log, [
					["c", 0, 3],
					["b", 0, 2],
					["a", 1, 1],
				]);
				assert.deepEqual(table.indexToValue, ["b"]);
			}
		});
	});

	describe("jsonMinimizingFilter", () => {
		// Produce actual JSON and confirm jsonMinimizingFilter minimizes for the provided value.
		function check(s: string, value: number, count: number, require?: boolean): void {
			const notReplacedObject = { table: ["default"], data: makeArray(count, () => s) };
			const replacedObject = { table: ["default", s], data: makeArray(count, () => value) };
			const notReplaced = JSON.stringify(notReplacedObject);
			const replaced = JSON.stringify(replacedObject);
			const shouldReplace = replaced.length < notReplaced.length;
			const result = jsonMinimizingFilter(s, value, count);
			assert.equal(result, shouldReplace);
			if (require !== undefined) {
				assert.equal(result, require);
			}
		}
		it("1 instance is never replaced", () => {
			check("", 0, 1, false);
			check("xxx", 0, 1, false);
			check("x", 10000, 1, false);
		});
		it("2 instances replaced iff long enough", () => {
			// Check that small string is not replaced
			check("", 0, 2, false);
			// Check that long string is replaced
			check("aaaaaaaa", 0, 2, true);
			// Check that various lengths behave as expected
			let s = "";
			for (let index = 0; index < 20; index++) {
				s = `${s}x`;
				check(s, 0, 2);
			}
		});

		it("check that escaping is accounted for", () => {
			check("xx", 100, 5, false);
			check('""', 100, 5, true);
		});

		it("check that value is used properly", () => {
			check("xx", 1, 5, true);
			check("xx", 100, 2, false);
			check("xx", 100, 10, true);
			check("xx", 1000, 5, false);
			check("xx", 1000, 10000, false);
			check("xxx", 1000, 10000, true);
		});
	});

	it("getChecked", () => {
		assert.throws(() => getChecked([], 0));
		assert.equal(getChecked([1], 0), 1);
		assert.throws(() => getChecked([1], 1));
	});

	it("stream", () => {
		assert.throws(() => readStream({ data: [], offset: 0 }));
		assert.throws(() => readStream({ data: [1], offset: 1 }));
		assert.throws(() => readStreamNumber({ data: ["x"], offset: 0 }));

		{
			const stream = { data: ["x"], offset: 0 };
			assert.equal(readStream(stream), "x");
			assert.equal(stream.offset, 1);
		}
		{
			const stream = { data: [5], offset: 0 };
			assert.equal(readStreamNumber(stream), 5);
			assert.equal(stream.offset, 1);
		}
	});

	describe("DiscriminatedUnionDispatcher", () => {
		it("Usage", () => {
			interface TestUnion {
				a?: 1;
				b?: 2;
				c?: 3;
			}
			const log: [number, number, number][] = [];
			const dispatcher = new DiscriminatedUnionDispatcher<TestUnion, [number], number>({
				a(v: 1, n: number): number {
					log.push([1, v, n]);
					return n;
				},
				b(v: 2, n: number): number {
					log.push([2, v, n]);
					return n;
				},
				c(v: 3, n: number): number {
					log.push([3, v, n]);
					return n;
				},
			});

			assert.equal(dispatcher.dispatch({ a: 1 }, 5), 5);
			assert.equal(dispatcher.dispatch({ b: 2 }, 0), 0);

			assert.deepEqual(log, [
				[1, 1, 5],
				[2, 2, 0],
			]);

			// @ts-expect-error Check that invalid parameters do not compile
			dispatcher.dispatch({ b: 1 }, 5);
		});
	});
});
