/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { type IJsonCodec, makeCodecFamily } from "../codec/index.js";
import {
	AnchorSet,
	type ChangeEncodingContext,
	type ChangeFamily,
	type ChangeFamilyCodec,
	type ChangeFamilyEditor,
	type ChangeRebaser,
	type DeltaFieldMap,
	type DeltaRoot,
	type FieldKey,
	type RevisionTag,
	type TaggedChange,
	emptyDelta,
} from "../core/index.js";
import { type JsonCompatibleReadOnly, type RecursiveReadonly, brand } from "../util/index.js";
import { deepFreeze } from "@fluidframework/test-runtime-utils/internal";

export interface NonEmptyTestChange {
	/**
	 * Identifies the document state that the change should apply to.
	 * Represented as the concatenation of all previous intentions.
	 */
	inputContext: number[];
	/**
	 * Identifies the document state brought about by applying the change to the document.
	 * Represented as the concatenation of all previous intentions and the intentions in this change.
	 */
	outputContext: number[];
	/**
	 * Identifies the editing intentions included in the change.
	 * Editing intentions can be thought of as user actions, where each user action is unique.
	 * Editing intentions can be inverted (represented negative number of the same magnitude) but are
	 * otherwise unchanged by rebasing.
	 */
	intentions: number[];
}

export interface EmptyTestChange {
	intentions: [];
}

export type TestChange = NonEmptyTestChange | EmptyTestChange;

function isNonEmptyChange(
	change: RecursiveReadonly<TestChange>,
): change is RecursiveReadonly<NonEmptyTestChange> {
	return "inputContext" in change;
}

function mint(
	inputContext: readonly number[],
	intention: number | number[],
): NonEmptyTestChange {
	const intentions = Array.isArray(intention) ? intention : [intention];
	return {
		inputContext: composeIntentions([], inputContext),
		intentions,
		outputContext: composeIntentions(inputContext, intentions),
	};
}

function composeIntentions(base: readonly number[], extras: readonly number[]): number[] {
	const composed = [...base];
	let last: number | undefined = composed[composed.length - 1];
	for (const extra of extras) {
		// Check wether we are composing intentions that cancel each other out.
		// This helps us ensure that we always represent sequences of intentions
		// in the same canonical form.
		if (last === -extra) {
			composed.pop();
			last = composed[composed.length - 1];
		} else {
			composed.push(extra);
			last = extra;
		}
	}
	return composed;
}

function compose(
	change1: TestChange | undefined,
	change2: TestChange | undefined,
	verify: boolean = true,
): TestChange {
	return composeList(getArrayWithoutUndefined([change1, change2]), verify);
}

function composeList(changes: TestChange[], verify: boolean = true): TestChange {
	let inputContext: number[] | undefined;
	let outputContext: number[] | undefined;
	let intentions: number[] = [];
	for (const change of changes) {
		if (isNonEmptyChange(change)) {
			inputContext ??= change.inputContext;
			if (verify && outputContext !== undefined) {
				// The input context should match the output context of the previous change.
				assert.deepEqual(change.inputContext, outputContext);
			}
			outputContext = composeIntentions(outputContext ?? inputContext, change.intentions);
			intentions = composeIntentions(intentions, change.intentions);
		}
	}
	if (intentions.length !== 0 && inputContext !== undefined) {
		return {
			inputContext,
			intentions,
			outputContext: outputContext ?? fail(),
		};
	}
	return emptyChange;
}

function getArrayWithoutUndefined<T>(array: (T | undefined)[]): T[] {
	const result: T[] = [];
	for (const item of array) {
		if (item !== undefined) {
			result.push(item);
		}
	}
	return result;
}

function invert(change: TestChange): TestChange {
	if (isNonEmptyChange(change)) {
		return {
			inputContext: change.outputContext,
			outputContext: change.inputContext,
			intentions: change.intentions.map((i) => -i).reverse(),
		};
	}
	return emptyChange;
}

function rebase(
	change: TestChange | undefined,
	over: TestChange | undefined,
): TestChange | undefined {
	if (change === undefined) {
		return undefined;
	}

	if (over === undefined) {
		return change;
	}

	if (isNonEmptyChange(change)) {
		if (isNonEmptyChange(over)) {
			// Rebasing should only occur between two changes with the same input context
			assert.deepEqual(change.inputContext, over.inputContext);
			return {
				inputContext: over.outputContext,
				outputContext: composeIntentions(over.outputContext, change.intentions),
				intentions: change.intentions,
			};
		}
		return change;
	}
	return TestChange.emptyChange;
}

function checkChangeList(
	changes: readonly RecursiveReadonly<TestChange>[],
	intentions: number[],
): void {
	const filtered = changes.filter(isNonEmptyChange);
	let intentionsSeen: number[] = [];
	let index = 0;
	for (const change of filtered) {
		intentionsSeen = composeIntentions(intentionsSeen, change.intentions);
		if (index > 0) {
			const prev = filtered[index - 1];
			// The current change should apply to the context brought about by the previous change
			assert.deepEqual(change.inputContext, prev.outputContext);
		}
		++index;
	}
	// All expected intentions were present
	assert.deepEqual(intentionsSeen, intentions);
}

function toDelta({ change }: TaggedChange<TestChange>): DeltaFieldMap {
	if (change.intentions.length > 0) {
		return new Map([
			[
				// We represent the intentions as a list if node offsets in some imaginary field "testIntentions".
				// This is purely for the sake of testing.
				brand("testIntentions"),
				change.intentions.map((i) => ({ count: i })),
			],
		]);
	}
	return new Map();
}

export interface AnchorRebaseData {
	rebases: RecursiveReadonly<NonEmptyTestChange>[];
	intentions: number[];
}

const emptyChange: TestChange = {
	intentions: [],
};

const codec: IJsonCodec<
	TestChange,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	ChangeEncodingContext
> &
	ChangeFamilyCodec<TestChange> = {
	encode: (x) => x as unknown as JsonCompatibleReadOnly,
	decode: (x) => x as unknown as TestChange,
};

export const TestChange = {
	emptyChange,
	mint,
	compose,
	composeList,
	invert,
	rebase,
	checkChangeList,
	toDelta,
	isEmpty,
	codec,
	codecs: makeCodecFamily([
		[1, codec],
		[2, codec],
		[3, codec],
		[4, codec],
	]),
};
deepFreeze(TestChange);

export class TestChangeRebaser implements ChangeRebaser<TestChange> {
	public compose(changes: TaggedChange<TestChange>[]): TestChange {
		return composeList(changes.map((c) => c.change));
	}

	public invert(change: TaggedChange<TestChange>): TestChange {
		return invert(change.change);
	}

	public rebase(change: TaggedChange<TestChange>, over: TaggedChange<TestChange>): TestChange {
		return (
			rebase(change.change, over.change) ?? {
				intentions: [],
			}
		);
	}

	public changeRevision(
		change: TestChange,
		newRevision: RevisionTag | undefined,
		rollbackOf?: RevisionTag,
	): TestChange {
		return change;
	}
}

export class UnrebasableTestChangeRebaser extends TestChangeRebaser {
	public override rebase(
		change: TaggedChange<TestChange>,
		over: TaggedChange<TestChange>,
	): TestChange {
		assert.fail("Unexpected call to rebase");
	}
}

export class NoOpChangeRebaser extends TestChangeRebaser {
	public rebasedCount = 0;
	public invertedCount = 0;
	public composedCount = 0;

	public override rebase(
		change: TaggedChange<TestChange>,
		over: TaggedChange<TestChange>,
	): TestChange {
		this.rebasedCount += 1;
		return change.change;
	}

	public override invert(change: TaggedChange<TestChange>): TestChange {
		this.invertedCount += 1;
		return change.change;
	}

	public override compose(changes: TaggedChange<TestChange>[]): TestChange {
		this.composedCount += changes.length;
		return changes.length === 0 ? emptyChange : changes[0].change;
	}
}

export class ConstrainedTestChangeRebaser extends TestChangeRebaser {
	public constructor(
		private readonly constraint: (
			change: TaggedChange<TestChange>,
			over: TaggedChange<TestChange>,
		) => boolean,
	) {
		super();
	}

	public override rebase(
		change: TaggedChange<TestChange>,
		over: TaggedChange<TestChange>,
	): TestChange {
		assert(this.constraint(change, over));
		return super.rebase(change, over);
	}
}

export class TestAnchorSet extends AnchorSet implements AnchorRebaseData {
	public rebases: RecursiveReadonly<NonEmptyTestChange>[] = [];
	public intentions: number[] = [];
}

export type TestChangeFamily = ChangeFamily<ChangeFamilyEditor, TestChange>;

const rootKey: FieldKey = brand("root");

/**
 * This is a hack to encode arbitrary information (the intentions) into a Delta
 * The resulting Delta does not represent a concrete change to a document tree.
 * It is instead used as composite value in deep comparisons that verify that `EditManager` calls
 * `ChangeFamily.intoDelta` with the expected change.
 */
export function asDelta(intentions: number[]): DeltaRoot {
	return intentions.length === 0
		? emptyDelta
		: {
				fields: new Map([[rootKey, intentions.map((i) => ({ count: i }))]]),
			};
}

export function testChangeFamilyFactory(
	rebaser?: ChangeRebaser<TestChange>,
): ChangeFamily<ChangeFamilyEditor, TestChange> {
	const family = {
		rebaser: rebaser ?? new TestChangeRebaser(),
		codecs: TestChange.codecs,
		buildEditor: () => ({
			enterTransaction: () => assert.fail("Unexpected edit"),
			exitTransaction: () => assert.fail("Unexpected edit"),
		}),
	};
	return family;
}

export function isEmpty(change: TestChange): boolean {
	return change.intentions.length === 0;
}
