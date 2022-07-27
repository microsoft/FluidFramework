/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ChangeFamily } from "../../change-family";
import { EditManager } from "../../edit-manager";
import { ChangeRebaser } from "../../rebase";
import { AnchorSet } from "../../tree";
import { RecursiveReadonly } from "../../util";

interface TestChangeset {
    inputContext?: number;
    outputContext?: number;
    intentions: number[];
}

interface NonEmptyTestChangeset {
    inputContext: number;
    outputContext: number;
    intentions: number[];
}

function isNonEmptyChange(change: RecursiveReadonly<TestChangeset>):
	change is RecursiveReadonly<NonEmptyTestChangeset> {
    return change.inputContext !== undefined && change.outputContext !== undefined;
}

class TestChangeRebaser implements ChangeRebaser<TestChangeset, TestChangeset, TestChangeset> {
    private contextCounter: number = 0;
    private intentionCounter: number = 0;

    public compose(...changes: TestChangeset[]): TestChangeset {
        let inputContext: number | undefined;
        let outputContext: number | undefined;
        const intentions: number[] = [];
        for (const change of changes) {
            inputContext ??= change.inputContext;
            outputContext = change.outputContext ?? outputContext;
            intentions.push(...change.intentions);
        }
        return {
            inputContext,
            outputContext,
            intentions,
        };
    }

    public invert(change: TestChangeset): TestChangeset {
        return {
            inputContext: change.outputContext,
            outputContext: change.inputContext,
            intentions: change.intentions.map((i) => -i),
        };
    }

    public rebase(change: TestChangeset, over: TestChangeset): TestChangeset {
        return {
            inputContext: over.outputContext,
            outputContext: ++this.contextCounter,
            intentions: change.intentions,
        };
    }

    public rebaseAnchors(anchor: AnchorSet, over: TestChangeset): void {
        throw new Error("Method not implemented.");
    }

    public import(change: TestChangeset): TestChangeset {
        return change;
    }

    public export(change: TestChangeset): TestChangeset {
        return change;
    }

    public mintChangeset(inputContext: number): NonEmptyTestChangeset {
        return {
            inputContext,
            outputContext: ++this.contextCounter,
            intentions: [++this.intentionCounter],
        };
    }

    public checkChangeList(changes: readonly RecursiveReadonly<TestChangeset>[]): void {
        const filtered = changes.filter(isNonEmptyChange);
        const intentionsSeen = new Set<number>();
        let index = 0;
        for (const change of filtered) {
            for (const intention of change.intentions) {
                if (intention > 0) {
                    // The same intention should never be applied multiple times
                    assert.strictEqual(intentionsSeen.has(intention), false);
                    intentionsSeen.add(intention);
                } else if (intention < 0) {
                    // We are dealing with the inverse of an intention.
                    // In order for the inverse to apply, the non-inverse should have been applied already
                    assert.strictEqual(intentionsSeen.has(-intention), true);
                    intentionsSeen.delete(-intention);
                }
            }
            if (index > 0) {
                const prev = changes[index - 1];
                // The current change should apply to the context brought about by the previous change
                assert.strictEqual(change.inputContext, prev.outputContext);
            }
            ++index;
        }
    }
}

type TestChangeFamily = ChangeFamily<unknown, TestChangeset>;
type TestEditManager = EditManager<TestChangeset, TestChangeFamily>;

function changeFamilyFactory(): {
    family: ChangeFamily<unknown, TestChangeset>;
    rebaser: TestChangeRebaser;
} {
    const rebaser = new TestChangeRebaser();
    const family = {
        rebaser,
        buildEditor: () => assert.fail("Unexpected call to buildEditor"),
        intoDelta: () => new Map(),
    };
    return { rebaser, family };
}

function editManagerFactory(): {
    manager: TestEditManager;
    rebaser: TestChangeRebaser;
} {
    const { rebaser, family } = changeFamilyFactory();
    const manager = new EditManager<TestChangeset, ChangeFamily<unknown, TestChangeset>>(
        localSessionId,
        family,
    );
    return { rebaser, manager };
}

const localSessionId = 0;
const peerSessionId1 = 1;

describe.only("EditManager", () => {
    it("Can handle non-concurrent sequenced changes", () => {
        const { rebaser, manager } = editManagerFactory();
        const cs1 = rebaser.mintChangeset(0);
        const cs2 = rebaser.mintChangeset(cs1.outputContext);
        const cs3 = rebaser.mintChangeset(cs2.outputContext);
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: 1,
            refNumber: 0,
            changeset: cs1,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: 2,
            refNumber: 0,
            changeset: cs2,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: 3,
            refNumber: 0,
            changeset: cs3,
        });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        rebaser.checkChangeList(manager.getTrunk().map((c) => c.changeset));
    });
});
