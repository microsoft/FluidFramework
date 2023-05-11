/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { FieldKinds, SchemaBuilder, cursorsFromContextualData } from "../../../feature-libraries";

import { SchemaData, lookupGlobalFieldSchema, rootFieldKey } from "../../../core";
import { ISharedTree } from "../../../shared-tree";
import { TestTreeProviderLite } from "../../utils";
import { arraySchema, buildTestSchema } from "./mockData";

export const rootField = SchemaBuilder.field(FieldKinds.value, arraySchema);

type arrayItem = string | number | arrayItem[];

describe("editable-tree: array-like", () => {
	function pretty(arg: any) {
		return arg === undefined
			? "undefined"
			: typeof arg === "number"
			? arg
			: JSON.stringify(arg);
	}

	function prettyArgs(...args: any[]) {
		return args.reduce((prev: string, arg, index) => {
			// If all remaining arguments are 'undefined' elide them.
			if (args.slice(index).findIndex((value) => value !== undefined) === -1) {
				return prev;
			}

			// If not the first argument add a comma separator.
			let next = index > 0 ? `${prev}, ` : prev;

			next += pretty(arg);

			return next;
		}, "");
	}

	function prettyCall(name: string, array: arrayItem[], args: unknown[], expected: unknown) {
		return `${pretty(array)}.${name}(${prettyArgs(...args)}) -> ${pretty(expected)}`;
	}

	function createTree(schema: SchemaData, data?: arrayItem): ISharedTree {
		const provider = new TestTreeProviderLite(1);
		const tree = provider.trees[0];
		assert(tree.isAttached());
		tree.storedSchema.update(schema);

		if (data !== undefined) {
			tree.context.root.insertNodes(
				0,
				cursorsFromContextualData(
					tree.forest.schema,
					lookupGlobalFieldSchema(tree.forest.schema, rootFieldKey),
					data,
				),
			);
		}
		provider.processMessages();
		return tree;
	}

	function createProxy(array: arrayItem[]) {
		const tree = createTree(buildTestSchema(rootField), array);
		const root = tree.root as unknown as arrayItem[];
		return root;
	}

	describe("[Symbol.isConcatSpreadable]", () => {
		it("matches array defaults", () => {
			const proxy = createProxy([]);
			assert.equal(Reflect.get(proxy, Symbol.isConcatSpreadable), true);
			assert.equal(Reflect.has(proxy, Symbol.isConcatSpreadable), false);
		});
	});

	describe("concat()", () => {
		const setSpreadable = (target: any, value: boolean): arrayItem[] => {
			target[Symbol.isConcatSpreadable] = value;
			return target as arrayItem[];
		};

		const unproxy = (target: arrayItem): arrayItem => {
			if (typeof target === "object" && Reflect.has(target, "length")) {
				const array = target as arrayItem[];
				const result = array.map((item) => unproxy(item));

				// Preserve [Symbol.isConcatSpreadable] for deepEquals() comparison.
				const isSpreadable = Reflect.get(array, Symbol.isConcatSpreadable);
				if (isSpreadable !== undefined) {
					Reflect.set(result, Symbol.isConcatSpreadable, isSpreadable);
				}
				return result;
			} else {
				return target;
			}
		};

		const checkLhs = (left: arrayItem[], others: arrayItem[][], spreadable: boolean) => {
			const clone = setSpreadable(left.slice(), spreadable);
			const expected = clone.concat(...others);
			it(prettyCall("concat", left, others, expected), () => {
				const proxy = setSpreadable(createProxy(left), spreadable);
				const actual = proxy.concat(...others);
				assert.deepEqual(unproxy(actual), expected);
			});
		};

		const checkRhs = (left: arrayItem[], others: arrayItem[][], spreadable: boolean) => {
			const clones = others.map((other) => setSpreadable(other.slice(), spreadable));
			const expected = left.concat(...clones);
			it(`${prettyCall("concat", left, others, expected)}`, () => {
				const proxies = others.map((other) =>
					setSpreadable(createProxy(other), spreadable),
				);
				const actual = left.concat(...proxies);
				assert.deepEqual(unproxy(actual), expected);
			});
		};

		const tests = [
			{ left: [], others: [] },
			{ left: [0], others: [] },
			{ left: [0], others: [[1]] },
			{ left: [0, 1], others: [[], [2]] },
			{ left: [0, 1], others: [[2, 3], [4]] },
		];

		describe("spreadable proxy on left", () => {
			for (const { left, others } of tests) {
				checkLhs(left, others, /* spreadable: */ true);
			}
		});

		describe("spreadable proxy on right", () => {
			for (const { left, others } of tests) {
				checkRhs(left, others, /* spreadable: */ true);
			}
		});

		describe("nonspreadable proxy on left", () => {
			for (const { left, others } of tests) {
				checkLhs(left, others, /* spreadable: */ false);
			}
		});

		describe("nonspreadable proxy on right", () => {
			for (const { left, others } of tests) {
				checkRhs(left, others, /* spreadable: */ false);
			}
		});
	});

	describe("slice()", () => {
		const check = (array: arrayItem[], start?: number, end?: number) => {
			const expected = array.slice(start, end);
			it(`${prettyCall("slice", array, [start, end], expected)}`, () => {
				const proxy = createProxy(array);
				const actual = proxy.slice(start, end);
				assert.deepEqual(actual, expected);
			});
		};

		check([]);
		check([0]);
		check([0, 1]);
		check([0, 1], -Infinity);
		check([0, 1], 0, Infinity);
		for (let i = 0; i < 4; i++) {
			check([0, 1], i);
			check([0, 1], -i);
			check([0, 1], 0, i);
			check([0, 1], 0, -i);
		}
	});

	describe("iterative function", () => {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const lowerA = "a".codePointAt(0)!;
		const predicate = (value: arrayItem, index: number) =>
			value === String.fromCharCode(lowerA + index);

		const tests = [[], ["a"], ["a", "b"], ["c", "b"], ["a", "c"]];

		function checkIterativeFn(
			actualFn: (
				target: arrayItem[],
				callback: (...args: any[]) => unknown,
				thisArg?: unknown,
			) => unknown,
			expectedFn: (
				target: arrayItem[],
				callback: (...args: any[]) => unknown,
				thisArg?: unknown,
			) => unknown,
			callback: (...args: any[]) => unknown = predicate,
		) {
			// Wraps the callback function to log the values of 'this', 'value', and 'index',
			// which are expected to be identical between a true JS array and our array-like proxy.
			const logCalls = (expectedArray: arrayItem[], log: unknown[][]) => {
				return function (...args: unknown[]) {
					const result = callback(...args);

					// To simplify comparing the logged arguments we verify the 'array' parameter as we go.
					const actualArray = args.pop();
					assert.equal(
						actualArray,
						expectedArray,
						"The last argument of an iterative function callback must be the array instance.",
					);

					log.push(args);
					return result;
				};
			};

			return (array: (string | number)[]) => {
				const thisArg = [undefined, "this"][array.length % 2];
				const expected = array.slice();
				const expectedArgs: unknown[][] = [];
				const expectedResult = expectedFn(
					expected,
					logCalls(expected, expectedArgs),
					thisArg,
				);

				it(`${pretty(array)} -> ${pretty(expectedResult)}:${pretty(expectedArgs)}`, () => {
					const proxy = createProxy(array);
					const actualArgs: unknown[][] = [];
					const actualResult = actualFn(proxy, logCalls(proxy, actualArgs), thisArg);

					const actual = proxy.slice();
					assert.deepEqual(actual, expected);
					assert.deepEqual(actualResult, expectedResult);
					assert.deepEqual(actualArgs, expectedArgs);
				});
			};
		}

		describe("every()", () => {
			const check = checkIterativeFn(
				(actual, callback) => actual.every(callback),
				(expected, callback) => expected.every(callback),
			);

			tests.forEach(check);
		});

		describe("filter()", () => {
			const check = checkIterativeFn(
				(actual, callback) => actual.filter(callback),
				(expected, callback) => expected.filter(callback),
			);

			tests.forEach(check);
		});

		describe("find()", () => {
			const check = checkIterativeFn(
				(actual, callback) => actual.find(callback),
				(expected, callback) => expected.find(callback),
			);

			tests.forEach(check);
		});

		describe("findIndex()", () => {
			const check = checkIterativeFn(
				(actual, callback) => actual.findIndex(callback),
				(expected, callback) => expected.findIndex(callback),
			);

			tests.forEach(check);
		});

		describe("forEach()", () => {
			const check = checkIterativeFn(
				(actual, callback) => actual.forEach(callback),
				(expected, callback) => expected.forEach(callback),
			);

			tests.forEach(check);
		});

		describe("map()", () => {
			const check = checkIterativeFn(
				(actual, callback) => actual.map(callback),
				(expected, callback) => expected.map(callback),
			);

			tests.forEach(check);
		});

		describe("reduce()", () => {
			const check = checkIterativeFn(
				(actual, callback) => actual.reduce(callback, []),
				(expected, callback) => expected.reduce(callback, []),
				(previous: arrayItem[], value, index) => {
					previous.push(value);
					previous.push(index);
					return previous;
				},
			);

			[[], ["a"], ["a", "b"]].forEach(check);
		});

		describe("reduceRight()", () => {
			const check = checkIterativeFn(
				(actual, callback) => actual.reduceRight(callback, []),
				(expected, callback) => expected.reduceRight(callback, []),
				(previous: arrayItem[], value, index) => {
					previous.push(value);
					previous.push(index);
					return previous;
				},
			);

			[[], ["a"], ["a", "b"]].forEach(check);
		});
	});

	const invokeSearchFn = (
		fn: (..._: any[]) => unknown,
		args: any[],
		start: undefined | number,
	) => {
		// Several of the non-iterative Array search functions accept an optional 'fromIndex'
		// as the last paramater.  Unfortunately, applying the 'to integer' conversion steps
		// coerces an explicitly undefined value to '0'.
		//
		// For 'includes' and 'indexOf', this is mostly benign since the default behavior is
		// to start the search from 0.  For 'lastIndexOf' this results in only searching the
		// zeroth element.
		return start === undefined ? fn(...args) : fn(...args, start);
	};

	describe("includes()", () => {
		const check = (array: arrayItem[], item: arrayItem, start?: number) => {
			const expected = invokeSearchFn(array.includes.bind(array), [item], start);
			it(prettyCall("includes", array, [item, start], expected), () => {
				const proxy = createProxy(array);
				const actual = invokeSearchFn(proxy.includes.bind(proxy), [item], start);
				assert.deepEqual(actual, expected);
			});
		};

		check([], "a");
		check(["a", "b"], "a");
		check(["a", "b"], "b");
		check(["a", "b"], "a", /* start: */ 1);
		check(["a", "b"], "a", /* start: */ -1);
		check(["a", "b"], "b", /* start: */ -1);
		check(["a", "b"], "a", /* start: */ -2);
		check(["a", "b"], "a", /* start: */ Infinity);
		check(["a", "b"], "a", /* start: */ -Infinity);
	});

	describe("indexOf()", () => {
		const check = (array: arrayItem[], item: arrayItem, start?: number) => {
			const expected = invokeSearchFn(array.indexOf.bind(array), [item], start);
			it(prettyCall("indexOf", array, [item, start], expected), () => {
				const proxy = createProxy(array);
				const actual = invokeSearchFn(proxy.indexOf.bind(proxy), [item], start);
				assert.deepEqual(actual, expected);
			});
		};

		check([], "a");
		check(["a", "a"], "a");
		check(["a", "b"], "a");
		check(["a", "b"], "b");
		check(["a", "b"], "a", /* start: */ 1);
		check(["a", "b"], "a", /* start: */ -1);
		check(["a", "b"], "b", /* start: */ -1);
		check(["a", "b"], "a", /* start: */ -2);
		check(["a", "b"], "a", /* start: */ Infinity);
		check(["a", "b"], "a", /* start: */ -Infinity);
	});

	describe("join()", () => {
		const check = (array: arrayItem[], separator?: string) => {
			const expected = array.join(separator);
			it(prettyCall("join", array, [separator], expected), () => {
				const proxy = createProxy(array);
				const actual = proxy.join(separator);
				assert.deepEqual(actual, expected);
			});
		};

		check([]);
		check([0]);
		check([0, 1]);
		check([0, 1, 2], ":");
	});

	describe("keys()", () => {
		const check = (array: arrayItem[]) => {
			const expected = array.keys();
			it(prettyCall("keys", array, [], expected), () => {
				const proxy = createProxy(array);
				const actual = proxy.keys();
				assert.deepEqual(actual, expected);
			});
		};

		check([]);
		check(["a"]);
		check(["a", "b"]);
	});

	describe("push()", () => {
		const check = (array: arrayItem[], ...items: arrayItem[]) => {
			const expected = array.slice();
			const expectedLength = expected.push(...items);
			it(prettyCall("push", array, items, expected), () => {
				const proxy = createProxy(array);
				const actualLength = proxy.push(...items);
				const actual = proxy.slice();

				assert.deepEqual(actual, expected);
				assert.deepEqual(actualLength, expectedLength);
			});
		};

		check([]);
		check([], 1);
		check([], 1, 2);
		check([0], 1, 2);
		check([0, 1], 2);
	});

	describe("lastIndexOf()", () => {
		const check = (array: arrayItem[], item: arrayItem, start?: number) => {
			const expected = invokeSearchFn(array.lastIndexOf.bind(array), [item], start);
			it(prettyCall("lastIndexOf", array, [item, start], expected), () => {
				const proxy = createProxy(array);
				const actual = invokeSearchFn(proxy.lastIndexOf.bind(proxy), [item], start);
				assert.deepEqual(actual, expected);
			});
		};

		check([], "a");
		check(["a", "a"], "a");
		check(["a", "b"], "a");
		check(["a", "b"], "b");
		check(["a", "b"], "a", /* start: */ 1);
		check(["a", "b"], "a", /* start: */ -1);
		check(["a", "b"], "b", /* start: */ -1);
		check(["a", "b"], "a", /* start: */ -2);
		check(["a", "b"], "a", /* start: */ Infinity);
		check(["a", "b"], "a", /* start: */ -Infinity);
	});

	describe("some()", () => {
		const check = (array: arrayItem[]) => {
			const predicate = (value: arrayItem, index: number) => value === index;
			const expected = array.some(predicate);
			it(prettyCall("some", array, [predicate], expected), () => {
				const proxy = createProxy(array);
				const actual = proxy.some(predicate);
				assert.deepEqual(actual, expected);
			});
		};

		[[], [0], [1], [1, 2], [1, 2, 2]].forEach(check);
	});

	// describe("splice()", () => {
	// 	const check = (
	// 		array: arrayItem[],
	// 		start: number,
	// 		deleteCount: number,
	// 		...toInsert: arrayItem[]
	// 	) => {
	// 		const expected = array.slice().splice(start, deleteCount, ...toInsert);
	// 		it(prettyCall("some", array, [start, deleteCount, ...toInsert], expected), () => {
	// 			const proxy = createProxy(array);
	// 			const actual = proxy.splice(start, deleteCount, ...toInsert);
	// 			assert.deepEqual(actual, expected);
	// 		});
	// 	};

	// 	check([], /* start: */ 0, /* deleteCount: */ 0);
	// 	check([], /* start: */ 0, /* deleteCount: */ 0, "a");
	// 	check([], /* start: */ 0, /* deleteCount: */ 0, "a", "b");
	// 	check(["a"], /* start: */ 0, /* deleteCount: */ 0);
	// 	check(["a"], /* start: */ 0, /* deleteCount: */ 1);
	// 	check(["a"], /* start: */ 0, /* deleteCount: */ 1, "b");
	// });

	describe("toLocaleString()", () => {
		const check = (array: arrayItem[]) => {
			const expected = array.toLocaleString();
			it(prettyCall("toLocaleString", array, [], expected), () => {
				const proxy = createProxy(array);
				const actual = proxy.toLocaleString();
				assert.deepEqual(actual, expected);
			});
		};

		// TODO: Pass explicit locale when permitted by TS lib.
		// For now, the results should at least be conistent on the same machine.
		// In 'en' locale, we're expecting to see a comma thousands separator.
		[[1000, 2000, 3000]].forEach(check);
	});

	describe("toString()", () => {
		const check = (array: arrayItem[]) => {
			const expected = array.toString();
			it(prettyCall("toString", array, [], expected), () => {
				const proxy = createProxy(array);
				const actual = proxy.toString();
				assert.deepEqual(actual, expected);
			});
		};

		// We do not expect to see a thousands separator.
		[[1000, 2000, 3000]].forEach(check);
	});

	// describe("unshift()", () => {
	// 	const check = (array: arrayItem[], ...items: arrayItem[]) => {
	// 		const expected = array.slice();
	// 		const expectedLength = expected.unshift(...items);
	// 		it(prettyCall("unshift", array, items, expected), () => {
	// 			const proxy = createProxy(array);
	// 			const actualLength = proxy.unshift(...items);
	// 			const actual = proxy.slice();

	// 			assert.deepEqual(actual, expected);
	// 			assert.deepEqual(actualLength, expectedLength);
	// 		});
	// 	};

	// 	check([]);
	// 	check([], 1);
	// 	check([], 1, 2);
	// 	check([0], 1, 2);
	// 	check([0, 1], 2);
	// });

	describe("values()", () => {
		const check = (array: arrayItem[]) => {
			const expected = array.values();
			it(prettyCall("values", array, [], expected), () => {
				const proxy = createProxy(array);
				const actual = proxy.values();
				assert.deepEqual(actual, expected);
			});
		};

		check([]);
		check(["a"]);
		check(["a", "b"]);
	});
});
