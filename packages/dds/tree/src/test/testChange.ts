/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "assert";
import { ChangeEncoder, ChangeFamily } from "../change-family";
import { ChangeRebaser } from "../rebase";
import { AnchorSet, Delta } from "../tree";
import { JsonCompatible, JsonCompatibleReadOnly, RecursiveReadonly } from "../util";
import { deepFreeze } from "./utils";

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

function mint(inputContext: readonly number[], intention: number | number[]): NonEmptyTestChange {
    const intentions = Array.isArray(intention) ? intention : [intention];
    return {
        inputContext: [...inputContext],
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

function compose(changes: TestChange[], verify: boolean = true): TestChange {
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
    if (inputContext !== undefined) {
        return {
            inputContext,
            intentions,
            outputContext: outputContext ?? fail(),
        };
    }
    return emptyChange;
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

function rebase(change: TestChange, over: TestChange): TestChange {
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

function rebaseAnchors(anchors: AnchorSet, over: TestChange): void {
    if (isNonEmptyChange(over) && anchors instanceof TestAnchorSet) {
        let lastChange: RecursiveReadonly<NonEmptyTestChange> | undefined;
        const { rebases } = anchors;
        for (let iChange = rebases.length - 1; iChange >= 0; --iChange) {
            const change = rebases[iChange];
            if (isNonEmptyChange(change)) {
                lastChange = change;
                break;
            }
        }
        if (lastChange !== undefined) {
            // The new change should apply to the context brought about by the previous change
            assert.deepEqual(over.inputContext, lastChange.outputContext);
        }
        anchors.intentions = composeIntentions(anchors.intentions, over.intentions);
        rebases.push(over);
    }
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

function toDelta(change: TestChange): Delta.Modify {
    if (change.intentions.length > 0) {
        return {
            type: Delta.MarkType.Modify,
            setValue: change.intentions.map(String).join("|"),
        };
    }
    return { type: Delta.MarkType.Modify };
}

export interface AnchorRebaseData {
    rebases: RecursiveReadonly<NonEmptyTestChange>[];
    intentions: number[];
}

const emptyChange: TestChange = { intentions: [] };

export const TestChange = {
    emptyChange,
    mint,
    compose,
    invert,
    rebase,
    rebaseAnchors,
    checkChangeList,
    toDelta,
};
deepFreeze(TestChange);

export class TestChangeRebaser implements ChangeRebaser<TestChange> {
    public compose(changes: TestChange[]): TestChange {
        return compose(changes);
    }

    public invert(change: TestChange): TestChange {
        return invert(change);
    }

    public rebase(change: TestChange, over: TestChange): TestChange {
        return rebase(change, over);
    }

    public rebaseAnchors(anchors: AnchorSet, over: TestChange): void {
        rebaseAnchors(anchors, over);
    }
}

export class UnrebasableTestChangeRebaser extends TestChangeRebaser {
    public rebase(change: TestChange, over: TestChange): TestChange {
        assert.fail("Unexpected call to rebase");
    }
}

export class TestAnchorSet extends AnchorSet implements AnchorRebaseData {
    public rebases: RecursiveReadonly<NonEmptyTestChange>[] = [];
    public intentions: number[] = [];
}

export class TestChangeEncoder extends ChangeEncoder<TestChange> {
    public encodeForJson(formatVersion: number, change: TestChange): JsonCompatible {
        return change as unknown as JsonCompatible;
    }
    public decodeJson(formatVersion: number, change: JsonCompatibleReadOnly): TestChange {
        return change as unknown as TestChange;
    }
}

export type TestChangeFamily = ChangeFamily<unknown, TestChange>;
