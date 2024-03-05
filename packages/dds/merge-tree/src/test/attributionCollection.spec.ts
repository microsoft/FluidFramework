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
} from "@fluid-private/stochastic-test-utils";
import { AttributionKey } from "@fluidframework/runtime-definitions";
import {
	AttributionCollection,
	SerializedAttributionCollection,
} from "../attributionCollection.js";
import { BaseSegment, ISegment } from "../mergeTreeNodes.js";

const opKey = (seq: number): AttributionKey => ({ type: "op", seq });
const detachedKey: AttributionKey = { type: "detached", id: 0 };

describe("AttributionCollection", () => {
	const makeCollectionWithChannel = ({ length, seq }: { length: number; seq: number }) => {
		const collection = new AttributionCollection(length, null);
		collection.update("foo", new AttributionCollection(length, opKey(seq)));
		return collection;
	};

	describe(".getAtOffset", () => {
		describe("on a collection with a single entry", () => {
			const collection = new AttributionCollection(5, opKey(100));

			it("returns the entry for offsets within the length range", () => {
				for (let i = 0; i < 5; i++) {
					assert.deepEqual(collection.getAtOffset(i), opKey(100));
				}
			});

			it("throws for queries outside the range", () => {
				assert.throws(() => collection.getAtOffset(-1));
				assert.throws(() => collection.getAtOffset(5));
			});
		});

		describe("on a collection with multiple entries", () => {
			const collection = new AttributionCollection(3, opKey(100));
			collection.append(new AttributionCollection(5, opKey(101)));
			it("returns the correct entries", () => {
				for (let i = 0; i < 3; i++) {
					assert.deepEqual(collection.getAtOffset(i), opKey(100));
				}

				for (let i = 3; i < 8; i++) {
					assert.deepEqual(collection.getAtOffset(i), opKey(101));
				}
			});
		});

		it("works on collections with entries in channels", () => {
			const collection = makeCollectionWithChannel({ length: 3, seq: 300 });
			for (const offset of [0, 1, 2]) {
				assert.deepEqual(collection.getAtOffset(offset, "foo"), opKey(300));
			}
		});
	});

	describe(".splitAt", () => {
		describe("on a collection with 3 entries", () => {
			let collection: AttributionCollection;
			beforeEach(() => {
				collection = new AttributionCollection(3, opKey(100));
				collection.append(new AttributionCollection(2, opKey(101)));
				collection.append(new AttributionCollection(1, opKey(102)));
			});

			it("can split on non-breakpoints", () => {
				const splitCollection = collection.splitAt(4);
				assert.deepEqual(collection.getAll().root, [
					{ offset: 0, key: opKey(100) },
					{ offset: 3, key: opKey(101) },
				]);
				assert.equal(collection.length, 4);
				assert.deepEqual(splitCollection.getAll().root, [
					{ offset: 0, key: opKey(101) },
					{ offset: 1, key: opKey(102) },
				]);
				assert.equal(splitCollection.length, 2);
			});

			it("can split on breakpoints", () => {
				const splitCollection = collection.splitAt(5);
				assert.deepEqual(collection.getAll().root, [
					{ offset: 0, key: opKey(100) },
					{ offset: 3, key: opKey(101) },
				]);
				assert.equal(collection.length, 5);
				assert.deepEqual(splitCollection.getAll().root, [{ offset: 0, key: opKey(102) }]);
				assert.equal(splitCollection.length, 1);
			});
		});

		it("can split collection with a single value", () => {
			const collection = new AttributionCollection(5, opKey(100));
			const splitCollection = collection.splitAt(3);
			assert.equal(collection.length, 3);
			assert.equal(splitCollection.length, 2);
			assert.deepEqual(collection.getAll().root, [{ offset: 0, key: opKey(100) }]);
			assert.deepEqual(splitCollection.getAll().root, [{ offset: 0, key: opKey(100) }]);
		});

		it("splits channels", () => {
			const collection = new AttributionCollection(5, null);
			collection.update("foo", new AttributionCollection(5, opKey(100)));
			const splitCollection = collection.splitAt(2);
			assert.deepEqual(collection.getAll().channels, {
				foo: [{ offset: 0, key: opKey(100) }],
			});
			assert.deepEqual(splitCollection.getAll().channels, {
				foo: [{ offset: 0, key: opKey(100) }],
			});
		});
	});

	describe(".append", () => {
		it("modifies the receiving collection", () => {
			const collection = new AttributionCollection(2, opKey(100));
			assert.deepEqual(collection.getAll().root, [{ offset: 0, key: opKey(100) }]);
			collection.append(new AttributionCollection(1, opKey(101)));
			assert.deepEqual(collection.getAll().root, [
				{ offset: 0, key: opKey(100) },
				{ offset: 2, key: opKey(101) },
			]);
		});

		it("does not modify the argument collection", () => {
			const collection = new AttributionCollection(2, opKey(100));
			const appendedCollection = new AttributionCollection(1, opKey(101));
			assert.deepEqual(appendedCollection.getAll().root, [{ offset: 0, key: opKey(101) }]);
			collection.append(appendedCollection);
			assert.deepEqual(appendedCollection.getAll().root, [{ offset: 0, key: opKey(101) }]);
		});

		it("coalesces referentially equal values at the join point", () => {
			const collection = new AttributionCollection(2, opKey(100));
			collection.append(new AttributionCollection(7, opKey(100)));
			assert.deepEqual(collection.getAll().root, [{ offset: 0, key: opKey(100) }]);
			assert.equal(collection.length, 9);
		});

		describe("appends channels", () => {
			it("when both collections have the channel", () => {
				const appender = makeCollectionWithChannel({ length: 2, seq: 100 });
				appender.append(makeCollectionWithChannel({ length: 5, seq: 200 }));
				assert.deepEqual(appender.getAll(), {
					length: 7,
					root: [{ offset: 0, key: null }],
					channels: {
						foo: [
							{
								offset: 0,
								key: opKey(100),
							},
							{
								offset: 2,
								key: opKey(200),
							},
						],
					},
				});
			});

			it("when only appended collection has a channel", () => {
				const appender = new AttributionCollection(2, null);
				appender.append(makeCollectionWithChannel({ length: 5, seq: 200 }));
				assert.deepEqual(appender.getAll(), {
					length: 7,
					root: [{ offset: 0, key: null }],
					channels: {
						foo: [
							{
								offset: 0,
								key: null,
							},
							{
								offset: 2,
								key: opKey(200),
							},
						],
					},
				});
			});

			it("when only segment being appended to has a channel", () => {
				const appender = makeCollectionWithChannel({ length: 2, seq: 100 });
				appender.append(new AttributionCollection(5, null));
				assert.deepEqual(appender.getAll(), {
					length: 7,
					root: [{ offset: 0, key: null }],
					channels: {
						foo: [
							{
								offset: 0,
								key: opKey(100),
							},
							{
								offset: 2,
								key: null,
							},
						],
					},
				});
			});
		});
	});

	describe(".channelNames", () => {
		it("is empty when collection has no channels", () => {
			const collection = new AttributionCollection(2, opKey(100));
			assert.deepEqual(collection.channelNames, []);
		});

		it("returns all channels with content for collection with channels", () => {
			const collection = new AttributionCollection(2, opKey(100));
			collection.update("foo", new AttributionCollection(2));
			collection.update("bar", new AttributionCollection(2));
			assert.deepEqual(collection.channelNames, ["foo", "bar"]);
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
			assert.deepEqual(segments[0].attribution?.getAll().root, [
				{ offset: 0, key: opKey(10) },
				{ offset: 2, key: opKey(12) },
			]);

			assert.deepEqual(segments[1].attribution?.getAll().root, [
				{ offset: 0, key: opKey(15) },
				{ offset: 2, key: opKey(17) },
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
			assert.deepEqual(segments[0].attribution?.getAll().root, [
				{ offset: 0, key: opKey(10) },
				{ offset: 2, key: opKey(12) },
			]);

			assert.deepEqual(segments[1].attribution?.getAll().root, [
				{ offset: 0, key: opKey(12) },
				{ offset: 1, key: opKey(15) },
				{ offset: 3, key: opKey(17) },
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
					attribution: new AttributionCollection(4, opKey(0)),
					cachedLength: 4,
				},
				{
					attribution: new AttributionCollection(5, opKey(0)),
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
	});

	describe("serializeAttributionCollections and populateAttributionCollections round-trip", () => {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		const seg = (length: number): ISegment => ({ cachedLength: length }) as ISegment;
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
			{
				name: "detached attribution keys",
				blob: {
					length: 7,
					posBreakpoints: [0, 3],
					seqs: [1, detachedKey],
				},
				segments: [seg(3), seg(4)],
			},
			{
				name: "entry with channels",
				blob: {
					length: 7,
					posBreakpoints: [0, 5],
					seqs: [3, null],
					channels: {
						foo: {
							posBreakpoints: [0, 3, 5],
							seqs: [4, null, 5],
						},
					},
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
			const collection = new AttributionCollection(2, opKey(100));
			const appendedCollection = new AttributionCollection(1, opKey(101));
			const copy = collection.clone();
			collection.append(appendedCollection);
			assert.deepEqual(collection.getAll().root, [
				{ offset: 0, key: opKey(100) },
				{ offset: 2, key: opKey(101) },
			]);
			assert.deepEqual(copy.getAll().root, [{ offset: 0, key: opKey(100) }]);
		});

		it("copies channels", () => {
			const collection = makeCollectionWithChannel({ length: 2, seq: 25 });
			const appendedCollection = makeCollectionWithChannel({ length: 3, seq: 26 });
			const copy = collection.clone();
			collection.append(appendedCollection);
			assert.deepEqual(collection.getAll().channels?.foo, [
				{ offset: 0, key: opKey(25) },
				{ offset: 2, key: opKey(26) },
			]);
			assert.deepEqual(copy.getAll().channels?.foo, [{ offset: 0, key: opKey(25) }]);
		});
	});

	describe(".update", () => {
		let collection: AttributionCollection;
		beforeEach(() => {
			collection = new AttributionCollection(2, null);
			collection.update("bar", new AttributionCollection(2, opKey(10)));
			assert.deepEqual(
				collection.getAtOffset(0, "foo"),
				undefined,
				"channel should be undefined on creation",
			);
		});

		afterEach(() => {
			assert.deepEqual(
				collection.getAtOffset(0, "bar"),
				opKey(10),
				"update should never modify unrelated channels",
			);
		});

		it("creates a new channel when updating from an undefined state", () => {
			collection.update("foo", new AttributionCollection(2, opKey(5)));
			assert.deepEqual(collection.getAtOffset(0, "foo"), opKey(5));
		});

		it("overrides earlier calls with later ones", () => {
			collection.update("foo", new AttributionCollection(2, opKey(3)));
			collection.update("foo", new AttributionCollection(2, opKey(5)));
			assert.deepEqual(collection.getAtOffset(0, "foo"), opKey(5));
		});

		it("can update the root channel", () => {
			collection.update(undefined, new AttributionCollection(2, opKey(3)));
			assert.deepEqual(collection.getAtOffset(0), opKey(3));
		});

		it("doesn't tolerate updates to channels having inconsistent length fields", () => {
			assert.throws(() => collection.update("foo", new AttributionCollection(3, null)));
		});
	});

	describe("serialized structure is independent of segment lengths", () => {
		interface State {
			random: IRandom;
			segments: ISegment[];
		}

		interface InsertAction {
			type: "insert";
			collection: AttributionCollection;
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
				const generateAttributionKey = (random: IRandom): AttributionKey | null =>
					random.bool(0.8)
						? opKey(random.integer(0, 10))
						: random.bool()
						? detachedKey
						: null;

				const channelNamePool = ["ch1", "ch2", "ch3"];
				const insertGenerator: Generator<InsertAction, State> = take(
					segmentCount,
					({ random }) => {
						const length = random.integer(1, 20);
						const collection = new AttributionCollection(
							length,
							generateAttributionKey(random),
						);
						if (random.bool(0.25)) {
							for (const channel of channelNamePool) {
								if (random.bool()) {
									collection.update(
										channel,
										new AttributionCollection(
											length,
											generateAttributionKey(random),
										),
									);
								}
							}
						}
						return {
							type: "insert",
							collection,
						};
					},
				);

				const initialState = performFuzzActions<InsertAction, State>(
					insertGenerator,
					{
						insert: (state, { collection }) => {
							const { segments } = state;
							const seg = new Segment(collection.length);
							seg.attribution = collection;
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
