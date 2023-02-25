/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { findToken, TokenList } from "../util";

describe("TokenList", () => {
	describe("findToken", () => {
		it("empty", () => {
			const actual = findToken("", "a");
			assert.strictEqual(actual, undefined);
		});

		it("ignore partial match", () => {
			const actual = findToken("a", "aa");
			assert.strictEqual(actual, undefined);
		});

		it("resume after discarding prefix match", () => {
			const actual = findToken("aa a", "a");
			assert.deepStrictEqual(actual, { start: 3, end: 4 });
		});

		it("resume after discarding suffix match", () => {
			const actual = findToken("ba a", "a");
			assert.deepStrictEqual(actual, { start: 3, end: 4 });
		});

		it("match single token", () => {
			const actual = findToken("a", "a");
			assert.deepStrictEqual(actual, { start: 0, end: 1 });
		});

		it("match first token", () => {
			const actual = findToken("a b", "a");
			assert.deepStrictEqual(actual, { start: 0, end: 1 });
		});

		it("match last token", () => {
			const actual = findToken("a b", "b");
			assert.deepStrictEqual(actual, { start: 2, end: 3 });
		});

		it("match middle token", () => {
			const actual = findToken("a b c", "b");
			assert.deepStrictEqual(actual, { start: 2, end: 3 });
		});
	});

	describe("set", () => {
		function test(tokens: string[], token: string) {
			const tokenList = tokens.join(" ");
			tokens.push(token);
			const expected = tokens.join(" ");

			it(`'${tokenList}' + '${token}' -> '${expected}'`, () => {
				const actual = TokenList.set(tokenList, token);
				assert.strictEqual(actual, expected);
			});
		}

		test([], "a");
		test(["a"], "b");

		it("duplicate: 'a b' + 'a' -> 'a b'", () => {
			const actual = TokenList.set("a b", "a");
			assert.deepStrictEqual(actual, "a b");
		});

		it("undefined 'a' -> 'a'", () => {
			const actual = TokenList.set(undefined, "a");
			assert.deepStrictEqual(actual, "a");
		});

		it("'a' undefined -> 'a'", () => {
			const actual = TokenList.set(undefined, "a");
			assert.deepStrictEqual(actual, "a");
		});

		it("undefined undefined -> undefined", () => {
			const actual = TokenList.set(undefined, undefined);
			assert.deepStrictEqual(actual, undefined);
		});

		it("'' '' -> ''", () => {
			const actual = TokenList.set("", "");
			assert.deepStrictEqual(actual, "");
		});
	});

	describe("unset", () => {
		function test(tokens: string[], token: string) {
			const tokenList = tokens.join(" ");
			const toRemove = tokens.indexOf(token);
			if (toRemove >= 0) {
				tokens.splice(toRemove, 1);
			}
			const expected = tokens.join(" ");

			it(`'${tokenList}' - '${token}' -> '${expected}'`, () => {
				const actual = TokenList.unset(tokenList, token);
				assert.strictEqual(actual, expected);
			});
		}

		test([], "a");
		test(["a"], "a");
		test(["a", "b"], "a");
		test(["aa", "bb"], "a");
		test(["aa", "bb"], "aa");
		test(["a", "b"], "b");
		test(["aa", "bb"], "b");
		test(["aa", "bb"], "bb");
		test(["a", "b", "c"], "b");
		test(["aa", "bb", "cc"], "b");
		test(["aa", "bb", "cc"], "bb");
	});

	describe("computeToggle", () => {
		function test(testCase: string, tokens: string[], toToggle: string[]) {
			const tokenList = tokens.join(" ");
			const expectedAdd = toToggle.filter((token) => !tokens.includes(token));
			const expectedRemove = toToggle.filter((token) => tokens.includes(token));

			it(`${testCase}: [${tokenList}] ^ [${toToggle.join(" ")}] -> +[${expectedAdd.join(
				" ",
			)}] -[${expectedRemove.join(" ")}]`, () => {
				const actualAdd = toToggle;
				const actualRemove = new Set<string>();

				TokenList.computeToggle(tokenList, actualAdd, actualRemove);

				assert.deepEqual(actualAdd, expectedAdd);
				assert.deepEqual([...actualRemove], expectedRemove);
			});
		}

		test("empty", [], []);
		test("new in empty", [], ["a"]);
		test("single in set", ["a"], ["a"]);
		test("single not in set", ["a"], ["b"]);
		test("first in set", ["a", "b"], ["a"]);
		test("last in set", ["a", "b"], ["b"]);
		test("middle in set", ["a", "b", "c"], ["b"]);
		test("mixed", ["a", "b"], ["b", "c"]);

		it("undefined: undefined ^ [a -b] -> +[a] -[b]", () => {
			const toAdd = ["a"];
			const toRemove = new Set(["b"]);
			TokenList.computeToggle(undefined, toAdd, toRemove);
			assert.deepStrictEqual(toAdd, ["a"]);
			assert.deepStrictEqual([...toRemove.keys()], ["b"]);
		});
	});
});
