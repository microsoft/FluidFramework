/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory } from "../../simple-tree/index.js";

import { hydrate, pretty } from "./utils.js";

const schemaFactory = new SchemaFactory("test");

describe("List", () => {
	/** Formats 'args' array, inserting commas and eliding trailing `undefine`s.  */
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

	/** Creates test case titles that resemble function calls: `<array>.[name](..args..) -> <expected>` */
	function prettyCall(
		name: string,
		array: readonly unknown[],
		args: readonly unknown[],
		expected: unknown,
	) {
		return `${pretty(array)}.${name}(${prettyArgs(...args)}) -> ${pretty(expected)}`;
	}

	/** Helper that creates an array of the given length, populating it with ["A", "B", ..etc..] */
	function createArray(length: number): string[] {
		return Array.from({ length }, (_, i) => String.fromCodePoint(0x41 + i));
	}

	/** Helper that creates a new List<number> proxy */
	function createNumberList(items: readonly number[]) {
		const list = hydrate(schemaFactory.array(schemaFactory.number), items);
		assert.deepEqual(list, items);
		return list;
	}

	/** Helper that creates a new List<string> proxy */
	function createStringList(items: readonly string[]) {
		const list = hydrate(schemaFactory.array(schemaFactory.string), items);
		assert.deepEqual(list, items);
		return list;
	}

	describe("implements 'readonly T[]'", () => {
		describe("is Array", () => {
			// Ensure that invoking 'fn' on an array-like subject returns the same result
			// as invoking 'fn' on a true JS array.
			//
			// The optional 'init' parameter provides an initial state, otherwise both are empty.
			function test0<U>(
				name: string,
				fn: (subject: readonly string[]) => U,
				init?: readonly string[],
			) {
				const array = init ?? [];
				const expected = fn(array);

				it(`${name}(${pretty(array)}) -> ${pretty(expected)}`, () => {
					const actual = fn(createStringList(array));
					assert.deepEqual(actual, expected);
				});
			}

			// Array.isArray is the modern way to detect arrays.
			test0("Array.isArray", (target: unknown) => Array.isArray(target));

			// The ECMAScript Standard recommends using Object.prototype.toString to detect
			// the class of an object.  Prior to ES5's introduction of Array.isArray, this
			// was the preferred way to detect Arrays.
			//
			// Note that Object.prototype.toString is different than Array.prototype.toString.
			// The former returns '[object Array]' while the later returns a comma separated
			// list of the array's elements.
			test0("Object.prototype.toString", (target: unknown) =>
				Object.prototype.toString.call(target),
			);

			// An older technique for detecting arrays is to use the 'instanceof' operator.
			// However, this is not reliable in the presence of multiple global contexts (e.g.,
			// if an Array is passed across frame boundaries.)
			// eslint-disable-next-line unicorn/no-instanceof-array
			test0("instanceof Array", (target: unknown) => target instanceof Array);

			// 'deepEquals' requires that objects have the same prototype to be considered equal.
			test0(
				"Object.getPrototypeOf",
				(target: unknown) => Object.getPrototypeOf(target) as unknown,
			);

			// 'deepEquals' enumerates and compares the own properties of objects.
			describe("Object.getOwnPropertyDescriptors", () => {
				for (let n = 0; n < 3; n++) {
					test0(
						"Object.getOwnPropertyDescriptors",
						(target) => {
							return Object.getOwnPropertyDescriptors(target);
						},
						createArray(n),
					);
				}
			});
		});

		// Ensure that invoking 'fn' on an array-like subject returns the same result
		// as invoking 'fn' on a true JS array.
		//
		// The optional 'init' parameter provides an initial state, otherwise both are empty.
		function test1<U>(fn: (subject: readonly string[]) => U, init?: readonly string[]) {
			const array = init ?? [];
			const expected = fn(array);
			it(`${pretty(array)} -> ${pretty(expected)}`, () => {
				const actual = fn(createStringList(array));
				assert.deepEqual(actual, expected);
			});
		}

		describe("Array.length", () => {
			for (let n = 0; n < 3; n++) {
				test1((subject) => subject.length, createArray(n));
			}
		});

		describe("Object.keys", () => {
			for (let n = 0; n < 3; n++) {
				test1((subject) => Object.keys(subject), createArray(n));
			}
		});

		describe("Object.values", () => {
			for (let n = 0; n < 3; n++) {
				test1((subject) => Object.values(subject), createArray(n));
			}
		});

		describe("Object.entries", () => {
			for (let n = 0; n < 3; n++) {
				test1((subject) => Object.entries(subject), createArray(n));
			}
		});

		// Enumerates values
		describe("for...of", () => {
			for (let n = 0; n < 3; n++) {
				test1((subject) => {
					const result: string[] = [];
					for (const item of subject) {
						result.push(item);
					}
					return result;
				}, createArray(n));
			}
		});

		// Enumerates keys configured as 'enumerable: true' (both own and inherited.)
		describe("for...in", () => {
			for (let n = 0; n < 3; n++) {
				test1((subject) => {
					const result: string[] = [];
					// eslint-disable-next-line @typescript-eslint/no-for-in-array, no-restricted-syntax, guard-for-in -- compatibility test
					for (const key in subject) {
						// For compatibility, we intentionally do not guard against inherited properties.
						result.push(key);
					}
					return result;
				}, createArray(n));
			}
		});

		describe("[index: number]", () => {
			const check = (length: number, index: number) => {
				test1((subject) => subject[index], createArray(length));
			};

			check(/* length: */ 0, /* index: */ 0);
			check(/* length: */ 0, /* index: */ -1);
			check(/* length: */ 1, /* index: */ 0);
			check(/* length: */ 1, /* index: */ -1);
			check(/* length: */ 2, /* index: */ 0);
			check(/* length: */ 2, /* index: */ 1);
			check(/* length: */ 2, /* index: */ -2);
			check(/* length: */ 2, /* index: */ Number.POSITIVE_INFINITY);
			check(/* length: */ 2, /* index: */ Number.NEGATIVE_INFINITY);
		});

		describe("[Symbol.isConcatSpreadable] matches array defaults", () => {
			test1((subject) => {
				// Capture the value of [Symbol.isConcatSpreadable].  The returned object will be compared
				// via 'deepEquals' by 'test1()'.
				return {
					hasConcatSpreadable: Reflect.has(subject, Symbol.isConcatSpreadable),
					isConcatSpreadable: Reflect.get(subject, Symbol.isConcatSpreadable),
				};
			});
		});

		describe("Array.prototype functions", () => {
			const noInit = (target: readonly string[]) => target;

			// Ensure that invoking 'fnName' on an array-like subject returns the same result
			// as invoking the same function on a true JS array.
			//
			// 'fnName' is the name of the Array.prototype function to invoke (e.g., 'concat').
			// The function is invoked in two ways:
			//
			// 1. As a method on the subject (e.g., 'subject.concat(...args)').
			// 2. As a method on Array.prototype (e.g., 'Array.prototype.concat.call(subject, ...args)').
			//
			// The results of both are compared to the result of invoking the same function on a true JS array.
			//
			// The optional 'init' parameter provides an initial state, otherwise both are empty.
			function test2(
				fnName: string,
				array: readonly string[],
				init = noInit,
				...args: unknown[]
			) {
				const expectedFn = Reflect.get(array, fnName) as (...args: unknown[]) => unknown;
				const expected = expectedFn.call(init(array.slice()), ...args);

				function innerTest(subject: readonly string[], fnSource: readonly string[]) {
					const fn = Reflect.get(fnSource, fnName) as (...args: unknown[]) => unknown;
					const actual = fn.call(subject, ...args);
					assert.deepEqual(actual, expected);
				}

				it(`${pretty(array)}.${fnName}(${prettyArgs(...args)}) -> ${pretty(expected)}`, () => {
					const subject = init(createStringList(array));
					innerTest(subject, subject);
				});

				it(`Array.prototype.${fnName}.call(${prettyArgs(array, ...args)}) -> ${pretty(
					expected,
				)}`, () => {
					const subject = createStringList(array);
					innerTest(subject, Array.prototype);
				});
			}

			// TODO: The List proxy implement does not currently allow [Symbol.isConcatSpreadable] to be set.
			//       This will need to be fixed before we can pass the suite of 'concat' tests.
			//       (Otherwise, concat() works as expected with the default isConcatSpreadable behavior.)
			describe.skip("concat()", () => {
				const setSpreadable = (
					target: readonly string[],
					value: boolean,
				): readonly string[] => {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(target as any)[Symbol.isConcatSpreadable] = value;

					assert.equal(
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						(target as any)[Symbol.isConcatSpreadable],
						value,
						"[Symbol.isConcatSpreadable] must be settable",
					);

					assert.deepEqual(
						Object.getOwnPropertyDescriptor(target, Symbol.isConcatSpreadable),
						{
							value,
							writable: true,
							enumerable: true,
							configurable: true,
						},
						"[Symbol.isConcatSpreadable] property descriptor must match array.",
					);

					return target;
				};

				const checkLhs = (
					left: readonly string[],
					others: readonly string[][],
					spreadable: boolean,
				) => {
					test2("concat", left, (array) => setSpreadable(array, spreadable), others);
				};

				const checkRhs = (left: string[], others: string[][], spreadable: boolean) => {
					const clones = others.map((other) => setSpreadable(other.slice(), spreadable));
					const expected = left.concat(...clones);
					it(`${prettyCall("concat", left, others, expected)}`, () => {
						const proxies = others.map((other) =>
							setSpreadable(createStringList(other), spreadable),
						);
						const actual = left.concat(...proxies);
						assert.deepEqual(actual, expected);
					});
				};

				const tests = [
					{ left: [], others: [] },
					{ left: ["a"], others: [] },
					{ left: ["a"], others: [["b"]] },
					{ left: ["a", "b"], others: [[], ["c"]] },
					{ left: ["a", "b"], others: [["c", "d"], ["e"]] },
				];

				describe("spreadable subject on left", () => {
					for (const { left, others } of tests) {
						checkLhs(left, others, /* spreadable: */ true);
					}
				});

				describe("spreadable subject on right", () => {
					for (const { left, others } of tests) {
						checkRhs(left, others, /* spreadable: */ true);
					}
				});

				describe("nonspreadable subject on left", () => {
					for (const { left, others } of tests) {
						checkLhs(left, others, /* spreadable: */ false);
					}
				});

				describe("nonspreadable subject on right", () => {
					for (const { left, others } of tests) {
						checkRhs(left, others, /* spreadable: */ false);
					}
				});
			});

			describe("slice()", () => {
				const check = (array: readonly string[], start?: number, end?: number) => {
					test2("slice", array, noInit, start, end);
				};

				check([]);
				check(["a"]);
				check(["a", "b"]);
				check(["a", "b"], Number.NEGATIVE_INFINITY);
				check(["a", "b"], 0, Number.POSITIVE_INFINITY);

				for (let i = 0; i < 4; i++) {
					check(["a", "b"], i);
					check(["a", "b"], -i);
					check(["a", "b"], 0, i);
					check(["a", "b"], 0, -i);
				}
			});

			// Iterative functions are those that accept a callback with (value, index, array) parameters,
			// such as 'map' and 'forEach'.
			describe("iterative function", () => {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const lowerA = "a".codePointAt(0)!;
				const predicate = (value: unknown, index: number) =>
					value === String.fromCharCode(lowerA + index);

				const tests = [[], ["a"], ["a", "b"], ["c", "b"], ["a", "c"]];

				type IterativeFn = (callback: (...args: any[]) => unknown, ...args: any[]) => unknown;

				// Ensure that invoking 'fnName' on an array-like subject returns the same result
				// as invoking the same function on a true JS array.  This test helper also logs
				// and checks the (this, value, index, array) arguments provided to the callback.
				//
				// 'fnName' is the name of the Array.prototype function to invoke (e.g., 'concat').
				// The function is invoked in two ways:
				//
				// 1. As a method on the subject (e.g., 'subject.concat(...args)').
				// 2. As a method on Array.prototype (e.g., 'Array.prototype.concat.call(subject, ...args)').
				//
				// The results of both are compared to the result of invoking the same function on a true JS array.
				//
				// The optional 'init' parameter provides an initial state, otherwise both are empty.
				function test3(fnName: string, callback: (...args: any[]) => unknown = predicate) {
					// Wraps the callback function to log the values of 'this', 'value', and 'index',
					// which are expected to be identical between a true JS array and our array-like subject.
					const logCalls = (expectedArrayParam: readonly string[], log: unknown[][]) => {
						return function (...args: any[]) {
							const result = callback(...args);

							// Other than the 'array' parameter, the arguments should be identical.  To make
							// comparison with 'deepEquals' easy, we check and remove the 'array' parameter
							// as we go.
							const actualArrayParam = args.pop();
							assert.equal(
								actualArrayParam,
								expectedArrayParam,
								"The last argument of an iterative function callback must be the array instance.",
							);

							log.push(args);
							return result;
						};
					};

					return (array: readonly string[], ...otherArgs: unknown[]) => {
						// Compute the expected result and log the expected arguments to the callback.
						const expected = array.slice();
						const expectedFn = Reflect.get(expected, fnName) as IterativeFn;
						const expectedArgs: unknown[][] = [];
						const expectedResult = expectedFn.apply(expected, [
							logCalls(expected, expectedArgs),
							...otherArgs,
						]);

						// Check the actual result and compare the actual arguments to the callback.
						function innerTest(subject: readonly string[], fnSource: readonly string[]) {
							const actualFn = Reflect.get(fnSource, fnName) as (
								callback: (...args: any[]) => unknown,
								...args: any[]
							) => unknown;
							const actualArgs: unknown[][] = [];
							const actualResult = actualFn.apply(subject, [
								logCalls(subject, actualArgs),
								...otherArgs,
							]);

							const actual = subject.slice();
							assert.deepEqual(actual, expected);
							assert.deepEqual(actualResult, expectedResult);
							assert.deepEqual(actualArgs, expectedArgs);
						}

						it(`${pretty(array)}.${fnName}(callback, ${prettyArgs(otherArgs)}) -> ${pretty(
							expectedResult,
						)}:${pretty(expectedArgs)}`, () => {
							const subject = createStringList(array);
							innerTest(subject, subject);
						});

						it(`Array.prototype.${fnName}.call(${prettyArgs(array, ...otherArgs)}) -> ${pretty(
							expected,
						)}`, () => {
							innerTest(createStringList(array), Array.prototype);
						});
					};
				}

				describe("every()", () => {
					const check = test3("every");

					tests.forEach(check);
				});

				describe("filter()", () => {
					const check = test3("filter");

					tests.forEach(check);
				});

				describe("find()", () => {
					const check = test3("find");

					tests.forEach(check);
				});

				describe("findIndex()", () => {
					const check = test3("findIndex");

					tests.forEach(check);
				});

				describe("forEach()", () => {
					const check = test3("forEach");

					tests.forEach(check);
				});

				describe("map()", () => {
					const check = test3("map");

					tests.forEach(check);
				});

				describe("reduce()", () => {
					const check = test3("reduce", (previous: unknown[], value, index) => {
						return previous.concat(value, index);
					});

					[[], ["a"], ["a", "b"]].forEach((init) => check(init, []));
				});

				describe("reduceRight()", () => {
					const check = test3("reduceRight", (previous: unknown[], value, index) => {
						return previous.concat(value, index);
					});

					[[], ["a"], ["a", "b"]].forEach((init) => check(init, []));
				});
			});

			describe("includes()", () => {
				const check = (array: readonly string[], item: unknown, start?: number) => {
					test2("includes", array, noInit, item, start);
				};

				check([], "a");
				check(["a", "b"], "a");
				check(["a", "b"], "b");
				check(["a", "b"], "a", /* start: */ 1);
				check(["a", "b"], "a", /* start: */ -1);
				check(["a", "b"], "b", /* start: */ -1);
				check(["a", "b"], "a", /* start: */ -2);
				check(["a", "b"], "a", /* start: */ Number.POSITIVE_INFINITY);
				check(["a", "b"], "a", /* start: */ Number.NEGATIVE_INFINITY);
			});

			describe("indexOf()", () => {
				const check = (array: readonly string[], item: unknown, start?: number) => {
					test2("indexOf", array, noInit, item, start);
				};

				check([], "a");
				check(["a", "a"], "a");
				check(["a", "b"], "a");
				check(["a", "b"], "b");
				check(["a", "b"], "a", /* start: */ 1);
				check(["a", "b"], "a", /* start: */ -1);
				check(["a", "b"], "b", /* start: */ -1);
				check(["a", "b"], "a", /* start: */ -2);
				check(["a", "b"], "a", /* start: */ Number.POSITIVE_INFINITY);
				check(["a", "b"], "a", /* start: */ Number.NEGATIVE_INFINITY);
			});

			describe("at()", () => {
				const check = (array: readonly string[], index: unknown) => {
					test2("at", array, noInit, index);
				};

				// "Normal" indices
				check([], 0);
				check([], -0);
				check([], -1);
				check(["a", "b"], 0);
				check(["a", "b"], 1);
				check(["a", "b"], 2);
				check(["a", "b"], -1);
				check(["a", "b"], -2);
				check(["a", "b"], -3);
				// Non-integer indices
				check(["a", "b"], 0.5);
				check(["a", "b"], 1.5);
				check(["a", "b"], -0.5); // Truncated to 0 - first element
				check(["a", "b"], -1.5); // Truncated to -1 - second element
				check(["a", "b"], -2.5); // Truncated to -2 - first element
				// Non-integer indices at and close to the valid "edges"
				check(["a", "b"], 1.999999); // Truncated to -1 - second element
				check(["a", "b"], 2.0); // Truncated to -2 - first element
				check(["a", "b"], 2.000001); // Truncated to -2 - first element
				check(["a", "b"], -2.999999); // Truncated to -2 - first element
				check(["a", "b"], -3.0); // Truncated to -3 - out of bounds
				check(["a", "b"], -3.000001); // Truncated to -3 - out of bounds
				check(["a", "b"], -3.5); // Truncated to -3 - out of bounds
				// Extreme values
				check(["a", "b"], Number.POSITIVE_INFINITY);
				check(["a", "b"], Number.NEGATIVE_INFINITY);
				check(["a", "b"], Number.MAX_SAFE_INTEGER);
				check(["a", "b"], Number.MIN_SAFE_INTEGER);
				check(["a", "b"], Number.MAX_VALUE);
				check(["a", "b"], Number.MIN_VALUE);
				check(["a", "b"], Number.EPSILON);
				// Indices that are not numbers
				check(["a", "b"], "0");
				check(["a", "b"], "1");
				check(["a", "b"], "1.999999");
				check(["a", "b"], "2.0");
				check(["a", "b"], "-0");
				check(["a", "b"], "-1");
				check(["a", "b"], "-2.999999");
				check(["a", "b"], "-3.0");
				check(["a", "b"], "not-a-number");
				check(["a", "b"], Number.NaN);
				check(["a", "b"], true);
				check(["a", "b"], false);
				check(["a", "b"], undefined);
				check(["a", "b"], null);
				check(["a", "b"], {});
				check(["a", "b"], { a: 1, b: 2 });
				// TODO: validate these throw; need to update the test harness to support checking that both versions throw
				// check(["a", "b"], Symbol("MySymbol"));
				// check(["a", "b"], BigInt(1));
			});

			describe("join()", () => {
				const check = (array: readonly string[], separator?: string) => {
					test2("join", array, noInit, separator);
				};

				check([]);
				check(["a"]);
				check(["a", "b"]);
				check(["a", "b", "c"], ":");
			});

			describe("keys()", () => {
				const check = (array: readonly string[]) => {
					test2("keys", array, noInit);
				};

				check([]);
				check(["a"]);
				check(["a", "b"]);
			});

			describe("lastIndexOf()", () => {
				const check = (array: readonly string[], item: unknown, start?: number) => {
					test2("lastIndexOf", array, noInit, item, start);
				};

				check([], "a");
				check(["a", "a"], "a");
				check(["a", "b"], "a");
				check(["a", "b"], "b");
				check(["a", "b"], "a", /* start: */ 1);
				check(["a", "b"], "a", /* start: */ -1);
				check(["a", "b"], "b", /* start: */ -1);
				check(["a", "b"], "a", /* start: */ -2);
				check(["a", "b"], "a", /* start: */ Number.POSITIVE_INFINITY);
				check(["a", "b"], "a", /* start: */ Number.NEGATIVE_INFINITY);
			});

			describe("some()", () => {
				const check = (array: readonly string[]) => {
					const predicate = (value: unknown, index: number) => value === index;
					test2("some", array, noInit, predicate);
				};

				[[], ["a"], ["b"], ["b", "c"], ["b", "c", "c"]].forEach(check);
			});

			describe("toLocaleString()", () => {
				// TODO: Consider generalizing 'test2' to support this test.
				const check = (array: readonly number[]) => {
					const expected = array.toLocaleString();
					it(prettyCall("toLocaleString", array, [], expected), () => {
						const subject = createNumberList(array);
						const actual = subject.toLocaleString();
						assert.deepEqual(actual, expected);
					});
				};

				// TODO: Pass explicit locale when permitted by TS lib.
				// For now, the results should at least be consistent on the same machine.
				// In 'en' locale, we're expecting to see a comma thousands separator.
				[[1000, 2000, 3000]].forEach(check);
			});

			describe("toString()", () => {
				// TODO: Consider generalizing 'test2' to support this test.
				const check = (array: readonly number[]) => {
					const expected = array.toString();
					it(prettyCall("toString", array, [], expected), () => {
						const subject = createNumberList(array);
						const actual = subject.toString();
						assert.deepEqual(actual, expected);
					});
				};

				// We do not expect to see a thousands separator.
				[[1000, 2000, 3000]].forEach(check);
			});
		});
	});

	// TODO: Post-MVP

	describe("implements T[]", () => {
		it("Setting [index: number] is disallowed (for MVP)", () => {
			const subject = createStringList([]);

			assert.throws(() => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(subject as any)[0] = "a";
			});

			subject.insertAtStart("a", "b", "c");

			assert.throws(() => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(subject as any)[0] = "a";
			});
		});

		it("Setting .length is disallowed (for MVP)", () => {
			const subject = createStringList([]);

			assert.throws(() => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(subject as any).length = 0;
			});

			subject.insertAtStart("a", "b", "c");

			assert.throws(() => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(subject as any).length = 0;
			});
		});

		// 	describe("push()", () => {
		// 		const check = (array: readonly number[], ...items: readonly number[]) => {
		// 			const expected = array.slice();
		// 			const expectedLength = expected.push(...items);
		// 			it(prettyCall("push", array, items, expected), () => {
		// 				const subject = createNumberList(array);
		// 				const actualLength = subject.push(...items);
		// 				const actual = subject.slice();
		// 				assert.deepEqual(actual, expected);
		// 				assert.deepEqual(actualLength, expectedLength);
		// 			});
		// 		};
		// 		check([]);
		// 		check([], 1);
		// 		check([], 1, 2);
		// 		check([0], 1, 2);
		// 		check([0, 1], 2);
		// 	});
		// 	describe("splice()", () => {
		// 		const check = (
		// 			array: unknown[],
		// 			start: number,
		// 			deleteCount: number,
		// 			...toInsert: unknown[]
		// 		) => {
		// 			const expected = array.slice().splice(start, deleteCount, ...toInsert);
		// 			it(prettyCall("some", array, [start, deleteCount, ...toInsert], expected), () => {
		// 				const subject = createSubject(array);
		// 				const actual = subject.splice(start, deleteCount, ...toInsert);
		// 				assert.deepEqual(actual, expected);
		// 			});
		// 		};
		// 		check([], /* start: */ 0, /* deleteCount: */ 0);
		// 		check([], /* start: */ 0, /* deleteCount: */ 0, "a");
		// 		check([], /* start: */ 0, /* deleteCount: */ 0, "a", "b");
		// 		check(["a"], /* start: */ 0, /* deleteCount: */ 0);
		// 		check(["a"], /* start: */ 0, /* deleteCount: */ 1);
		// 		check(["a"], /* start: */ 0, /* deleteCount: */ 1, "b");
		// 	});
		// });

		// describe("unshift()", () => {
		// 	const check = (array: unknown[], ...items: unknown[]) => {
		// 		const expected = array.slice();
		// 		const expectedLength = expected.unshift(...items);
		// 		it(prettyCall("unshift", array, items, expected), () => {
		// 			const subject = createSubject(array);
		// 			const actualLength = subject.unshift(...items);
		// 			const actual = subject.slice();

		// 			assert.deepEqual(actual, expected);
		// 			assert.deepEqual(actualLength, expectedLength);
		// 		});
		// 	};

		// 	check([]);
		// 	check([], 1);
		// 	check([], 1, 2);
		// 	check([0], 1, 2);
		// 	check([0, 1], 2);
	});
});
