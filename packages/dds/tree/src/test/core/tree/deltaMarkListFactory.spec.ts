/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type DeltaFieldMap,
	type DeltaMark,
	DeltaMarkListFactory,
	type RevisionTag,
	makeDetachedNodeId,
	rootFieldKey,
} from "../../../core/index.js";
import { mintRevisionTag } from "../../utils.js";

describe("DeltaMarkListFactory", () => {
	const revision = mintRevisionTag();
	const otherRevision = mintRevisionTag();
	const dummyMark: DeltaMark = { count: 1, attach: { minor: 0 } };
	const kinds = ["retain", "attach", "detach", "replace"] as const;
	type Kind = (typeof kinds)[number];

	function makeMark(kind: Kind, count: number, start: number, major?: RevisionTag): DeltaMark {
		return {
			count,
			...(kind === "attach" || kind === "replace"
				? { attach: makeDetachedNodeId(major, start) }
				: {}),
			...(kind === "detach" || kind === "replace"
				? { detach: makeDetachedNodeId(major, start + 100) }
				: {}),
		};
	}

	it("Starts with an empty list", () => {
		const factory = new DeltaMarkListFactory();
		assert.deepStrictEqual(factory.list, []);
	});

	it("Inserts an retain mark only when followed by a change", () => {
		const factory = new DeltaMarkListFactory();
		factory.push({ count: 42 });
		assert.deepStrictEqual(factory.list, []);
		factory.push(dummyMark);
		assert.deepStrictEqual(factory.list, [{ count: 42 }, dummyMark]);
	});

	it("Combines retain marks", () => {
		const factory = new DeltaMarkListFactory();
		factory.push({ count: 1 });
		factory.push({ count: 10 });
		factory.push({ count: 100 });
		factory.push(dummyMark);
		assert.deepStrictEqual(factory.list, [{ count: 111 }, dummyMark]);
	});

	it("Omits zero-length retain marks", () => {
		const factory = new DeltaMarkListFactory();
		factory.push({ count: 0 });
		factory.push(dummyMark);
		assert.deepStrictEqual(factory.list, [dummyMark]);
	});

	it("Omits trailing retain marks", () => {
		const factory = new DeltaMarkListFactory();
		factory.push(dummyMark);
		factory.push({ count: 3 });
		factory.push({ count: 4 });
		assert.deepStrictEqual(factory.list, [dummyMark]);
	});

	it("Keeps retain marks between changes and resets the pending offset", () => {
		const factory = new DeltaMarkListFactory();
		factory.push({ count: 2 });
		factory.push(dummyMark);
		factory.push({ count: 3 });
		factory.push(dummyMark);
		factory.push(dummyMark);
		assert.deepStrictEqual(factory.list, [
			{ count: 2 },
			dummyMark,
			{ count: 3 },
			dummyMark,
			dummyMark,
		]);
	});

	for (const kind of kinds) {
		it(`Omits zero-count ${kind} marks without flushing offsets`, () => {
			const factory = new DeltaMarkListFactory();
			factory.push({ count: 2 });
			factory.push(makeMark(kind, 0, 0));
			assert.deepStrictEqual(factory.list, []);
			factory.push(dummyMark);
			assert.deepStrictEqual(factory.list, [{ count: 2 }, dummyMark]);
		});
	}

	for (const kind of ["attach", "detach", "replace"] as const) {
		for (const major of [undefined, revision]) {
			it(`Merges consecutive ${kind} ranges ${major === undefined ? "without" : "with"} a revision`, () => {
				const factory = new DeltaMarkListFactory();
				factory.push(makeMark(kind, 1, 1, major));
				factory.push(makeMark(kind, 10, 2, major));
				factory.push(makeMark(kind, 100, 12, major));
				assert.deepStrictEqual(factory.list, [makeMark(kind, 111, 1, major)]);
			});
		}

		for (const gap of [-1, 1]) {
			it(`Does not merge ${kind} ranges with ${gap < 0 ? "an overlap" : "a gap"}`, () => {
				const marks = [makeMark(kind, 2, 10), makeMark(kind, 3, 12 + gap)];
				const factory = new DeltaMarkListFactory();
				factory.push(marks[0]);
				factory.push(marks[1]);
				assert.deepStrictEqual(factory.list, marks);
			});
		}

		for (const [firstRevision, secondRevision] of [
			[revision, otherRevision],
			[undefined, revision],
			[revision, undefined],
		]) {
			it(`Does not merge ${kind} ranges with revisions ${firstRevision} and ${secondRevision}`, () => {
				const marks = [
					makeMark(kind, 2, 10, firstRevision),
					makeMark(kind, 3, 12, secondRevision),
				];
				const factory = new DeltaMarkListFactory();
				factory.push(marks[0]);
				factory.push(marks[1]);
				assert.deepStrictEqual(factory.list, marks);
			});
		}

		it(`Does not merge ${kind} ranges across retains`, () => {
			const marks = [makeMark(kind, 2, 10), { count: 1 }, makeMark(kind, 3, 12)];
			const factory = new DeltaMarkListFactory();
			factory.push(marks[0]);
			factory.push(marks[1]);
			factory.push(marks[2]);
			assert.deepStrictEqual(factory.list, marks);
		});

		it(`Does not mutate input ${kind} marks when merging`, () => {
			const first = Object.freeze(makeMark(kind, 2, 10));
			const second = Object.freeze(makeMark(kind, 3, 12));
			const factory = new DeltaMarkListFactory();
			factory.push(first);
			factory.push(second);
			assert.deepStrictEqual(factory.list, [makeMark(kind, 5, 10)]);
			assert.deepStrictEqual(first, makeMark(kind, 2, 10));
			assert.deepStrictEqual(second, makeMark(kind, 3, 12));
		});
	}

	for (const firstKind of kinds) {
		for (const secondKind of kinds) {
			if (firstKind === secondKind) {
				continue;
			}
			it(`Does not merge ${firstKind} with ${secondKind}`, () => {
				const first = makeMark(firstKind, 2, 10);
				const second = makeMark(secondKind, 3, 12);
				const factory = new DeltaMarkListFactory();
				factory.push(first);
				factory.push(second);
				assert.deepStrictEqual(
					factory.list,
					secondKind === "retain" ? [first] : [first, second],
				);
			});
		}
	}

	for (const idKind of ["attach", "detach"] as const) {
		for (const discontinuity of ["minor", "major"] as const) {
			it(`Does not merge replacements when only ${idKind}.${discontinuity} is discontinuous`, () => {
				const first = makeMark("replace", 2, 10, revision);
				const second = {
					...makeMark("replace", 3, 12, revision),
					[idKind]: makeDetachedNodeId(
						discontinuity === "major" ? otherRevision : revision,
						(idKind === "attach" ? 12 : 112) + (discontinuity === "minor" ? 1 : 0),
					),
				};
				const marks = [first, second];
				const factory = new DeltaMarkListFactory();
				factory.push(first);
				factory.push(second);
				assert.deepStrictEqual(factory.list, marks);
			});
		}
	}

	const nestedFields: DeltaFieldMap = new Map([
		[rootFieldKey, { marks: [{ count: 1, detach: { minor: 200 } }] }],
	]);
	for (const kind of ["retain", "detach", "replace"] as const) {
		for (const fields of [new Map(), nestedFields]) {
			for (const position of ["first", "second", "both"] as const) {
				it(`Keeps ${kind} marks with ${fields.size === 0 ? "empty" : "nested"} fields on ${position} separate`, () => {
					const first: DeltaMark = {
						...makeMark(kind, 1, 10),
						...(position === "second" ? {} : { fields }),
					};
					const second: DeltaMark = {
						...makeMark(kind, 1, 11),
						...(position === "first" ? {} : { fields }),
					};
					const factory = new DeltaMarkListFactory();
					factory.push(first);
					factory.push(second);
					factory.push(dummyMark);
					assert.deepStrictEqual(factory.list, [first, second, dummyMark]);
				});
			}
		}
	}

	it("Omits zero-count marks between otherwise mergeable ranges", () => {
		const factory = new DeltaMarkListFactory();
		factory.push(makeMark("attach", 2, 10));
		factory.push(makeMark("detach", 0, 42));
		factory.push(makeMark("attach", 3, 12));
		assert.deepStrictEqual(factory.list, [makeMark("attach", 5, 10)]);
	});
});
