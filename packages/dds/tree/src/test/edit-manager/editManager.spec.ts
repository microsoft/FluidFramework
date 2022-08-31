/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "assert";
import { unreachableCase } from "@fluidframework/common-utils";
import { ChangeEncoder, ChangeFamily, JsonCompatible } from "../../change-family";
import { Commit, EditManager, SessionId } from "../../edit-manager";
import { ChangeRebaser } from "../../rebase";
import { AnchorSet, Delta, FieldKey } from "../../tree";
import { brand, makeArray, RecursiveReadonly } from "../../util";

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

function changeFamilyFactory(): ChangeFamily<unknown, TestChangeset> {
    const rebaser = new TestChangeRebaser();
    const family = {
        rebaser,
        encoder: new TestChangeEncoder(),
        buildEditor: () => assert.fail("Unexpected call to buildEditor"),
        intoDelta: (change: TestChangeset): Delta.Root => asDelta(change.intentions),
    };
    return family;
}

function editManagerFactory(): {
    manager: TestEditManager;
    anchors: AnchorRebaseData;
} {
    const family = changeFamilyFactory();
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
const NUM_CLIENTS = 3;

type TestCommit = Commit<TestChangeset>;

/** Represents the minting and sending of a new local change. */
interface UnitTestPushStep {
    type: "Push";
    /**
     * The future sequence number of the change being pushed.
     */
    seq: number;
}

/** Represents the sequencing of a local change. */
interface UnitTestAckStep {
    type: "Ack";
    /**
     * The sequence number for this change.
     * Should match the sequence number of the oldest `UnitTestPushStep`
     * for which there is no `UnitTestAckStep` step.
     */
    seq: number;
}

/** Represents the sequencing of a peer change */
interface UnitTestPullStep {
    type: "Pull";
    /** The sequence number for this change. */
    seq: number;
    /**
     * The sequence number of the latest change that the issuer of this change knew about
     * at the time they issued this change.
     */
    ref: number;
    /** The ID of the peer that issued the change. */
    from: SessionId;
    /**
     * Ordered list of sequence numbers that correspond to the net change for the local document.
     * This is required to make tests easier to read and debug. The `unitTest` function verifies
     * that those expectations are correct.
     */
    expectedDelta: number[];
}

type UnitTestScenarioStep = UnitTestPushStep | UnitTestAckStep | UnitTestPullStep;

function unitTest(title: string, steps: UnitTestScenarioStep[]): void {
    it(title, () => {
        const { manager, anchors } = editManagerFactory();
        /** Ordered list of local commits that have not yet been sequenced (i.e., `pushed - acked`) */
        const localCommits: TestCommit[] = [];
        /** Ordered list of intentions that the manager has been made aware of (i.e., `pushed ⋃ pulled`). */
        let knownToLocal: number[] = [];
        /** Ordered list of intentions that have been sequenced (i.e., `acked ⋃ pulled`) */
        const trunk: number[] = [];
        /** The sequence number of the most recent sequenced commit that the manager is aware of */
        let localRef: number = 0;
        for (const step of steps) {
            const { seq, type } = step;
            switch (type) {
                case "Push": {
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
                    /** Filter that includes changes that were on the trunk of the issuer of this commit. */
                    const peerTrunkChangesFilter = (s: UnitTestScenarioStep) =>
                        s.seq <= step.ref;
                    /** Filter that includes changes that were local to the issuer of this commit. */
                    const peerLocalChangesFilter = (s: UnitTestScenarioStep) =>
                        s.seq > step.ref && s.seq < step.seq && s.type === "Pull" && s.from === step.from;
                    /** Changes that were known to the peer at the time it authored this commit. */
                    const knownToPeer: number[] = [
                        ...steps.filter(peerTrunkChangesFilter),
                        ...steps.filter(peerLocalChangesFilter),
                    ].map((s) => s.seq);
                    const commit: TestCommit = {
                        sessionId: step.from,
                        seqNumber: brand(seq),
                        refNumber: brand(step.ref),
                        changeset: TestChangeRebaser.mintChangeset(knownToPeer, seq),
                    };
                    // Ordered list of intentions for local changes
                    const localIntentions = localCommits.map((c) => c.seqNumber);
                    // When a peer commit is sequence we expect the update to be equivalent to the
                    // retraction of any local changes, followed by the peer changes, followed by the
                    // updated version of the local changes.
                    const expected = [
                        ...localIntentions.map((i) => -i).reverse(),
                        seq,
                        ...localIntentions,
                    ];
                    assert.deepEqual(manager.addSequencedChange(commit), asDelta(expected));
                    // Verify that the test case was annotated with the right expectations.
                    assert.deepEqual(step.expectedDelta, expected);
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
    });
}

describe("EditManager", () => {
    describe("Unit Tests", () => {
        unitTest("Can handle non-concurrent local changes being sequenced immediately", [
            { seq: 1, type: "Push" },
            { seq: 1, type: "Ack" },
            { seq: 2, type: "Push" },
            { seq: 2, type: "Ack" },
            { seq: 3, type: "Push" },
            { seq: 3, type: "Ack" },
        ]);

        unitTest("Can handle non-concurrent local changes being sequenced later", [
            { seq: 1, type: "Push" },
            { seq: 2, type: "Push" },
            { seq: 3, type: "Push" },
            { seq: 1, type: "Ack" },
            { seq: 2, type: "Ack" },
            { seq: 3, type: "Ack" },
        ]);

        unitTest("Can handle non-concurrent peer changes sequenced immediately", [
            { seq: 1, type: "Pull", ref: 0, from: peer1, expectedDelta: [1] },
            { seq: 2, type: "Pull", ref: 1, from: peer1, expectedDelta: [2] },
            { seq: 3, type: "Pull", ref: 2, from: peer1, expectedDelta: [3] },
        ]);

        unitTest("Can handle non-concurrent peer changes sequenced later", [
            { seq: 1, type: "Pull", ref: 0, from: peer1, expectedDelta: [1] },
            { seq: 2, type: "Pull", ref: 0, from: peer1, expectedDelta: [2] },
            { seq: 3, type: "Pull", ref: 0, from: peer1, expectedDelta: [3] },
        ]);

        unitTest("Can rebase a single peer change over multiple peer changes", [
            { seq: 1, type: "Pull", ref: 0, from: peer1, expectedDelta: [1] },
            { seq: 2, type: "Pull", ref: 1, from: peer1, expectedDelta: [2] },
            { seq: 3, type: "Pull", ref: 2, from: peer1, expectedDelta: [3] },
            { seq: 4, type: "Pull", ref: 0, from: peer2, expectedDelta: [4] },
        ]);

        unitTest("Can rebase multiple non-interleaved peer changes", [
            { seq: 1, type: "Pull", ref: 0, from: peer1, expectedDelta: [1] },
            { seq: 2, type: "Pull", ref: 1, from: peer1, expectedDelta: [2] },
            { seq: 3, type: "Pull", ref: 2, from: peer1, expectedDelta: [3] },
            { seq: 4, type: "Pull", ref: 0, from: peer2, expectedDelta: [4] },
            { seq: 5, type: "Pull", ref: 0, from: peer2, expectedDelta: [5] },
            { seq: 6, type: "Pull", ref: 0, from: peer2, expectedDelta: [6] },
        ]);

        unitTest("Can rebase multiple interleaved peer changes", [
            { seq: 1, type: "Pull", ref: 0, from: peer1, expectedDelta: [1] },
            { seq: 2, type: "Pull", ref: 0, from: peer2, expectedDelta: [2] },
            { seq: 3, type: "Pull", ref: 1, from: peer1, expectedDelta: [3] },
            { seq: 4, type: "Pull", ref: 2, from: peer1, expectedDelta: [4] },
            { seq: 5, type: "Pull", ref: 0, from: peer2, expectedDelta: [5] },
            { seq: 6, type: "Pull", ref: 0, from: peer2, expectedDelta: [6] },
        ]);

        unitTest("Can rebase multiple local changes", [
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

        unitTest("Can rebase multiple interleaved peer and local changes", [
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
    });

    /**
     * This test case effectively tests most of the scenarios covered by the other test cases.
     * Despite that, it's good to keep the other tests cases for the following reasons:
     * - They are easier to read and debug.
     * - They help diagnose issues with the more complicated exhaustive test (e.g., if one of the above tests fails,
     *   but this one doesn't, then there might be something wrong with this test).
     */
    it("Combinatorial test", () => {
        const meta = {
            clientData: makeArray(NUM_CLIENTS, () => ({ pulled: 0, numLocal: 0 })),
            seq: 0,
        };
        for (const scenario of buildScenario([], meta)) {
            // Uncomment the lines below to see which scenario fails first.
            // const name = scenario.map((step) => `${step.type}${step.client}`).join("-");
            // console.debug(name);
            runCombinatorialScenario(scenario);
        }
    });
});

type CombinatorialScenarioStep =
    // Represents a client making a local change
    | { type: "Mint"; client: number; }
    // Represents a change from a client being sequenced by the service
    | { type: "Sequence"; client: number; }
    // Represents a client receiving a sequenced change
    | { type: "Receive"; client: number; }
;

/**
 * State needed by the scenario builder.
 */
interface CombinatorialScenarioBuilderState {
    clientData: { pulled: number; numLocal: number; }[];
    seq: number;
}

function* buildScenario(
    scenario: CombinatorialScenarioStep[],
    meta: CombinatorialScenarioBuilderState,
): Generator<readonly CombinatorialScenarioStep[]> {
    if (scenario.length >= NUM_STEPS) {
        yield scenario;
    } else {
        // Mint
        for (let iClient = 0; iClient < NUM_CLIENTS; ++iClient) {
            meta.clientData[iClient].numLocal += 1;
            scenario.push({ type: "Mint", client: iClient });
            for (const built of buildScenario(scenario, meta)) {
                yield built;
            }
            scenario.pop();
            meta.clientData[iClient].numLocal -= 1;
        }

        // Push
        for (let iClient = 0; iClient < NUM_CLIENTS; ++iClient) {
            // If there are any local changes
            if (meta.clientData[iClient].numLocal > 0) {
                meta.clientData[iClient].numLocal -= 1;
                meta.seq += 1;
                scenario.push({ type: "Sequence", client: iClient });
                for (const built of buildScenario(scenario, meta)) {
                    yield built;
                }
                scenario.pop();
                meta.seq -= 1;
                meta.clientData[iClient].numLocal += 1;
            }
        }

        // Pull
        for (let iClient = 1; iClient < NUM_CLIENTS; ++iClient) {
            // If there are any sequenced changes to catch up on
            if (meta.clientData[iClient].pulled < meta.seq) {
                meta.clientData[iClient].pulled += 1;
                scenario.push({ type: "Receive", client: iClient });
                for (const built of buildScenario(scenario, meta)) {
                    yield built;
                }
                scenario.pop();
                meta.clientData[iClient].pulled -= 1;
            }
        }
    }
}

interface ClientData {
    manager: TestEditManager;
    anchors: TestAnchorSet;
    /** The local changes in their original form */
    localChanges: { change: TestChangeset; ref: number; }[];
    /** The last sequence number received by the client */
    ref: number;
    /** Intentions that the client should be aware of */
    intentions: number[];
}

function runCombinatorialScenario(scenario: readonly CombinatorialScenarioStep[]): void {
    const family = changeFamilyFactory();
    const trunk: Commit<TestChangeset>[] = [];
    const clientData: ClientData[] = makeArray(NUM_CLIENTS, (iClient) => newClientData(family, iClient));
    let changeCounter = 0;
    for (const step of scenario) {
        // Perform the step
        {
            const client = clientData[step.client];
            if (step.type === "Mint") {
                const cs = TestChangeRebaser.mintChangeset(client.intentions, ++changeCounter);
                const delta = client.manager.addLocalChange(cs);
                assert.deepEqual(delta, asDelta(cs.intentions));
                client.localChanges.push({ change: cs, ref: client.ref });
                cs.intentions.forEach((intention) => client.intentions.push(intention));
            } else if (step.type === "Sequence") {
                const local = client.localChanges[0] ?? fail("No local changes to sequence");
                trunk.push({
                    changeset: local.change,
                    refNumber: brand(local.ref),
                    sessionId: step.client.toString(),
                    seqNumber: brand(trunk.length + 1),
                });
            } else { // step.type === "Receive"
                const commit = trunk[client.ref];
                const delta = client.manager.addSequencedChange(commit);
                // If the change came from this client
                if (commit.sessionId === step.client.toString()) {
                    assert.deepEqual(delta, Delta.empty);
                    // Discard the local change
                    client.localChanges.shift();
                    // Do not update the intentions
                } else {
                    const localIntentions = ([] as number[]).concat(
                        ...client.localChanges.map((c) => c.change.intentions),
                    );
                    const expected = ([] as number[]).concat(
                        ...localIntentions.map((i) => -i).reverse(),
                        ...commit.changeset.intentions,
                        ...localIntentions,
                    );
                    assert.deepEqual(delta, asDelta(expected));
                    // Update the intentions known to this client
                    client.intentions.splice(
                        client.intentions.length - client.localChanges.length,
                        0,
                        ...commit.changeset.intentions,
                    );
                }
                client.ref += 1;
            }
        }
        // Check the validity of the managers
        for (const client of clientData) {
            checkChangeList(client.manager, client.intentions);
            // Check the anchors have been updated if applicable
            assert.deepEqual(client.anchors.intentions ?? [], client.intentions);
        }
    }
}

function newClientData(family: TestChangeFamily, iClient: number): ClientData {
    const anchors = new TestAnchorSet();
    const manager = new EditManager<TestChangeset, TestChangeFamily>(family, anchors);
    manager.setLocalSessionId(iClient.toString());
    return {
        manager,
        anchors,
        localChanges: [],
        ref: 0,
        intentions: [],
    };
}

function checkChangeList(manager: TestEditManager, intentions: number[]): void {
    TestChangeRebaser.checkChangeList(getAllChanges(manager), intentions);
}

function getAllChanges(manager: TestEditManager): RecursiveReadonly<TestChangeset>[] {
    return manager.getTrunk().map((c) => c.changeset).concat(manager.getLocalChanges());
}
