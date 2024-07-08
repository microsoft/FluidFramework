/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";
import { SchemaFactory } from "../../simple-tree/index.js";
import { hydrate } from "./utils.js";
import type { Mutable } from "../../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import { asIndex } from "../../simple-tree/arrayNode.js";
import { validateUsageError } from "../utils.js";

const schemaFactory = new SchemaFactory("ArrayNodeTest");
const PojoEmulationNumberArray = schemaFactory.array(schemaFactory.number);
const CustomizableNumberArray = schemaFactory.array("Array", schemaFactory.number);

describe("ArrayNode", () => {
	describe("created in pojo-emulation mode", () => {
		testArrayFromSchemaType(PojoEmulationNumberArray);
	});

	describe("created in customizable mode", () => {
		testArrayFromSchemaType(CustomizableNumberArray);

		it("doesn't stringify extra properties", () => {
			class ExtraArray extends schemaFactory.array("ArrayWithExtra", schemaFactory.number) {
				public extra = "foo";
			}

			const jsArray = [0, 1, 2];
			const array = hydrate(ExtraArray, jsArray);
			assert.equal(array.extra, "foo");
			// "extra" should not be stringified
			assert.equal(JSON.stringify(array), JSON.stringify(jsArray));
		});
	});

	// Tests which should behave the same for both "structurally named" "POJO emulation mode" arrays and "customizable" arrays can be added in this function to avoid duplication.
	function testArrayFromSchemaType(
		schemaType: typeof PojoEmulationNumberArray | typeof CustomizableNumberArray,
	): void {
		it("fails at runtime if attempting to set content via index assignment", () => {
			const array = hydrate(schemaType, [0]);
			const mutableArray = array as Mutable<typeof array>;
			assert.equal(mutableArray.length, 1);
			assert.throws(
				() => (mutableArray[0] = 3),
				validateUsageError(/Use array node mutation APIs/),
			); // An index within the array that already has an element
			assert.throws(
				() => (mutableArray[1] = 3),
				validateUsageError(/Use array node mutation APIs/),
			); // An index just past the end of the array, where a new element would be pushed
			assert.throws(
				() => (mutableArray[2] = 3),
				validateUsageError(/Use array node mutation APIs/),
			); // An index that would leave a "gap" past the current end of the array if a set occurred
		});

		it("stringifies in the same way as a JS array", () => {
			const jsArray = [0, 1, 2];
			const array = hydrate(schemaType, jsArray);
			assert.equal(JSON.stringify(array), JSON.stringify(jsArray));
		});

		describe("removeAt", () => {
			it("valid index", () => {
				const array = hydrate(schemaType, [0, 1, 2]);
				array.removeAt(1);
				assert.deepEqual([...array], [0, 2]);
			});

			it("invalid index", () => {
				const array = hydrate(schemaType, [0, 1, 2]);
				// Index too large
				assert.throws(
					() => array.removeAt(3),
					validateUsageError(/Index value passed to TreeArrayNode.removeAt is out of bounds./),
				);
				// Index is negative
				assert.throws(
					() => array.removeAt(-1),
					validateUsageError(/Expected non-negative index, got -1./),
				);
			});
		});

		describe("insertAt", () => {
			it("valid index", () => {
				const array = hydrate(schemaType, [1, 2, 3]);
				array.insertAt(0, 0);
				assert.deepEqual([...array], [0, 1, 2, 3]);
			});

			it("invalid index", () => {
				const array = hydrate(schemaType, [0, 1, 2]);
				// Index too large
				assert.throws(
					() => array.insertAt(4, 0),
					validateUsageError(/Index value passed to TreeArrayNode.insertAt is out of bounds./),
				);
				// Index is negative
				assert.throws(
					() => array.insertAt(-1, 0),
					validateUsageError(/Expected non-negative index, got -1./),
				);
			});
		});

		describe("moveToStart", () => {
			it("move element to start of empty array", () => {
				const schema = schemaFactory.object("parent", {
					array1: schemaFactory.array(schemaFactory.number),
					array2: schemaFactory.array(schemaFactory.number),
				});
				const { array1, array2 } = hydrate(schema, { array1: [], array2: [1, 2, 3] });
				array1.moveToStart(1, array2);
				assert.deepEqual([...array1], [2]);
				assert.deepEqual([...array2], [1, 3]);
			});

			it("move within field", () => {
				const array = hydrate(schemaType, [1, 2, 3]);
				array.moveToStart(1);
				assert.deepEqual([...array], [2, 1, 3]);
			});

			it("cross-field move", () => {
				const schema = schemaFactory.object("parent", {
					array1: schemaFactory.array(schemaFactory.number),
					array2: schemaFactory.array(schemaFactory.number),
				});
				const { array1, array2 } = hydrate(schema, { array1: [1, 2], array2: [1, 2] });
				array1.moveToStart(1, array2);
				assert.deepEqual([...array1], [2, 1, 2]);
			});

			it("invalid index", () => {
				const array = hydrate(schemaType, [1, 2, 3]);
				// Index too large
				assert.throws(
					() => array.moveToStart(4),
					validateUsageError(
						/Index value passed to TreeArrayNode.moveToStart is out of bounds./,
					),
				);
				// Index is negative
				assert.throws(
					() => array.moveToStart(-1),
					validateUsageError(/Expected non-negative index, got -1./),
				);
			});
		});

		describe("moveToEnd", () => {
			it("move element to end of empty array", () => {
				const schema = schemaFactory.object("parent", {
					array1: schemaFactory.array(schemaFactory.number),
					array2: schemaFactory.array(schemaFactory.number),
				});
				const { array1, array2 } = hydrate(schema, { array1: [], array2: [1, 2, 3] });
				array1.moveToEnd(1, array2);
				assert.deepEqual([...array1], [2]);
				assert.deepEqual([...array2], [1, 3]);
			});

			it("move within field", () => {
				const array = hydrate(schemaType, [1, 2, 3]);
				array.moveToEnd(1);
				assert.deepEqual([...array], [1, 3, 2]);
			});

			it("cross-field move", () => {
				const schema = schemaFactory.object("parent", {
					array1: schemaFactory.array(schemaFactory.number),
					array2: schemaFactory.array(schemaFactory.number),
				});
				const { array1, array2 } = hydrate(schema, { array1: [1, 2], array2: [1, 2] });
				array1.moveToEnd(1, array2);
				assert.deepEqual([...array1], [1, 2, 2]);
			});

			it("invalid index", () => {
				const array = hydrate(schemaType, [1, 2, 3]);
				// Index too large
				assert.throws(
					() => array.moveToEnd(4),
					validateUsageError(
						/Index value passed to TreeArrayNode.moveToEnd is out of bounds./,
					),
				);
				// Index is negative
				assert.throws(
					() => array.moveToEnd(-1),
					validateUsageError(/Expected non-negative index, got -1./),
				);
			});
		});

		describe("moveToIndex", () => {
			it("move element to start of empty array", () => {
				const schema = schemaFactory.object("parent", {
					array1: schemaFactory.array(schemaFactory.number),
					array2: schemaFactory.array(schemaFactory.number),
				});
				const { array1, array2 } = hydrate(schema, { array1: [], array2: [1, 2, 3] });
				array1.moveToIndex(0, 1, array2);
				assert.deepEqual([...array1], [2]);
				assert.deepEqual([...array2], [1, 3]);
			});

			for (const specifySource of [false, true]) {
				describe(`move within field ${
					specifySource ? "(specified source)" : "(implicit source)"
				}`, () => {
					it("moves node to the destination index when valid", () => {
						const initialState = [0, 1, 2];
						for (let sourceIndex = 0; sourceIndex < initialState.length; sourceIndex += 1) {
							const movedValue = initialState[sourceIndex];
							for (
								let destinationIndex = 0;
								destinationIndex < initialState.length;
								destinationIndex += 1
							) {
								const array = hydrate(schemaType, initialState);
								if (specifySource) {
									array.moveToIndex(destinationIndex, sourceIndex, array);
								} else {
									array.moveToIndex(destinationIndex, sourceIndex);
								}
								const actual = [...array];
								const expected =
									sourceIndex < destinationIndex
										? [
												...initialState.slice(0, sourceIndex),
												...initialState.slice(sourceIndex + 1, destinationIndex),
												movedValue,
												...initialState.slice(destinationIndex),
											]
										: [
												...initialState.slice(0, destinationIndex),
												movedValue,
												...initialState.slice(destinationIndex, sourceIndex),
												...initialState.slice(sourceIndex + 1),
											];
								assert.deepEqual(actual, expected);
							}
						}
					});

					it("throws when the source index is invalid", () => {
						const array = hydrate(schemaType, [1, 2, 3]);
						// Destination index too large
						assert.throws(
							() => array.moveToIndex(4, 0),
							validateUsageError(
								/Index value passed to TreeArrayNode.moveToIndex is out of bounds./,
							),
						);
						// Source index too large
						assert.throws(
							() => array.moveToIndex(0, 4),
							validateUsageError(
								/Index value passed to TreeArrayNode.moveToIndex is out of bounds./,
							),
						);
						// Destination index is negative
						assert.throws(
							() => array.moveToIndex(-1, 0),
							validateUsageError(/Expected non-negative index, got -1./),
						);
						// Source index is negative
						assert.throws(
							() => array.moveToIndex(0, -1),
							validateUsageError(/Expected non-negative index, got -1./),
						);
					});
				});
			}

			describe("move across fields", () => {
				it("moves node to the destination index when valid", () => {
					const schema = schemaFactory.object("parent", {
						source: schemaFactory.array(schemaFactory.number),
						destination: schemaFactory.array(schemaFactory.number),
					});
					for (const [initialSourceState, initialDestinationState] of [
						[[1, 2, 3], []],
						[
							[1, 2, 3],
							[4, 5],
						],
						[
							[1, 2],
							[3, 4, 5],
						],
					]) {
						for (
							let sourceIndex = 0;
							sourceIndex < initialSourceState.length;
							sourceIndex += 1
						) {
							const movedValue = initialSourceState[sourceIndex];
							for (
								let destinationIndex = 0;
								destinationIndex < initialDestinationState.length;
								destinationIndex += 1
							) {
								const { source, destination } = hydrate(schema, {
									source: initialSourceState,
									destination: initialDestinationState,
								});
								destination.moveToIndex(destinationIndex, sourceIndex, source);
								const actualSource = [...source];
								const actualDestination = [...destination];
								const expectedSource = [
									...initialSourceState.slice(0, sourceIndex),
									...initialSourceState.slice(sourceIndex + 1),
								];
								const expectedDestination = [
									...initialDestinationState.slice(0, destinationIndex),
									movedValue,
									...initialDestinationState.slice(destinationIndex),
								];
								assert.deepEqual(actualSource, expectedSource);
								assert.deepEqual(actualDestination, expectedDestination);
							}
						}
					}
				});

				it("throws when the source index is invalid", () => {
					const schema = schemaFactory.object("parent", {
						source: schemaFactory.array(schemaFactory.number),
						destination: schemaFactory.array(schemaFactory.number),
					});
					const { source, destination } = hydrate(schema, {
						source: [1, 2, 3],
						destination: [4, 5, 6, 7],
					});
					// Destination index too large
					assert.throws(
						() => destination.moveToIndex(5, 0, source),
						validateUsageError(
							/Index value passed to TreeArrayNode.moveToIndex is out of bounds./,
						),
					);
					// Source index too large
					assert.throws(
						() => destination.moveToIndex(0, 4, source),
						validateUsageError(
							/Index value passed to TreeArrayNode.moveToIndex is out of bounds./,
						),
					);
					// Destination index is negative
					assert.throws(
						() => destination.moveToIndex(-1, 0, source),
						validateUsageError(/Expected non-negative index, got -1./),
					);
					// Source index is negative
					assert.throws(
						() => destination.moveToIndex(0, -1, source),
						validateUsageError(/Expected non-negative index, got -1./),
					);
				});
			});
		});

		describe("moveRangeToStart", () => {
			it("move within field", () => {
				const array = hydrate(schemaType, [1, 2, 3]);
				array.moveRangeToStart(1, 3);
				assert.deepEqual([...array], [2, 3, 1]);
			});

			it("cross-field move", () => {
				const schema = schemaFactory.object("parent", {
					array1: schemaFactory.array(schemaFactory.number),
					array2: schemaFactory.array(schemaFactory.number),
				});
				const { array1, array2 } = hydrate(schema, { array1: [1, 2], array2: [1, 2] });
				array1.moveRangeToStart(0, 2, array2);
				assert.deepEqual([...array1], [1, 2, 1, 2]);
			});

			it("move within empty field", () => {
				const array = hydrate(schemaType, []);
				array.moveRangeToStart(0, 0);
				assert.deepEqual([...array], []);
			});

			it("invalid index", () => {
				const array = hydrate(schemaType, [1, 2, 3]);
				// End index too large
				assert.throws(
					() => array.moveRangeToStart(0, 4),
					validateUsageError(
						/Index value passed to TreeArrayNode.moveRangeToStart is out of bounds./,
					),
				);
				// Start index is larger than end index
				assert.throws(
					() => array.moveRangeToStart(2, 1),
					validateUsageError(
						/Index value passed to TreeArrayNode.moveRangeToStart is out of bounds./,
					),
				);
				// Index is negative
				assert.throws(
					() => array.moveRangeToStart(-1, 0),
					validateUsageError(/Expected non-negative index, got -1./),
				);
			});
		});

		describe("moveRangeToEnd", () => {
			it("move within field", () => {
				const array = hydrate(schemaType, [1, 2, 3]);
				array.moveRangeToEnd(0, 2);
				assert.deepEqual([...array], [3, 1, 2]);
			});

			it("cross-field move", () => {
				const schema = schemaFactory.object("parent", {
					array1: schemaFactory.array(schemaFactory.number),
					array2: schemaFactory.array(schemaFactory.number),
				});
				const { array1, array2 } = hydrate(schema, { array1: [1, 2], array2: [1, 2] });
				array1.moveRangeToEnd(0, 2, array2);
				assert.deepEqual([...array1], [1, 2, 1, 2]);
			});

			it("move within empty field", () => {
				const array = hydrate(schemaType, []);
				array.moveRangeToEnd(0, 0);
				assert.deepEqual([...array], []);
			});

			it("invalid index", () => {
				const array = hydrate(schemaType, [1, 2, 3]);
				// End index too large
				assert.throws(
					() => array.moveRangeToEnd(0, 4),
					validateUsageError(
						/Index value passed to TreeArrayNode.moveRangeToEnd is out of bounds./,
					),
				);
				// Start index is larger than the end index
				assert.throws(
					() => array.moveRangeToEnd(2, 1),
					validateUsageError(
						/Index value passed to TreeArrayNode.moveRangeToEnd is out of bounds./,
					),
				);
				// Index is negative
				assert.throws(
					() => array.moveRangeToEnd(-1, 0),
					validateUsageError(/Expected non-negative index, got -1./),
				);
			});
		});

		describe("moveRangeToIndex", () => {
			it("move within field", () => {
				const array = hydrate(schemaType, [1, 2, 3]);
				array.moveRangeToIndex(0, 1, 3);
				assert.deepEqual([...array], [2, 3, 1]);
			});

			it("cross-field move", () => {
				const schema = schemaFactory.object("parent", {
					array1: schemaFactory.array(schemaFactory.number),
					array2: schemaFactory.array(schemaFactory.number),
				});
				const { array1, array2 } = hydrate(schema, { array1: [1, 2], array2: [1, 2] });
				array1.moveRangeToIndex(0, 0, 2, array2);
				assert.deepEqual([...array1], [1, 2, 1, 2]);
			});

			it("move within empty field", () => {
				const array = hydrate(schemaType, []);
				array.moveRangeToIndex(0, 0, 0);
				assert.deepEqual([...array], []);
			});

			it("invalid content type", () => {
				const schema = schemaFactory.object("parent", {
					array1: schemaFactory.array([schemaFactory.number, schemaFactory.string]),
					array2: schemaFactory.array(schemaFactory.number),
				});
				const { array1, array2 } = hydrate(schema, { array1: [1, "bad", 2], array2: [] });
				const expected = validateUsageError(
					/Type in source sequence is not allowed in destination./,
				);
				assert.throws(() => array2.moveRangeToIndex(0, 1, 3, array1), expected);
				assert.throws(() => array2.moveRangeToIndex(0, 0, 2, array1), expected);
				assert.throws(() => array2.moveRangeToIndex(0, 0, 3, array1), expected);
			});

			it("invalid index", () => {
				const array = hydrate(schemaType, [1, 2, 3]);
				// Destination index too large
				assert.throws(
					() => array.moveRangeToIndex(4, 0, 2),
					validateUsageError(
						/Index value passed to TreeArrayNode.moveRangeToIndex is out of bounds./,
					),
				);
				// End index is too large
				assert.throws(
					() => array.moveRangeToIndex(0, 0, 4),
					validateUsageError(
						/Index value passed to TreeArrayNode.moveRangeToIndex is out of bounds./,
					),
				);
				// Start index larger than end index
				assert.throws(
					() => array.moveRangeToIndex(0, 2, 1),
					validateUsageError(
						/Index value passed to TreeArrayNode.moveRangeToIndex is out of bounds./,
					),
				);
				// Index is negative
				assert.throws(
					() => array.moveRangeToIndex(-1, 0, 1),
					validateUsageError(/Expected non-negative index, got -1./),
				);
			});
		});

		describe("removeRange", () => {
			it("no arguments", () => {
				const jsArray = [0, 1, 2];
				const array = hydrate(schemaType, jsArray);
				assert.equal(array.length, 3);
				array.removeRange();
				assert.equal(array.length, 0);
				assert.deepEqual([...array], []);
			});

			it("empty array no arguments", () => {
				const array = hydrate(schemaType, []);
				array.removeRange();
			});

			it("middle", () => {
				const list = hydrate(schemaType, [0, 1, 2, 3]);
				list.removeRange(/* start: */ 1, /* end: */ 3);
				assert.deepEqual([...list], [0, 3]);
			});

			it("all", () => {
				const list = hydrate(schemaType, [0, 1, 2, 3]);
				list.removeRange(0, 4);
				assert.deepEqual([...list], []);
			});

			it("past end", () => {
				const list = hydrate(schemaType, [0, 1, 2, 3]);
				list.removeRange(1, Number.POSITIVE_INFINITY);
				assert.deepEqual([...list], [0]);
			});

			it("empty range", () => {
				const list = hydrate(schemaType, [0, 1, 2, 3]);
				list.removeRange(2, 2);
				assert.deepEqual([...list], [0, 1, 2, 3]);
			});

			it("empty range - at start", () => {
				const list = hydrate(schemaType, [0, 1, 2, 3]);
				list.removeRange(0, 0);
				assert.deepEqual([...list], [0, 1, 2, 3]);
			});

			it("empty range - at end", () => {
				const list = hydrate(schemaType, [0, 1, 2, 3]);
				list.removeRange(4, 4);
				assert.deepEqual([...list], [0, 1, 2, 3]);
			});

			it("invalid", () => {
				const list = hydrate(schemaType, [0, 1, 2, 3]);
				// Past end
				assert.throws(() => list.removeRange(5, 6), validateUsageError(/Too large/));
				// start after end
				assert.throws(() => list.removeRange(3, 2), validateUsageError(/Too large/));
				// negative index
				assert.throws(() => list.removeRange(-1, 2), validateUsageError(/index/));
				// non-integer index
				assert.throws(() => list.removeRange(1.5, 2), validateUsageError(/integer/));
			});

			it("invalid empty range", () => {
				// If someday someone optimized empty ranges to no op earlier, they still need to error in these cases:
				const list = hydrate(schemaType, [0, 1, 2, 3]);
				// Past end
				assert.throws(() => list.removeRange(5, 5), validateUsageError(/Too large/));
				// negative index
				assert.throws(() => list.removeRange(-1, -1), validateUsageError(/index/));
				// non-integer index
				assert.throws(
					() => list.removeRange(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
					validateUsageError(/safe integer/),
				);
				assert.throws(() => list.removeRange(1.5, 1.5), validateUsageError(/integer/));
			});
		});
	}

	it("asIndex helper returns expected values", () => {
		// Expected indices with no max
		assert.equal(asIndex("0", Number.POSITIVE_INFINITY), 0);
		assert.equal(asIndex("1", Number.POSITIVE_INFINITY), 1);
		assert.equal(asIndex("999", Number.POSITIVE_INFINITY), 999);
		// Expected indices with max
		assert.equal(asIndex("0", 2), 0);
		assert.equal(asIndex("1", 2), 1);
		assert.equal(asIndex("2", 2), undefined);
		assert.equal(asIndex("999", 2), undefined);
		// Non-index values
		assert.equal(asIndex("-0", Number.POSITIVE_INFINITY), undefined);
		assert.equal(asIndex("Infinity", Number.POSITIVE_INFINITY), undefined);
		assert.equal(asIndex("NaN", Number.POSITIVE_INFINITY), undefined);
		assert.equal(asIndex("-1", Number.POSITIVE_INFINITY), undefined);
		assert.equal(asIndex("1.5", Number.POSITIVE_INFINITY), undefined);
		assert.equal(asIndex("", Number.POSITIVE_INFINITY), undefined);
		assert.equal(asIndex(" ", Number.POSITIVE_INFINITY), undefined);
		assert.equal(asIndex("0x1", Number.POSITIVE_INFINITY), undefined);
		assert.equal(asIndex(" 1", Number.POSITIVE_INFINITY), undefined);
		assert.equal(asIndex("1.0", Number.POSITIVE_INFINITY), undefined);
		assert.equal(asIndex("1 ", Number.POSITIVE_INFINITY), undefined);
	});

	describe("shadowing", () => {
		// Apps compiled targeting es2020 will hit the "fails at runtime if attempting to set content via index assignment" case tested above instead of these due to using assignment in the constructor to implement fields defaulting.

		it("Shadowing index property with incompatible type", () => {
			class Array extends schemaFactory.array(
				"ArrayWithTypeIncompatibleShadow",
				schemaFactory.number,
			) {
				// @ts-expect-error Cannot shadow property with incompatible type.
				public 5: string = "foo";
			}

			assert.throws(
				() => new Array([0, 1, 2]),
				(error: Error) =>
					validateAssertionError(error, /Shadowing of array indices is not permitted/),
			);

			assert.throws(
				() => hydrate(Array, [0, 1, 2]),
				(error: Error) =>
					validateAssertionError(error, /Shadowing of array indices is not permitted/),
			);
		});

		it("Shadowing index property with compatible type", () => {
			class Array extends schemaFactory.array(
				"ArrayWithTypeCompatibleShadow",
				schemaFactory.number,
			) {
				// Shadowing with compatible type is allowed by the type-system, but will throw at construction.
				public 5: number = 42;
			}

			assert.throws(
				() => new Array([0, 1, 2]),
				(error: Error) =>
					validateAssertionError(error, /Shadowing of array indices is not permitted/),
			);

			assert.throws(
				() => hydrate(Array, [0, 1, 2]),
				(error: Error) =>
					validateAssertionError(error, /Shadowing of array indices is not permitted/),
			);
		});

		it("Shadowing index property with compatible type (getter)", () => {
			class Array extends schemaFactory.array("ArrayWithGetterShadow", schemaFactory.number) {
				// Shadowing with compatible type is allowed by the type-system, but will throw at construction.
				// eslint-disable-next-line @typescript-eslint/class-literal-property-style
				public get 5(): number {
					return 42;
				}
			}

			assert.throws(
				() => new Array([0, 1, 2]),
				(error: Error) =>
					validateAssertionError(error, /Shadowing of array indices is not permitted/),
			);

			assert.throws(
				() => hydrate(Array, [0, 1, 2]),
				(error: Error) =>
					validateAssertionError(error, /Shadowing of array indices is not permitted/),
			);
		});

		it("Shadowing index property with constructor-initialized property", () => {
			class Array extends schemaFactory.array("ArrayWithGetterShadow", schemaFactory.number) {
				public readonly 5: number;
				public constructor(data: number[], five: number) {
					super(data);
					this[5] = five;
				}
			}

			assert.throws(
				// False positive
				// eslint-disable-next-line @typescript-eslint/no-array-constructor
				() => new Array([0, 1, 2], 42),
				(error: Error) =>
					validateAssertionError(error, /Shadowing of array indices is not permitted/),
			);
		});
	});
});
