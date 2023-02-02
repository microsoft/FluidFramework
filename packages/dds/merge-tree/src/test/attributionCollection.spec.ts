/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	createWeightedGenerator,
	Generator,
	IRandom,
	makeRandom,
	performFuzzActions,
	take,
} from "@fluid-internal/stochastic-test-utils";
import { AttributionKey } from "@fluidframework/runtime-definitions";
import { AttributionCollection, SerializedAttributionCollection } from "../attributionCollection";
import { BaseSegment, ISegment } from "../mergeTreeNodes";

describe("AttributionCollection", () => {
	describe(".getAtOffset", () => {
		describe("on a collection with a single entry", () => {
			const collection = new AttributionCollection({ type: "op", seq: 100 }, 5);

			it("returns the entry for offsets within the length range", () => {
				for (let i = 0; i < 5; i++) {
					assert.deepEqual(collection.getAtOffset(i), { type: "op", seq: 100 });
				}
			});

			it("throws for queries outside the range", () => {
				assert.throws(() => collection.getAtOffset(-1));
				assert.throws(() => collection.getAtOffset(5));
			});
		});

		describe("on a collection with multiple entries", () => {
			const collection = new AttributionCollection({ type: "op", seq: 100 }, 3);
			collection.append(new AttributionCollection({ type: "op", seq: 101 }, 5));
			it("returns the correct entries", () => {
				for (let i = 0; i < 3; i++) {
					assert.deepEqual(collection.getAtOffset(i), { type: "op", seq: 100 });
				}

				for (let i = 3; i < 8; i++) {
					assert.deepEqual(collection.getAtOffset(i), { type: "op", seq: 101 });
				}
			});
		});
	});

	describe(".splitAt", () => {
		describe("on a collection with 3 entries", () => {
			let collection: AttributionCollection;
			beforeEach(() => {
				collection = new AttributionCollection({ type: "op", seq: 100 }, 3);
				collection.append(new AttributionCollection({ type: "op", seq: 101 }, 2));
				collection.append(new AttributionCollection({ type: "op", seq: 102 }, 1));
			});

			it("can split on non-breakpoints", () => {
				const splitCollection = collection.splitAt(4);
				assert.deepEqual(collection.getAll(), [
					{ offset: 0, key: { type: "op", seq: 100 } },
					{ offset: 3, key: { type: "op", seq: 101 } },
				]);
				assert.equal(collection.length, 4);
				assert.deepEqual(splitCollection.getAll(), [
					{ offset: 0, key: { type: "op", seq: 101 } },
					{ offset: 1, key: { type: "op", seq: 102 } },
				]);
				assert.equal(splitCollection.length, 2);
			});

			it("can split on breakpoints", () => {
				const splitCollection = collection.splitAt(5);
				assert.deepEqual(collection.getAll(), [
					{ offset: 0, key: { type: "op", seq: 100 } },
					{ offset: 3, key: { type: "op", seq: 101 } },
				]);
				assert.equal(collection.length, 5);
				assert.deepEqual(splitCollection.getAll(), [
					{ offset: 0, key: { type: "op", seq: 102 } },
				]);
				assert.equal(splitCollection.length, 1);
			});
		});

		it("can split collection with a single value", () => {
			const collection = new AttributionCollection({ type: "op", seq: 100 }, 5);
			const splitCollection = collection.splitAt(3);
			assert.equal(collection.length, 3);
			assert.equal(splitCollection.length, 2);
			assert.deepEqual(collection.getAll(), [{ offset: 0, key: { type: "op", seq: 100 } }]);
			assert.deepEqual(splitCollection.getAll(), [
				{ offset: 0, key: { type: "op", seq: 100 } },
			]);
		});
	});

	describe(".append", () => {
		it("modifies the receiving collection", () => {
			const collection = new AttributionCollection({ type: "op", seq: 100 }, 2);
			assert.deepEqual(collection.getAll(), [{ offset: 0, key: { type: "op", seq: 100 } }]);
			collection.append(new AttributionCollection({ type: "op", seq: 101 }, 1));
			assert.deepEqual(collection.getAll(), [
				{ offset: 0, key: { type: "op", seq: 100 } },
				{ offset: 2, key: { type: "op", seq: 101 } },
			]);
		});

		it("does not modify the argument collection", () => {
			const collection = new AttributionCollection({ type: "op", seq: 100 }, 2);
			const appendedCollection = new AttributionCollection({ type: "op", seq: 101 }, 1);
			assert.deepEqual(appendedCollection.getAll(), [
				{ offset: 0, key: { type: "op", seq: 101 } },
			]);
			collection.append(appendedCollection);
			assert.deepEqual(appendedCollection.getAll(), [
				{ offset: 0, key: { type: "op", seq: 101 } },
			]);
		});

		it("coalesces referentially equal values at the join point", () => {
			const collection = new AttributionCollection({ type: "op", seq: 100 }, 2);
			collection.append(new AttributionCollection({ type: "op", seq: 100 }, 7));
			assert.deepEqual(collection.getAll(), [{ offset: 0, key: { type: "op", seq: 100 } }]);
			assert.equal(collection.length, 9);
		});
	});

	describe(".populateAttributionCollections", () => {
		it("correctly splits segment boundaries on breakpoints", () => {
			const segments = [{ cachedLength: 5 }, { cachedLength: 4 }] as ISegment[];
			AttributionCollection.populateAttributionCollections(segments, {
				length: 9,
				posBreakpoints: [0, 2, 5, 7],
				seqs: [10, 12, 15, 17],
			});
			assert.deepEqual(segments[0].attribution?.getAll(), [
				{ offset: 0, key: { type: "op", seq: 10 } },
				{ offset: 2, key: { type: "op", seq: 12 } },
			]);

			assert.deepEqual(segments[1].attribution?.getAll(), [
				{ offset: 0, key: { type: "op", seq: 15 } },
				{ offset: 2, key: { type: "op", seq: 17 } },
			]);

			for (const segment of segments) {
				assert.equal(segment.attribution?.length, segment.cachedLength);
			}
		});

		it("correctly splits segment boundaries between breakpoints", () => {
			const segments = [{ cachedLength: 4 }, { cachedLength: 5 }] as ISegment[];
			AttributionCollection.populateAttributionCollections(segments, {
				length: 9,
				posBreakpoints: [0, 2, 5, 7],
				seqs: [10, 12, 15, 17],
			});
			assert.deepEqual(segments[0].attribution?.getAll(), [
				{ offset: 0, key: { type: "op", seq: 10 } },
				{ offset: 2, key: { type: "op", seq: 12 } },
			]);

			assert.deepEqual(segments[1].attribution?.getAll(), [
				{ offset: 0, key: { type: "op", seq: 12 } },
				{ offset: 1, key: { type: "op", seq: 15 } },
				{ offset: 3, key: { type: "op", seq: 17 } },
			]);

			for (const segment of segments) {
				assert.equal(segment.attribution?.length, segment.cachedLength);
			}
		});
	});

	describe("serializeAttributionCollections", () => {
		it("combines equal values on endpoints", () => {
			const segments = [
				{
					attribution: new AttributionCollection({ type: "op", seq: 0 }, 4),
					cachedLength: 4,
				},
				{
					attribution: new AttributionCollection({ type: "op", seq: 0 }, 5),
					cachedLength: 5,
				},
			] as unknown as ISegment[];
			const blob = AttributionCollection.serializeAttributionCollections(segments);
			assert.deepEqual(blob, {
				posBreakpoints: [0],
				seqs: [0],
				length: 9,
			});
		});

		it("validates either all segments or no segments have attribution tracking", () => {
			const segments = [
				{
					attribution: new AttributionCollection({ type: "op", seq: 0 }, 4),
					cachedLength: 4,
				},
				{ cachedLength: 5 },
			] as ISegment[];
			assert.throws(() => AttributionCollection.serializeAttributionCollections(segments));
		});
	});

	describe("serializeAttributionCollections and populateAttributionCollections round-trip", () => {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		const seg = (length: number): ISegment => ({ cachedLength: length } as ISegment);
		const testCases: {
			name: string;
			blob: SerializedAttributionCollection;
			segments: ISegment[];
		}[] = [
			{
				name: "single key",
				blob: {
					length: 3,
					posBreakpoints: [0],
					seqs: [51],
				},
				segments: [seg(3)],
			},
			{
				name: "several keys on a single segment",
				blob: {
					length: 7,
					posBreakpoints: [0, 1, 3, 5],
					seqs: [1, 2, 3, 4],
				},
				segments: [seg(7)],
			},
			{
				name: "key spanning multiple segments",
				blob: {
					length: 7,
					posBreakpoints: [0],
					seqs: [1],
				},
				segments: [seg(3), seg(4)],
			},
			{
				name: "key and segment boundary that align",
				blob: {
					length: 7,
					posBreakpoints: [0, 3],
					seqs: [0, 1],
				},
				segments: [seg(3), seg(4)],
			},
		];

		for (const { name, blob, segments } of testCases) {
			it(name, () => {
				AttributionCollection.populateAttributionCollections(segments, blob);
				assert.deepEqual(
					AttributionCollection.serializeAttributionCollections(segments),
					blob,
				);
			});
		}
	});

	describe(".clone", () => {
		it("copies the original collection", () => {
			const collection = new AttributionCollection({ type: "op", seq: 100 }, 2);
			const appendedCollection = new AttributionCollection({ type: "op", seq: 101 }, 1);
			const copy = collection.clone();
			collection.append(appendedCollection);
			assert.deepEqual(collection.getAll(), [
				{ offset: 0, key: { type: "op", seq: 100 } },
				{ offset: 2, key: { type: "op", seq: 101 } },
			]);
			assert.deepEqual(copy.getAll(), [{ offset: 0, key: { type: "op", seq: 100 } }]);
		});
	});

	describe("serialized structure is independent of segment lengths", () => {
		interface State {
			random: IRandom;
			segments: ISegment[];
		}

		interface InsertAction {
			type: "insert";
			length: number;
			attributionKey: AttributionKey;
		}

		interface SplitAction {
			type: "split";
			segIndex: number;
			offset: number;
		}

		interface AppendAction {
			type: "append";
			segIndex: number;
		}

		class Segment extends BaseSegment {
			public readonly type = "testSeg";
			public constructor(length: number) {
				super();
				this.cachedLength = length;
			}

			public toJSONObject() {
				return { length: this.cachedLength, props: this.properties };
			}

			public clone(): ISegment {
				const seg = new Segment(this.cachedLength);
				this.cloneInto(seg);
				return seg;
			}

			protected createSplitSegmentAt(pos: number): BaseSegment | undefined {
				if (pos > 0) {
					const leafSegment = new Segment(this.cachedLength - pos);
					this.cachedLength = pos;
					return leafSegment;
				}
			}
		}

		for (let seed = 0; seed < 10; seed++) {
			const segmentCount = 100;
			it(`with randomly generated segments, seed ${seed}`, () => {
				const insertGenerator: Generator<InsertAction, State> = take(
					segmentCount,
					({ random }) => ({
						type: "insert",
						length: random.integer(1, 20),
						attributionKey: { type: "op", seq: random.integer(0, 10) },
					}),
				);

				const initialState = performFuzzActions<InsertAction, State>(
					insertGenerator,
					{
						insert: (state, { length, attributionKey }) => {
							const { segments } = state;
							const seg = new Segment(length);
							seg.attribution = new AttributionCollection(attributionKey, length);
							segments.push(seg);
							return state;
						},
					},
					{ random: makeRandom(seed), segments: [] },
				);

				const expected = AttributionCollection.serializeAttributionCollections(
					initialState.segments,
				);

				const split: Generator<SplitAction, State> = ({ segments, random }) => {
					const validIndices = segments
						.map((seg, i) => (seg.cachedLength > 1 ? i : -1))
						.filter((i) => i >= 0);

					const segIndex = random.pick(validIndices);
					const offset = random.integer(1, segments[segIndex].cachedLength - 1);
					return {
						type: "split",
						segIndex,
						offset,
					};
				};
				const append: Generator<AppendAction, State> = ({ random, segments }) => {
					return {
						type: "append",
						segIndex: random.integer(0, segments.length - 2),
					};
				};
				const finalState = performFuzzActions<SplitAction | AppendAction, State>(
					take(
						segmentCount,
						// Note: if playing around with constants in this test, it may be necessary to
						// introduce acceptance criteria here for split.
						createWeightedGenerator<SplitAction | AppendAction, State>([
							[split, 1],
							[append, 1, ({ segments }) => segments.length > 1],
						]),
					),
					{
						split: (state, { segIndex, offset }) => {
							const { segments } = state;
							const splitSeg = segments[segIndex].splitAt(offset);
							assert(splitSeg !== undefined);
							segments.splice(segIndex + 1, 0, splitSeg);
							return state;
						},
						append: (state, { segIndex }) => {
							const { segments } = state;
							segments[segIndex].append(segments[segIndex + 1]);
							segments.splice(segIndex + 1, 1);
							return state;
						},
					},
					initialState,
				);

				assert.deepEqual(
					AttributionCollection.serializeAttributionCollections(finalState.segments),
					expected,
				);
			});
		}
	});
});
