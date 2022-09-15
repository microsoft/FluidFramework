/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "assert";
import { unreachableCase } from "@fluidframework/common-utils";
import { ChangeEncoder, ChangeFamily } from "../../change-family";
import { Commit, EditManager, SessionId } from "../../edit-manager";
import { ChangeRebaser } from "../../rebase";
import { AnchorSet, Delta, FieldKey } from "../../tree";
import { brand, makeArray, RecursiveReadonly, JsonCompatible } from "../../util";

interface NonEmptyTestChangeset {
    /**
     * Identifies the document state that the changeset should apply to.
     * Represented as the concatenation of all previous intentions.
     */
    inputContext: number[];
    /**
     * Identifies the document state brought about by applying the changeset to the document.
     * Represented as the concatenation of all previous intentions and the intentions in this change.
     */
    outputContext: number[];
    /**
     * Identifies the editing intentions included in the changeset.
     * Editing intentions can be thought of as user actions, where each user action is unique.
     * Editing intentions can be inverted (represented negative number of the same magnitude) but are
     * otherwise unchanged by rebasing.
     */
    intentions: number[];
}

interface EmptyTestChangeset {
    intentions: [];
}

const emptyChange: EmptyTestChangeset = { intentions: [] };
const rootKey: FieldKey = brand("root");

export type TestChangeset = NonEmptyTestChangeset | EmptyTestChangeset;

function isNonEmptyChange(
    change: RecursiveReadonly<TestChangeset>,
): change is RecursiveReadonly<NonEmptyTestChangeset> {
    return "inputContext" in change;
}

interface AnchorRebaseData {
    rebases: RecursiveReadonly<NonEmptyTestChangeset>[];
    intentions: number[];
}

class TestChangeRebaser implements ChangeRebaser<TestChangeset> {
    public static mintChangeset(inputContext: readonly number[], intention: number): NonEmptyTestChangeset {
        return {
            inputContext: [...inputContext],
            intentions: [intention],
            outputContext: TestChangeRebaser.composeIntentions(inputContext, [intention]),
        };
    }

    public static composeIntentions(base: readonly number[], extras: readonly number[]): number[] {
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

    public compose(changes: TestChangeset[]): TestChangeset {
        let inputContext: number[] | undefined;
        let outputContext: number[] | undefined;
        let intentions: number[] = [];
        for (const change of changes) {
            if (isNonEmptyChange(change)) {
                inputContext ??= change.inputContext;
                if (outputContext !== undefined) {
                    // The input context should match the output context of the previous change.
                    assert.deepEqual(change.inputContext, outputContext);
                }
                outputContext = TestChangeRebaser.composeIntentions(
                    outputContext ?? inputContext,
                    change.intentions,
                );
                intentions = TestChangeRebaser.composeIntentions(
                    intentions,
                    change.intentions,
                );
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

    public invert(change: TestChangeset): TestChangeset {
        if (isNonEmptyChange(change)) {
            return {
                inputContext: change.outputContext,
                outputContext: change.inputContext,
                intentions: change.intentions.map((i) => -i).reverse(),
            };
        }
        return emptyChange;
    }

    public rebase(change: TestChangeset, over: TestChangeset): TestChangeset {
        if (isNonEmptyChange(change)) {
            if (isNonEmptyChange(over)) {
                // Rebasing should only occur between two changes with the same input context
                assert.deepEqual(change.inputContext, over.inputContext);
                return {
                    inputContext: over.outputContext,
                    outputContext: TestChangeRebaser.composeIntentions(over.outputContext, change.intentions),
                    intentions: change.intentions,
                };
            }
            return change;
        }
        return emptyChange;
    }

    public rebaseAnchors(anchors: AnchorSet, over: TestChangeset): void {
        if (isNonEmptyChange(over) && anchors instanceof TestAnchorSet) {
            let lastChange: RecursiveReadonly<NonEmptyTestChangeset> | undefined;
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
            anchors.intentions = TestChangeRebaser.composeIntentions(anchors.intentions, over.intentions);
            rebases.push(over);
        }
    }

    public static checkChangeList(changes: readonly RecursiveReadonly<TestChangeset>[], intentions: number[]): void {
        const filtered = changes.filter(isNonEmptyChange);
        let intentionsSeen: number[] = [];
        let index = 0;
        for (const change of filtered) {
            intentionsSeen = TestChangeRebaser.composeIntentions(intentionsSeen, change.intentions);
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
}

class UnrebasableTestChangeRebaser extends TestChangeRebaser {
    public rebase(change: TestChangeset, over: TestChangeset): TestChangeset {
        assert.fail("Unexpected call to rebase");
    }
}

class TestChangeEncoder extends ChangeEncoder<TestChangeset> {
    public encodeForJson(formatVersion: number, change: TestChangeset): JsonCompatible {
        throw new Error("Method not implemented.");
    }
    public decodeJson(formatVersion: number, change: JsonCompatible): TestChangeset {
        throw new Error("Method not implemented.");
    }
}

class TestAnchorSet extends AnchorSet implements AnchorRebaseData {
    public rebases: RecursiveReadonly<NonEmptyTestChangeset>[] = [];
    public intentions: number[] = [];
}

type TestChangeFamily = ChangeFamily<unknown, TestChangeset>;
type TestEditManager = EditManager<TestChangeset, TestChangeFamily>;

/**
 * This is a hack to encode arbitrary information (the intentions) into a Delta.
 * The resulting Delta does note represent a concrete change to a document tree.
 * It is instead used as composite value in deep comparisons that verify that `EditManager` calls
 * `ChangeFamily.intoDelta` with the expected change.
 */
function asDelta(intentions: number[]): Delta.Root {
    return intentions.length === 0 ? Delta.empty : new Map([[rootKey, intentions]]);
}

function changeFamilyFactory(rebaser?: ChangeRebaser<TestChangeset>): ChangeFamily<unknown, TestChangeset> {
    const family = {
        rebaser: rebaser ?? new TestChangeRebaser(),
        encoder: new TestChangeEncoder(),
        buildEditor: () => assert.fail("Unexpected call to buildEditor"),
        intoDelta: (change: TestChangeset): Delta.Root => asDelta(change.intentions),
    };
    return family;
}

function editManagerFactory(rebaser?: ChangeRebaser<TestChangeset>): {
    manager: TestEditManager;
    anchors: AnchorRebaseData;
} {
    const family = changeFamilyFactory(rebaser);
    const anchors = new TestAnchorSet();
    const manager = new EditManager<TestChangeset, ChangeFamily<unknown, TestChangeset>>(
        family,
        anchors,
    );
    manager.setLocalSessionId(localSessionId);
    return { manager, anchors };
}

const localSessionId: SessionId = "0";
const peer1: SessionId = "1";
const peer2: SessionId = "2";

const NUM_STEPS = 5;
const NUM_PEERS = 2;
const peers: SessionId[] = makeArray(NUM_PEERS, (i) => String(i + 1));

type TestCommit = Commit<TestChangeset>;

/**
 * Represents the minting and sending of a new local change.
 */
interface UnitTestPushStep {
    type: "Push";
    /**
     * The future sequence number of the change being pushed.
     * This information is derived by the `runUnitTestScenario` function, but can be explicitly
     * provided to make tests easier to read and debug.
     */
    seq?: number;
}

/**
 * Represents the sequencing of a local change.
 */
interface UnitTestAckStep {
    type: "Ack";
    /**
     * The sequence number for this change.
     * Should match the sequence number of the oldest `UnitTestPushStep`
     * for which there is no `UnitTestAckStep` step.
     */
    seq: number;
}

/**
 * Represents the reception of a (sequenced) peer change
 */
interface UnitTestPullStep {
    type: "Pull";
    /**
     * The sequence number for this change.
     */
    seq: number;
    /**
     * The sequence number of the latest change that the issuer of this change knew about
     * at the time they issued this change.
     */
    ref: number;
    /**
     * The ID of the peer that issued the change.
     */
    from: SessionId;
    /**
     * The delta which should be produced by the `EditManager` when it receives this change.
     * This information is derived by the `runUnitTestScenario` function, but can be explicitly
     * provided to make tests easier to read and debug.
     */
    expectedDelta?: number[];
}

type UnitTestScenarioStep = UnitTestPushStep | UnitTestAckStep | UnitTestPullStep;

describe("EditManager", () => {
    describe("Unit Tests", () => {
        runUnitTestScenario("Can handle non-concurrent local changes being sequenced immediately", [
            { seq: 1, type: "Push" },
            { seq: 1, type: "Ack" },
            { seq: 2, type: "Push" },
            { seq: 2, type: "Ack" },
            { seq: 3, type: "Push" },
            { seq: 3, type: "Ack" },
        ]);

        runUnitTestScenario("Can handle non-concurrent local changes being sequenced later", [
            { seq: 1, type: "Push" },
            { seq: 2, type: "Push" },
            { seq: 3, type: "Push" },
            { seq: 1, type: "Ack" },
            { seq: 2, type: "Ack" },
            { seq: 3, type: "Ack" },
        ]);

        runUnitTestScenario("Can handle non-concurrent peer changes sequenced immediately", [
            { seq: 1, type: "Pull", ref: 0, from: peer1 },
            { seq: 2, type: "Pull", ref: 1, from: peer1 },
            { seq: 3, type: "Pull", ref: 2, from: peer1 },
        ]);

        runUnitTestScenario("Can handle non-concurrent peer changes sequenced later", [
            { seq: 1, type: "Pull", ref: 0, from: peer1 },
            { seq: 2, type: "Pull", ref: 0, from: peer1 },
            { seq: 3, type: "Pull", ref: 0, from: peer1 },
        ]);

        runUnitTestScenario("Can rebase a single peer change over multiple peer changes", [
            { seq: 1, type: "Pull", ref: 0, from: peer1 },
            { seq: 2, type: "Pull", ref: 1, from: peer1 },
            { seq: 3, type: "Pull", ref: 2, from: peer1 },
            { seq: 4, type: "Pull", ref: 0, from: peer2 },
        ]);

        runUnitTestScenario("Can rebase multiple non-interleaved peer changes", [
            { seq: 1, type: "Pull", ref: 0, from: peer1 },
            { seq: 2, type: "Pull", ref: 1, from: peer1 },
            { seq: 3, type: "Pull", ref: 2, from: peer1 },
            { seq: 4, type: "Pull", ref: 0, from: peer2 },
            { seq: 5, type: "Pull", ref: 0, from: peer2 },
            { seq: 6, type: "Pull", ref: 0, from: peer2 },
        ]);

        runUnitTestScenario("Can rebase multiple interleaved peer changes", [
            { seq: 1, type: "Pull", ref: 0, from: peer1 },
            { seq: 2, type: "Pull", ref: 0, from: peer2 },
            { seq: 3, type: "Pull", ref: 1, from: peer1 },
            { seq: 4, type: "Pull", ref: 2, from: peer1 },
            { seq: 5, type: "Pull", ref: 0, from: peer2 },
            { seq: 6, type: "Pull", ref: 0, from: peer2 },
        ]);

        runUnitTestScenario("Can rebase peer changes over a local change", [
            { seq: 1, type: "Push" },
            { seq: 1, type: "Ack" },
            { seq: 2, type: "Pull", ref: 0, from: peer1 },
            { seq: 3, type: "Pull", ref: 0, from: peer1 },
        ]);

        runUnitTestScenario("Can rebase multiple local changes", [
            { seq: 3, type: "Push" },
            { seq: 4, type: "Push" },
            { seq: 5, type: "Push" },
            { seq: 1, type: "Pull", ref: 0, from: peer1, expectedDelta: [-5, -4, -3, 1, 3, 4, 5] },
            { seq: 2, type: "Pull", ref: 1, from: peer1, expectedDelta: [-5, -4, -3, 2, 3, 4, 5] },
            { seq: 3, type: "Ack" },
            { seq: 4, type: "Ack" },
            { seq: 5, type: "Ack" },
            { seq: 6, type: "Pull", ref: 2, from: peer1, expectedDelta: [6] },
        ]);

        runUnitTestScenario("Can rebase multiple interleaved peer and local changes", [
            { seq: 3, type: "Push" },
            { seq: 1, type: "Pull", ref: 0, from: peer1, expectedDelta: [-3, 1, 3] },
            { seq: 2, type: "Pull", ref: 0, from: peer2, expectedDelta: [-3, 2, 3] },
            { seq: 6, type: "Push" },
            { seq: 8, type: "Push" },
            { seq: 3, type: "Ack" },
            { seq: 4, type: "Pull", ref: 1, from: peer1, expectedDelta: [-8, -6, 4, 6, 8] },
            { seq: 5, type: "Pull", ref: 2, from: peer1, expectedDelta: [-8, -6, 5, 6, 8] },
            { seq: 6, type: "Ack" },
            { seq: 7, type: "Pull", ref: 0, from: peer2, expectedDelta: [-8, 7, 8] },
            { seq: 8, type: "Ack" },
            { seq: 9, type: "Pull", ref: 0, from: peer2, expectedDelta: [9] },
        ]);

        runUnitTestScenario("Can handle ref numbers to operations that are not commits", [
            { seq: 2, type: "Pull", ref: 0, from: peer1 },
            { seq: 4, type: "Pull", ref: 1, from: peer2 },
            { seq: 6, type: "Pull", ref: 3, from: peer1 },
            { seq: 8, type: "Pull", ref: 3, from: peer1 },
            { seq: 10, type: "Pull", ref: 0, from: peer2 },
            { seq: 12, type: "Pull", ref: 1, from: peer2 },
        ]);
    });

    describe("Avoids unnecessary rebases", () => {
        runUnitTestScenario(
            "Sequenced changes that are based on the trunk should not be rebased",
            [
                { seq: 1, type: "Pull", ref: 0, from: peer1 },
                { seq: 2, type: "Pull", ref: 0, from: peer1 },
                { seq: 3, type: "Pull", ref: 0, from: peer1 },
                { seq: 4, type: "Pull", ref: 3, from: peer2 },
                { seq: 5, type: "Pull", ref: 4, from: peer2 },
                { seq: 6, type: "Pull", ref: 5, from: peer1 },
                { seq: 7, type: "Pull", ref: 5, from: peer1 },
            ],
            new UnrebasableTestChangeRebaser(),
        );
    });

    /**
     * This test case effectively tests most of the scenarios covered by the other test cases.
     * Despite that, it's good to keep the other tests cases for the following reasons:
     *
     * - They are easier to read and debug.
     *
     * - They help diagnose issues with the more complicated exhaustive test (e.g., if one of the above tests fails,
     * but this one doesn't, then there might be something wrong with this test).
     */
    it("Combinatorial test", () => {
        const meta = {
            peerRefs: makeArray(NUM_PEERS, () => 0),
            seq: 0,
            inFlight: 0,
        };
        for (const scenario of buildScenario([], meta)) {
            // Uncomment the code below to log the titles of generated scenarios.
            // This is helpful for creating a unit test out of a generated scenario that fails.
            // const title = scenario.map((s) => {
            //     if (s.type === "Pull") {
            //         return `Pull(${s.seq}) from:${s.from} ref:${s.ref}`;
            //     } else if (s.type === "Ack") {
            //         return `Ack(${s.seq})`;
            //     }
            //     return s.type;
            // }).join("|");
            // console.debug(title);
            runUnitTestScenario(undefined, scenario);
        }
    });
});

/**
 * State needed by the scenario builder.
 */
interface ScenarioBuilderState {
    /**
     * The ref number of the last commit made by each peer (0 for peers that have made no commits).
     */
    peerRefs: number[];
    /**
     * The ref number of the last commit made by each peer (0 for peers that have made no commits).
     */
    seq: number;
    /**
     * The number of local changes that have yet to be acked.
     */
    inFlight: number;
}

function* buildScenario(
    scenario: UnitTestScenarioStep[],
    meta: ScenarioBuilderState,
): Generator<readonly UnitTestScenarioStep[]> {
    if (scenario.length >= NUM_STEPS) {
        yield scenario;
    } else {
        // Push
        meta.inFlight += 1;
        scenario.push({ type: "Push" });
        for (const built of buildScenario(scenario, meta)) {
            yield built;
        }
        scenario.pop();
        meta.inFlight -= 1;

        // Ack (if there are any local changes)
        if (meta.inFlight > 0) {
            meta.inFlight -= 1;
            meta.seq += 1;
            scenario.push({ type: "Ack", seq: meta.seq });
            for (const built of buildScenario(scenario, meta)) {
                yield built;
            }
            scenario.pop();
            meta.seq -= 1;
            meta.inFlight += 1;
        }

        // Pull
        meta.seq += 1;
        for (let iPeer = 0; iPeer < NUM_PEERS; ++iPeer) {
            const prevRef = meta.peerRefs[iPeer];
            for (let ref = prevRef; ref < meta.seq; ++ref) {
                meta.peerRefs[iPeer] = ref;
                scenario.push({ type: "Pull", seq: meta.seq, ref, from: peers[iPeer] });
                for (const built of buildScenario(scenario, meta)) {
                    yield built;
                }
                scenario.pop();
            }
            meta.peerRefs[iPeer] = prevRef;
        }
        meta.seq -= 1;
    }
}

function runUnitTestScenario(
    title: string | undefined,
    steps: readonly UnitTestScenarioStep[],
    rebaser?: ChangeRebaser<TestChangeset>,
): void {
    const run = () => {
        const { manager, anchors } = editManagerFactory(rebaser);
        /**
         * Ordered list of local commits that have not yet been sequenced (i.e., `pushed - acked`)
         */
        const localCommits: TestCommit[] = [];
        /**
         * Ordered list of intentions that the manager has been made aware of (i.e., `pushed ⋃ pulled`).
         */
        let knownToLocal: number[] = [];
        /**
         * Ordered list of intentions that have been sequenced (i.e., `acked ⋃ pulled`)
         */
        const trunk: number[] = [];
        /**
         * The sequence number of the most recent sequenced commit that the manager is aware of
         */
        let localRef: number = 0;
        /**
         * The sequence number of the last sequenced in the scenario.
         */
        const finalSequencedEdit = [...steps].reverse().find((s) => s.type !== "Push")?.seq ?? 0;
        /**
         * The Ack steps of the scenario
         */
        const acks = steps.filter((s) => s.type === "Ack") as readonly UnitTestAckStep[];
        /**
         * Index of the "Ack" step in `acks` that matches the next encountered "Push" step
         */
        let iNextAck = 0;
        for (const step of steps) {
            const type = step.type;
            switch (type) {
                case "Push": {
                    let seq = step.seq;
                    if (seq === undefined) {
                        seq = iNextAck < acks.length
                            ? acks[iNextAck].seq
                            // If the pushed edit is never Ack-ed, assign the next available sequence number to it.
                            : finalSequencedEdit + 1 + iNextAck - acks.length;
                    }
                    iNextAck += 1;
                    const changeset = TestChangeRebaser.mintChangeset(knownToLocal, seq);
                    localCommits.push({
                        sessionId: localSessionId,
                        seqNumber: brand(seq),
                        refNumber: brand(localRef),
                        changeset,
                    });
                    knownToLocal.push(seq);
                    // Local changes should always lead to a delta that is equivalent to the local change.
                    assert.deepEqual(manager.addLocalChange(changeset), asDelta([seq]));
                    break;
                }
                case "Ack": {
                    const seq = step.seq;
                    const commit = localCommits.shift();
                    if (commit === undefined) {
                        fail("Invalid test scenario: no local commit to acknowledge");
                    }
                    if (commit.seqNumber !== seq) {
                        fail("Invalid test scenario: acknowledged commit does not mach oldest local change");
                    }
                    // Acknowledged (i.e., sequenced) local changes should always lead to an empty delta.
                    assert.deepEqual(manager.addSequencedChange(commit), Delta.empty);
                    trunk.push(seq);
                    localRef = seq;
                    break;
                }
                case "Pull": {
                    const seq = step.seq;
                    /**
                     * Filter that includes changes that were on the trunk of the issuer of this commit.
                     */
                    const peerTrunkChangesFilter = (s: UnitTestScenarioStep) =>
                        s.type !== "Push" && s.seq <= step.ref;
                    /**
                     * Filter that includes changes that were local to the issuer of this commit.
                     */
                    const peerLocalChangesFilter = (s: UnitTestScenarioStep) =>
                        s.type === "Pull" && s.seq > step.ref && s.seq < step.seq && s.from === step.from;
                    /**
                     * Changes that were known to the peer at the time it authored this commit.
                     */
                    const knownToPeer: number[] = [
                        ...steps.filter(peerTrunkChangesFilter),
                        ...steps.filter(peerLocalChangesFilter),
                    ].map((s) => s.seq ?? fail("Sequenced changes must all have a seq number"));
                    const commit: TestCommit = {
                        sessionId: step.from,
                        seqNumber: brand(seq),
                        refNumber: brand(step.ref),
                        changeset: TestChangeRebaser.mintChangeset(knownToPeer, seq),
                    };
                    /**
                     * Ordered list of intentions for local changes
                     */
                    const localIntentions = localCommits.map((c) => c.seqNumber);
                    // When a peer commit is received we expect the update to be equivalent to the
                    // retraction of any local changes, followed by the peer changes, followed by the
                    // updated version of the local changes.
                    const expected = [
                        ...localIntentions.map((i) => -i).reverse(),
                        seq,
                        ...localIntentions,
                    ];
                    assert.deepEqual(manager.addSequencedChange(commit), asDelta(expected));
                    if (step.expectedDelta !== undefined) {
                        // Verify that the test case was annotated with the right expectations.
                        assert.deepEqual(step.expectedDelta, expected);
                    }
                    trunk.push(seq);
                    knownToLocal = [
                        ...trunk,
                        ...localCommits.map((c) => c.seqNumber),
                    ];
                    localRef = seq;
                    break;
                }
                default: unreachableCase(type);
            }
            // Anchors should be kept up to date with the known intentions
            assert.deepEqual(anchors.intentions, knownToLocal);
            // The exposed trunk and local changes should reflect what is known to the local client
            checkChangeList(manager, knownToLocal);
        }
    };
    if (title !== undefined) {
        it(title, run);
    } else {
        run();
    }
}

function checkChangeList(manager: TestEditManager, intentions: number[]): void {
    TestChangeRebaser.checkChangeList(getAllChanges(manager), intentions);
}

function getAllChanges(manager: TestEditManager): RecursiveReadonly<TestChangeset>[] {
    return manager.getTrunk().map((c) => c.changeset).concat(manager.getLocalChanges());
}
