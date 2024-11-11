/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";
import { describeHydration, hydrate } from "./utils.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type FixRecursiveArraySchema,
	type NodeFromSchema,
	type ValidateRecursiveSchema,
} from "../../simple-tree/index.js";
import type { Mutable } from "../../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import { asIndex } from "../../simple-tree/arrayNode.js";
import { TestTreeProviderLite, validateUsageError } from "../utils.js";

const schemaFactory = new SchemaFactory("ArrayNodeTest");
const PojoEmulationNumberArray = schemaFactory.array(schemaFactory.number);
const CustomizableNumberArray = schemaFactory.array("Array", schemaFactory.number);

describe("ArrayNode", () => {
	testArrayFromSchemaType("created in pojo-emulation mode", PojoEmulationNumberArray);
	testArrayFromSchemaType("created in customizable mode", CustomizableNumberArray);

	describeHydration("customizable", (init) => {
		it("doesn't stringify extra properties", () => {
			class ExtraArray extends schemaFactory.array("ArrayWithExtra", schemaFactory.number) {
				public extra = "foo";
			}

			const jsArray = [0, 1, 2];
			const array = init(ExtraArray, jsArray);
			assert.equal(array.extra, "foo");
			// "extra" should not be stringified
			assert.equal(JSON.stringify(array), JSON.stringify(jsArray));
		});

		it("accessor local properties", () => {
			const thisList: unknown[] = [];
			class Test extends schemaFactory.array("test", schemaFactory.number) {
				public get y() {
					assert.equal(this, n);
					thisList.push(this);
					return this[0];
				}
				public set y(value: number) {
					assert.equal(this, n);
					thisList.push(this);
					this.insertAtStart(value);
				}
			}

			const n = init(Test, [1]);
			n.y = 2;
			assert.equal(n[0], 2);
			n.insertAtStart(3);
			assert.equal(n.y, 3);
			assert.deepEqual(thisList, [n, n]);
		});
	});

	// Tests which should behave the same for both "structurally named" "POJO emulation mode" arrays and "customizable" arrays can be added in this function to avoid duplication.
	function testArrayFromSchemaType(
		title: string,
		schemaType: typeof PojoEmulationNumberArray | typeof CustomizableNumberArray,
	): void {
		describeHydration(title, (init) => {
			it("fails at runtime if attempting to set content via index assignment", () => {
				const array = init(schemaType, [0]);
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
				const array = init(schemaType, jsArray);
				assert.equal(JSON.stringify(array), JSON.stringify(jsArray));
			});

			describe("removeAt", () => {
				it("valid index", () => {
					const array = init(schemaType, [0, 1, 2]);
					array.removeAt(1);
					assert.deepEqual([...array], [0, 2]);
				});

				it("invalid index", () => {
					const array = init(schemaType, [0, 1, 2]);
					// Index too large
					assert.throws(
						() => array.removeAt(3),
						validateUsageError(
							/Index value passed to TreeArrayNode.removeAt is out of bounds./,
						),
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
					const array = init(schemaType, [1, 2, 3]);
					array.insertAt(0, 0);
					assert.deepEqual([...array], [0, 1, 2, 3]);
				});

				it("invalid index", () => {
					const array = init(schemaType, [0, 1, 2]);
					// Index too large
					assert.throws(
						() => array.insertAt(4, 0),
						validateUsageError(
							/Index value passed to TreeArrayNode.insertAt is out of bounds./,
						),
					);
					// Index is negative
					assert.throws(
						() => array.insertAt(-1, 0),
						validateUsageError(/Expected non-negative index, got -1./),
					);
				});
			});

			describe("removeRange", () => {
				it("no arguments", () => {
					const jsArray = [0, 1, 2];
					const array = init(schemaType, jsArray);
					assert.equal(array.length, 3);
					array.removeRange();
					assert.equal(array.length, 0);
					assert.deepEqual([...array], []);
				});

				it("empty array no arguments", () => {
					const array = init(schemaType, []);
					array.removeRange();
				});

				it("middle", () => {
					const list = init(schemaType, [0, 1, 2, 3]);
					list.removeRange(/* start: */ 1, /* end: */ 3);
					assert.deepEqual([...list], [0, 3]);
				});

				it("all", () => {
					const list = init(schemaType, [0, 1, 2, 3]);
					list.removeRange(0, 4);
					assert.deepEqual([...list], []);
				});

				it("past end", () => {
					const list = init(schemaType, [0, 1, 2, 3]);
					list.removeRange(1, Number.POSITIVE_INFINITY);
					assert.deepEqual([...list], [0]);
				});

				it("empty range", () => {
					const list = init(schemaType, [0, 1, 2, 3]);
					list.removeRange(2, 2);
					assert.deepEqual([...list], [0, 1, 2, 3]);
				});

				it("empty range - at start", () => {
					const list = init(schemaType, [0, 1, 2, 3]);
					list.removeRange(0, 0);
					assert.deepEqual([...list], [0, 1, 2, 3]);
				});

				it("empty range - at end", () => {
					const list = init(schemaType, [0, 1, 2, 3]);
					list.removeRange(4, 4);
					assert.deepEqual([...list], [0, 1, 2, 3]);
				});

				it("invalid", () => {
					const list = init(schemaType, [0, 1, 2, 3]);
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
					const list = init(schemaType, [0, 1, 2, 3]);
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

			describe("moveToStart", () => {
				it("move element to start of empty array", () => {
					const schema = schemaFactory.object("parent", {
						array1: schemaFactory.array(schemaFactory.number),
						array2: schemaFactory.array(schemaFactory.number),
					});
					const { array1, array2 } = init(schema, { array1: [], array2: [1, 2, 3] });
					array1.moveToStart(1, array2);
					assert.deepEqual([...array1], [2]);
					assert.deepEqual([...array2], [1, 3]);
				});

				it("move within field", () => {
					const array = init(schemaType, [1, 2, 3]);
					array.moveToStart(1);
					assert.deepEqual([...array], [2, 1, 3]);
				});

				it("cross-field move", () => {
					const schema = schemaFactory.object("parent", {
						array1: schemaFactory.array(schemaFactory.number),
						array2: schemaFactory.array(schemaFactory.number),
					});
					const { array1, array2 } = init(schema, { array1: [1, 2], array2: [1, 2] });
					array1.moveToStart(1, array2);
					assert.deepEqual([...array1], [2, 1, 2]);
				});

				it("invalid index", () => {
					const array = init(schemaType, [1, 2, 3]);
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
					const { array1, array2 } = init(schema, { array1: [], array2: [1, 2, 3] });
					array1.moveToEnd(1, array2);
					assert.deepEqual([...array1], [2]);
					assert.deepEqual([...array2], [1, 3]);
				});

				it("move within field", () => {
					const array = init(schemaType, [1, 2, 3]);
					array.moveToEnd(1);
					assert.deepEqual([...array], [1, 3, 2]);
				});

				it("cross-field move", () => {
					const schema = schemaFactory.object("parent", {
						array1: schemaFactory.array(schemaFactory.number),
						array2: schemaFactory.array(schemaFactory.number),
					});
					const { array1, array2 } = init(schema, { array1: [1, 2], array2: [1, 2] });
					array1.moveToEnd(1, array2);
					assert.deepEqual([...array1], [1, 2, 2]);
				});

				it("invalid index", () => {
					const array = init(schemaType, [1, 2, 3]);
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
					const { array1, array2 } = init(schema, { array1: [], array2: [1, 2, 3] });
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
									const array = init(schemaType, initialState);
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
							const array = init(schemaType, [1, 2, 3]);
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
									const { source, destination } = init(schema, {
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
						const { source, destination } = init(schema, {
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
					const array = init(schemaType, [1, 2, 3]);
					array.moveRangeToStart(1, 3);
					assert.deepEqual([...array], [2, 3, 1]);
				});

				it("cross-field move", () => {
					const schema = schemaFactory.object("parent", {
						array1: schemaFactory.array(schemaFactory.number),
						array2: schemaFactory.array(schemaFactory.number),
					});
					const { array1, array2 } = init(schema, { array1: [1, 2], array2: [1, 2] });
					array1.moveRangeToStart(0, 2, array2);
					assert.deepEqual([...array1], [1, 2, 1, 2]);
				});

				it("move within empty field", () => {
					const array = init(schemaType, []);
					array.moveRangeToStart(0, 0);
					assert.deepEqual([...array], []);
				});

				it("invalid index", () => {
					const array = init(schemaType, [1, 2, 3]);
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
					const array = init(schemaType, [1, 2, 3]);
					array.moveRangeToEnd(0, 2);
					assert.deepEqual([...array], [3, 1, 2]);
				});

				it("cross-field move", () => {
					const schema = schemaFactory.object("parent", {
						array1: schemaFactory.array(schemaFactory.number),
						array2: schemaFactory.array(schemaFactory.number),
					});
					const { array1, array2 } = init(schema, { array1: [1, 2], array2: [1, 2] });
					array1.moveRangeToEnd(0, 2, array2);
					assert.deepEqual([...array1], [1, 2, 1, 2]);
				});

				it("move within empty field", () => {
					const array = init(schemaType, []);
					array.moveRangeToEnd(0, 0);
					assert.deepEqual([...array], []);
				});

				it("invalid index", () => {
					const array = init(schemaType, [1, 2, 3]);
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
					const array = init(schemaType, [1, 2, 3]);
					array.moveRangeToIndex(0, 1, 3);
					assert.deepEqual([...array], [2, 3, 1]);
				});

				it("cross-field move", () => {
					const schema = schemaFactory.object("parent", {
						array1: schemaFactory.array(schemaFactory.number),
						array2: schemaFactory.array(schemaFactory.number),
					});
					const { array1, array2 } = init(schema, { array1: [1, 2], array2: [1, 2] });
					array1.moveRangeToIndex(0, 0, 2, array2);
					assert.deepEqual([...array1], [1, 2, 1, 2]);
				});

				it("move within empty field", () => {
					const array = init(schemaType, []);
					array.moveRangeToIndex(0, 0, 0);
					assert.deepEqual([...array], []);
				});

				it("invalid content type", () => {
					const schema = schemaFactory.object("parent", {
						array1: schemaFactory.array([schemaFactory.number, schemaFactory.string]),
						array2: schemaFactory.array(schemaFactory.number),
					});
					const { array1, array2 } = init(schema, { array1: [1, "bad", 2], array2: [] });
					const expected = validateUsageError(
						/Type in source sequence is not allowed in destination./,
					);
					assert.throws(() => array2.moveRangeToIndex(0, 1, 3, array1), expected);
					assert.throws(() => array2.moveRangeToIndex(0, 0, 2, array1), expected);
					assert.throws(() => array2.moveRangeToIndex(0, 0, 3, array1), expected);
				});

				it("invalid index", () => {
					const array = init(schemaType, [1, 2, 3]);
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

	describeHydration(
		"shadowing",
		(init) => {
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
					() => init(Array, [0, 1, 2]),
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
					() => init(Array, [0, 1, 2]),
					(error: Error) =>
						validateAssertionError(error, /Shadowing of array indices is not permitted/),
				);
			});

			it("Shadowing index property with compatible type (getter)", () => {
				class Array extends schemaFactory.array(
					"ArrayWithGetterShadow",
					schemaFactory.number,
				) {
					// Shadowing with compatible type is allowed by the type-system, but will throw at construction.
					// eslint-disable-next-line @typescript-eslint/class-literal-property-style
					public get 5(): number {
						return 42;
					}
				}

				assert.throws(
					() => init(Array, [0, 1, 2]),
					(error: Error) =>
						validateAssertionError(error, /Shadowing of array indices is not permitted/),
				);
			});
		},
		() => {
			it("Shadowing index property with constructor-initialized property", () => {
				class Array extends schemaFactory.array(
					"ArrayWithGetterShadow",
					schemaFactory.number,
				) {
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
		},
	);

	describeHydration(
		"Iteration",
		(init) => {
			it("Iterator of an unhydrated node works after it's been inserted, and throws during iteration once a concurrent edit is made.", () => {
				class TestArray extends schemaFactory.array("Array", schemaFactory.number) {}

				// Create unhydrated array node
				const array = new TestArray([1, 2]);

				const provider = new TestTreeProviderLite();
				const tree = provider.trees[0];
				const view = tree.viewWith(new TreeViewConfiguration({ schema: TestArray }));
				const values = array.values();

				// Initialize the tree with unhydrated array node
				view.initialize(array);

				// Checks that the iterator works after hydrating the node.
				values.next();

				// Make an edit
				array.insertAtEnd(3);

				// Checks that the iterator throws after
				assert.throws(
					() => {
						values.next();
					},
					validateUsageError(/Concurrent editing and iteration is not allowed./),
				);
			});

			it("Iterates through the values of the array", () => {
				const array = init(CustomizableNumberArray, [1, 2, 3]);
				const result = [];
				for (const nodeChild of array) {
					result.push(nodeChild);
				}
				assert.deepEqual(result, [1, 2, 3]);
			});

			it("Iterates through the values of an empty array", () => {
				const array = init(CustomizableNumberArray, []);
				const result = [];
				for (const nodeChild of array) {
					result.push(nodeChild);
				}
				assert.deepEqual(result, []);
			});

			it("Iterates through the values of two concurrent iterators", () => {
				const array = init(CustomizableNumberArray, [1, 2, 3]);
				const values1 = array.values();
				const values2 = array.values();
				const result1 = [];
				const result2 = [];
				for (const value of values1) {
					result1.push(value);
					result2.push(values2.next().value);
				}
				assert.deepEqual(result1, [1, 2, 3]);
				assert.deepEqual(result2, [1, 2, 3]);
			});
		},
		() => {
			it("Concurrently iterating and editing should throw an error.", () => {
				const array = hydrate(CustomizableNumberArray, [1, 2, 3]);
				const values = array.values();
				values.next();
				array.removeRange(1, 3);
				assert.throws(
					() => {
						values.next();
					},
					validateUsageError(/Concurrent editing and iteration is not allowed./),
				);
				// Checks that new iterator still works
				const values2 = array.values();
				values2.next();
			});

			it("Iterating when edits were made after the iterator was returned from ArrayNode.values should throw an error.  ", () => {
				const array = hydrate(CustomizableNumberArray, [1, 2, 3]);
				const values = array.values();
				array.removeRange();
				assert.throws(
					() => {
						values.next();
					},
					validateUsageError(/Concurrent editing and iteration is not allowed./),
				);
			});
		},
	);

	describe(" construction", () => {
		it("constructor - empty", () => {
			class Schema extends schemaFactory.array("x", schemaFactory.number) {
				// Adds a member to the derived class which allows these tests to detect if the constructed value isn't typed with the derived class.
				public foo(): void {}
			}
			const _fromIterable: Schema = new Schema([]);
			const _fromUndefined: Schema = new Schema(undefined);
			const _fromNothing: Schema = new Schema();
		});

		it("create - NonClass", () => {
			const Schema = schemaFactory.array(schemaFactory.number);
			type Schema = NodeFromSchema<typeof Schema>;
			const _fromIterable: Schema = Schema.create([]);
			const _fromUndefined: Schema = Schema.create(undefined);
			const _fromNothing: Schema = Schema.create();
		});

		it("constructor - recursive empty", () => {
			class Schema extends schemaFactory.arrayRecursive("x", [() => Schema]) {
				// Adds a member to the derived class which allows these tests to detect if the constructed value isn't typed with the derived class.
				public foo(): void {}
			}
			const _fromIterable: Schema = new Schema([]);
			const _fromUndefined: Schema = new Schema(undefined);
			const _fromNothing: Schema = new Schema();
		});

		describe("implicit construction", () => {
			it("fromArray", () => {
				class Schema extends schemaFactory.array("x", schemaFactory.number) {}
				class Root extends schemaFactory.object("root", { data: Schema }) {}
				const fromArray = new Root({ data: [5] });
				assert.deepEqual([...fromArray.data], [5]);
			});
			it("fromMap", () => {
				class Schema extends schemaFactory.array(
					"x",
					schemaFactory.array([schemaFactory.number, schemaFactory.string]),
				) {}
				class Root extends schemaFactory.object("root", { data: Schema }) {}

				const data = [["x", 5]] as const;
				const json = JSON.stringify(data);

				const fromMap = new Root({ data: new Map(data) });
				assert.equal(JSON.stringify(fromMap.data), json);
			});
			it("fromIterable", () => {
				class Schema extends schemaFactory.array("x", schemaFactory.number) {}
				class Root extends schemaFactory.object("root", { data: Schema }) {}
				const fromArray = new Root({ data: [5] });
				const fromIterable = new Root({ data: new Set([5]) });
				assert.deepEqual([...fromIterable.data], [5]);
			});
		});

		it("nested", () => {
			class Schema extends schemaFactory.array(
				"x",
				schemaFactory.array([schemaFactory.number, schemaFactory.string]),
			) {}
			const data = [["x", 5]] as const;
			const json = JSON.stringify(data);
			const fromArray = new Schema(data);
			assert.equal(JSON.stringify(fromArray), json);
			const fromMap = new Schema(new Map(data));
			assert.equal(JSON.stringify(fromMap), json);
			const fromIterable = new Schema(new Map(data).entries());
			assert.equal(JSON.stringify(fromIterable), json);
		});
	});
});

// Workaround to avoid
// `error TS2310: Type 'RecursiveArray' recursively references itself as a base type.` in the d.ts file.

// Example workaround, see experimental/framework/tree-react-api/src/testExports.ts for an actual test of this including an import.
declare const _RecursiveArrayWorkaround: FixRecursiveArraySchema<typeof RecursiveArray>;
class RecursiveArray extends schemaFactory.arrayRecursive("RA", [() => RecursiveArray]) {}
{
	type _check = ValidateRecursiveSchema<typeof RecursiveArray>;
}

// Invalid case similar to ones generated in d.ts
const Base = schemaFactory.arrayRecursive("RA", [() => RecursiveArray2]);
// @ts-expect-error Separated Base from schema errors.
class RecursiveArray2 extends Base {}

// Invalid case similar to ones generated in d.ts, with workaround:
declare const _RecursiveArrayWorkaround3: FixRecursiveArraySchema<typeof RecursiveArray3>;
const Base3 = schemaFactory.arrayRecursive("RA", [() => RecursiveArray3]);
class RecursiveArray3 extends Base3 {}
