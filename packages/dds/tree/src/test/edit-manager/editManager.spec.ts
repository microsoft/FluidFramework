/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "assert";
import { ChangeEncoder, ChangeFamily, JsonCompatible } from "../../change-family";
import { SeqNumber } from "../../changeset";
import { Commit, EditManager, SessionId } from "../../edit-manager";
import { ChangeRebaser } from "../../rebase";
import { AnchorSet } from "../../tree";
import { brand, makeArray, RecursiveReadonly } from "../../util";

interface NonEmptyTestChangeset {
    /**
     * Identifies the document state that the changeset should apply to.
     */
    inputContext: number;
    /**
     * Identifies the document state brought about by applying the changeset to the document.
     */
    outputContext: number;
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

export type TestChangeset = NonEmptyTestChangeset | EmptyTestChangeset;

function isNonEmptyChange(
    change: RecursiveReadonly<TestChangeset>,
): change is RecursiveReadonly<NonEmptyTestChangeset> {
    return "inputContext" in change && "outputContext" in change;
}

interface AnchorRebaseData {
    rebases: RecursiveReadonly<NonEmptyTestChangeset>[];
    intentions: Set<number>;
}

class TestChangeRebaser implements ChangeRebaser<TestChangeset> {
    private contextCounter: number = 0;
    private intentionCounter: number = 0;
    public readonly anchorRebases: Map<AnchorSet, AnchorRebaseData> = new Map();

    public compose(changes: TestChangeset[]): TestChangeset {
        let inputContext: number | undefined;
        let outputContext: number | undefined;
        const intentions: number[] = [];
        for (const change of changes) {
            if (isNonEmptyChange(change)) {
                if (outputContext !== undefined) {
                    // One can only compose changes of the output context of each change N matches
                    // the input context of the change N+1.
                    assert.equal(outputContext, change.inputContext);
                }
                inputContext ??= change.inputContext;
                outputContext = change.outputContext;
                intentions.push(...change.intentions);
            }
        }
        if (inputContext !== undefined) {
            return {
                inputContext,
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                outputContext: outputContext!,
                intentions,
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
                return {
                    inputContext: over.outputContext,
                    // Note that we mint a new context ID for each rebased operation.
                    // This means that rebasing some change A over some change B will produce
                    // a change with a different output context every time.
                    // This lack of fidelity could make some of the tests fail when they
                    // should not, but will not make tests pass if they should not.
                    // If a rebaser implementation needed to leverage this missing fidelity then this gap could
                    // be addressed by using a more complex encoding to represent contexts.
                    outputContext: ++this.contextCounter,
                    intentions: change.intentions,
                };
            }
            return change;
        }
        return emptyChange;
    }

    public rebaseAnchors(anchors: AnchorSet, over: TestChangeset): void {
        if (isNonEmptyChange(over)) {
            let data = this.anchorRebases.get(anchors);
            if (data === undefined) {
                data = { rebases: [], intentions: new Set() };
                this.anchorRebases.set(anchors, data);
            }
            let lastChange: RecursiveReadonly<NonEmptyTestChangeset> | undefined;
            const { rebases, intentions } = data;
            for (let iChange = rebases.length - 1; iChange >= 0; --iChange) {
                const change = rebases[iChange];
                if (isNonEmptyChange(change)) {
                    lastChange = change;
                    break;
                }
            }
            if (lastChange !== undefined) {
                // The new change should apply to the context brought about by the previous change
                assert.equal(over.inputContext, lastChange.outputContext);
            }
            updateIntentionSet(over.intentions, intentions);
            rebases.push(over);
        }
    }

    public mintChangeset(inputContext: number): NonEmptyTestChangeset {
        return {
            inputContext,
            outputContext: ++this.contextCounter,
            intentions: [++this.intentionCounter],
        };
    }

    public checkChangeList(changes: readonly RecursiveReadonly<TestChangeset>[], intentions?: Set<number>): void {
        const filtered = changes.filter(isNonEmptyChange);
        const intentionsSeen = new Set<number>();
        const intentionsExpected = new Set<number>(
            intentions ??
            makeArray(this.intentionCounter, (i: number) => i + 1),
        );
        let index = 0;
        for (const change of filtered) {
            updateIntentionSet(change.intentions, intentionsSeen);
            if (index > 0) {
                const prev = filtered[index - 1];
                // The current change should apply to the context brought about by the previous change
                assert.equal(change.inputContext, prev.outputContext);
            }
            ++index;
        }
        // All expected intentions were present
        assert.deepEqual(intentionsSeen, intentionsExpected);
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

type TestChangeFamily = ChangeFamily<unknown, TestChangeset>;
type TestEditManager = EditManager<TestChangeset, TestChangeFamily>;

function updateIntentionSet(
    intentions: readonly number[],
    intentionsSeen: Set<number>,
) {
    for (const intention of intentions) {
        if (intention > 0) {
            // The same intention should never be applied multiple times
            assert(!intentionsSeen.has(intention));
            intentionsSeen.add(intention);
            // The intention should be part of the expected set for this client
        } else if (intention < 0) {
            // We are dealing with the inverse of an intention.
            // In order for the inverse to apply, the non-inverse should have been applied already
            assert(intentionsSeen.has(-intention));
            intentionsSeen.delete(-intention);
        }
    }
}

function changeFamilyFactory(): {
    family: ChangeFamily<unknown, TestChangeset>;
    rebaser: TestChangeRebaser;
} {
    const rebaser = new TestChangeRebaser();
    const family = {
        rebaser,
        encoder: new TestChangeEncoder(),
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
        family,
    );
    manager.setLocalSessionId(localSessionId);
    return { rebaser, manager };
}

const localSessionId: SessionId = "0";
const peerSessionId1: SessionId = "1";
const peerSessionId2: SessionId = "2";

const NUM_STEPS = 5;
const NUM_CLIENTS = 3;

describe("EditManager", () => {
    it("Can handle non-concurrent local changes being sequenced immediately", () => {
        const { rebaser, manager } = editManagerFactory();
        const cs1 = rebaser.mintChangeset(0);
        const cs2 = rebaser.mintChangeset(cs1.outputContext);
        const cs3 = rebaser.mintChangeset(cs2.outputContext);
        manager.addLocalChange(cs1);
        manager.addSequencedChange({
            sessionId: localSessionId,
            seqNumber: brand(1),
            refNumber: brand(0),
            changeset: cs1,
        });
        manager.addLocalChange(cs2);
        manager.addSequencedChange({
            sessionId: localSessionId,
            seqNumber: brand(2),
            refNumber: brand(1),
            changeset: cs2,
        });
        manager.addLocalChange(cs3);
        manager.addSequencedChange({
            sessionId: localSessionId,
            seqNumber: brand(3),
            refNumber: brand(2),
            changeset: cs3,
        });
        checkChangeList(manager, rebaser);
    });

    it("Can handle non-concurrent local changes being sequenced later", () => {
        const { rebaser, manager } = editManagerFactory();
        const cs1 = rebaser.mintChangeset(0);
        const cs2 = rebaser.mintChangeset(cs1.outputContext);
        const cs3 = rebaser.mintChangeset(cs2.outputContext);
        manager.addLocalChange(cs1);
        manager.addLocalChange(cs2);
        manager.addLocalChange(cs3);
        manager.addSequencedChange({
            sessionId: localSessionId,
            seqNumber: brand(1),
            refNumber: brand(0),
            changeset: cs1,
        });
        manager.addSequencedChange({
            sessionId: localSessionId,
            seqNumber: brand(2),
            refNumber: brand(0),
            changeset: cs2,
        });
        manager.addSequencedChange({
            sessionId: localSessionId,
            seqNumber: brand(3),
            refNumber: brand(0),
            changeset: cs3,
        });
        checkChangeList(manager, rebaser);
    });

    it("Can handle non-concurrent peer changes sequenced immediately", () => {
        const { rebaser, manager } = editManagerFactory();
        const cs1 = rebaser.mintChangeset(0);
        const cs2 = rebaser.mintChangeset(cs1.outputContext);
        const cs3 = rebaser.mintChangeset(cs2.outputContext);
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(1),
            refNumber: brand(0),
            changeset: cs1,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(2),
            refNumber: brand(1),
            changeset: cs2,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(3),
            refNumber: brand(2),
            changeset: cs3,
        });
        checkChangeList(manager, rebaser);
    });

    it("Can handle non-concurrent peer changes sequenced later", () => {
        const { rebaser, manager } = editManagerFactory();
        const cs1 = rebaser.mintChangeset(0);
        const cs2 = rebaser.mintChangeset(cs1.outputContext);
        const cs3 = rebaser.mintChangeset(cs2.outputContext);
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(1),
            refNumber: brand(0),
            changeset: cs1,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(2),
            refNumber: brand(0),
            changeset: cs2,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(3),
            refNumber: brand(0),
            changeset: cs3,
        });
        checkChangeList(manager, rebaser);
    });

    it("Can rebase a single peer change over multiple peer changes", () => {
        const { rebaser, manager } = editManagerFactory();
        const cs1 = rebaser.mintChangeset(0);
        const cs2 = rebaser.mintChangeset(cs1.outputContext);
        const cs3 = rebaser.mintChangeset(cs2.outputContext);
        const cs4 = rebaser.mintChangeset(0);
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(1),
            refNumber: brand(0),
            changeset: cs1,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(2),
            refNumber: brand(1),
            changeset: cs2,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(3),
            refNumber: brand(2),
            changeset: cs3,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: brand(4),
            refNumber: brand(0),
            changeset: cs4,
        });
        checkChangeList(manager, rebaser);
    });

    it("Can rebase multiple non-interleaved peer changes", () => {
        const { rebaser, manager } = editManagerFactory();
        const cs1 = rebaser.mintChangeset(0);
        const cs2 = rebaser.mintChangeset(cs1.outputContext);
        const cs3 = rebaser.mintChangeset(cs2.outputContext);
        const cs4 = rebaser.mintChangeset(0);
        const cs5 = rebaser.mintChangeset(cs4.outputContext);
        const cs6 = rebaser.mintChangeset(cs5.outputContext);
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(1),
            refNumber: brand(0),
            changeset: cs1,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(2),
            refNumber: brand(1),
            changeset: cs2,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(3),
            refNumber: brand(2),
            changeset: cs3,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: brand(4),
            refNumber: brand(0),
            changeset: cs4,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: brand(5),
            refNumber: brand(0),
            changeset: cs5,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: brand(6),
            refNumber: brand(0),
            changeset: cs6,
        });
        checkChangeList(manager, rebaser);
    });

    it("Can rebase multiple interleaved peer changes", () => {
        const { rebaser, manager } = editManagerFactory();
        const cs1 = rebaser.mintChangeset(0);
        const cs2 = rebaser.mintChangeset(cs1.outputContext);
        const cs3 = rebaser.mintChangeset(cs2.outputContext);
        const cs4 = rebaser.mintChangeset(0);
        const cs5 = rebaser.mintChangeset(cs4.outputContext);
        const cs6 = rebaser.mintChangeset(cs5.outputContext);
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(1),
            refNumber: brand(0),
            changeset: cs1,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: brand(2),
            refNumber: brand(0),
            changeset: cs4,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(3),
            refNumber: brand(1),
            changeset: cs2,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(4),
            refNumber: brand(2),
            changeset: cs3,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: brand(5),
            refNumber: brand(0),
            changeset: cs5,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: brand(6),
            refNumber: brand(0),
            changeset: cs6,
        });
        checkChangeList(manager, rebaser);
    });

    it("Can rebase multiple interleaved peer and local changes", () => {
        const { rebaser, manager } = editManagerFactory();
        const cs1 = rebaser.mintChangeset(0);
        const cs2 = rebaser.mintChangeset(cs1.outputContext);
        const cs3 = rebaser.mintChangeset(cs2.outputContext);
        const cs4 = rebaser.mintChangeset(0);
        const cs5 = rebaser.mintChangeset(cs4.outputContext);
        const cs6 = rebaser.mintChangeset(cs5.outputContext);
        const cs7 = rebaser.mintChangeset(0);
        manager.addLocalChange(cs7);
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(1),
            refNumber: brand(0),
            changeset: cs1,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: brand(2),
            refNumber: brand(0),
            changeset: cs4,
        });
        const cs8 = rebaser.mintChangeset(getTipContext(manager));
        manager.addLocalChange(cs8);
        const cs9 = rebaser.mintChangeset(getTipContext(manager));
        manager.addLocalChange(cs9);
        manager.addSequencedChange({
            sessionId: localSessionId,
            seqNumber: brand(3),
            refNumber: brand(0),
            changeset: cs7,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(4),
            refNumber: brand(1),
            changeset: cs2,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(5),
            refNumber: brand(2),
            changeset: cs3,
        });
        manager.addSequencedChange({
            sessionId: localSessionId,
            seqNumber: brand(6),
            refNumber: brand(2),
            changeset: cs8,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: brand(7),
            refNumber: brand(0),
            changeset: cs5,
        });
        manager.addSequencedChange({
            sessionId: localSessionId,
            seqNumber: brand(8),
            refNumber: brand(2),
            changeset: cs9,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: brand(9),
            refNumber: brand(0),
            changeset: cs6,
        });
        checkChangeList(manager, rebaser);
    });

    /**
     * This test case effectively tests most of the scenarios covered by the other test cases.
     * Despite that, it's good to keep the other tests cases for the following reasons:
     * - They give a clearer account of what the API usage is like.
     * - They are easier to debug.
     * - They are less reliant on the `EditManager` implementation in their construction of test input.
     * - They help diagnose issues with the more complicated exhaustive test (e.g., if one of the above tests fails,
     *   but this one doesn't, then there might be something wrong with this test).
     */
    it("Can handle all possible interleaving of steps", () => {
        const meta = {
            clientData: makeArray(NUM_CLIENTS, () => ({ pulled: 0, numLocal: 0 })),
            seq: 0,
        };
        for (const scenario of buildScenario([], meta)) {
            runScenario(scenario);
        }
    });
});

type ScenarioStep =
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
interface ScenarioBuilderState {
    clientData: { pulled: SeqNumber; numLocal: number; }[];
    seq: SeqNumber;
}

function* buildScenario(
    scenario: ScenarioStep[],
    meta: ScenarioBuilderState,
): Generator<readonly ScenarioStep[]> {
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
    /** The local changes in their original form */
    localChanges: { change: TestChangeset; ref: SeqNumber; }[];
    /** The last sequence number received by the client */
    ref: SeqNumber;
    /** Intentions that the client should be aware of */
    intentions: Set<number>;
}

function runScenario(scenario: readonly ScenarioStep[]): void {
    const name = scenario.map((step) => `${step.type}${step.client}`).join("-");
    const { rebaser, family } = changeFamilyFactory();
    const trunk: Commit<TestChangeset>[] = [];
    const clientData: ClientData[] = makeArray(NUM_CLIENTS, (iClient) => newClientData(family, iClient));
    for (const step of scenario) {
        // Perform the step
        {
            const client = clientData[step.client];
            if (step.type === "Mint") {
                const cs = rebaser.mintChangeset(getTipContext(client.manager));
                client.manager.addLocalChange(cs);
                client.localChanges.push({ change: cs, ref: client.ref });
                cs.intentions.forEach((intention) => client.intentions.add(intention));
            } else if (step.type === "Sequence") {
                const local = client.localChanges.shift() ?? fail("No local changes to sequence");
                trunk.push({
                    changeset: local.change,
                    refNumber: brand(local.ref),
                    sessionId: step.client.toString(),
                    seqNumber: brand(trunk.length + 1),
                });
            } else { // step.type === "Receive"
                const commit = trunk[client.ref];
                client.manager.addSequencedChange(commit);
                commit.changeset.intentions.forEach((intention) => client.intentions.add(intention));
                client.ref += 1;
            }
        }
        // Check the validity of the managers
        for (const client of clientData) {
            checkChangeList(client.manager, rebaser, client.intentions);
            const intentionsThatAnchorsWereRebasedOver =
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                rebaser.anchorRebases.get(client.manager.anchors!)?.intentions;
            // Check the anchors have been updated if applicable
            assert.deepEqual(intentionsThatAnchorsWereRebasedOver ?? new Set(), client.intentions);
        }
    }
}

function newClientData(family: TestChangeFamily, iClient: number): ClientData {
    const manager = new EditManager<TestChangeset, TestChangeFamily>(family, new AnchorSet());
    manager.setLocalSessionId(iClient.toString());
    return {
        manager,
        localChanges: [],
        ref: 0,
        intentions: new Set(),
    };
}

function checkChangeList(manager: TestEditManager, rebaser: TestChangeRebaser, intentions?: Set<number>): void {
    rebaser.checkChangeList(getAllChanges(manager), intentions);
}

function getAllChanges(manager: TestEditManager): RecursiveReadonly<TestChangeset>[] {
    return manager.getTrunk().map((c) => c.changeset).concat(manager.getLocalChanges());
}

function getTipContext(manager: TestEditManager): number {
    const changes = getAllChanges(manager);
    for (let i = changes.length - 1; i >= 0; --i) {
        const change = changes[i];
        if (isNonEmptyChange(change)) {
            return change.outputContext;
        }
    }
    return 0;
}
