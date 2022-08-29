/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "assert";
import { ChangeEncoder, ChangeFamily, JsonCompatible } from "../../change-family";
import { Commit, EditManager, SessionId } from "../../edit-manager";
import { ChangeRebaser } from "../../rebase";
import { AnchorSet } from "../../tree";
import { brand, makeArray, RecursiveReadonly } from "../../util";

interface NonEmptyTestChangeset {
    /**
     * Identifies the document state that the changeset should apply to.
     */
    inputContext: number[];
    /**
     * Identifies the document state brought about by applying the changeset to the document.
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
    public readonly anchorRebases: Map<AnchorSet, AnchorRebaseData> = new Map();

    public static mintChangeset(inputContext: readonly number[], intentionOpt: number): NonEmptyTestChangeset {
        const intention = intentionOpt;
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
        if (isNonEmptyChange(over)) {
            let data = this.anchorRebases.get(anchors);
            if (data === undefined) {
                data = { rebases: [], intentions: [] };
                this.anchorRebases.set(anchors, data);
            }
            let lastChange: RecursiveReadonly<NonEmptyTestChangeset> | undefined;
            const { rebases } = data;
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
            data.intentions = TestChangeRebaser.composeIntentions(data.intentions, over.intentions);
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

type TestChangeFamily = ChangeFamily<unknown, TestChangeset>;
type TestEditManager = EditManager<TestChangeset, TestChangeFamily>;

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

type TestCommit = Commit<TestChangeset>;

describe("EditManager", () => {
    it("Can handle non-concurrent local changes being sequenced immediately", () => {
        const { rebaser, manager } = editManagerFactory();
        const c1: TestCommit = {
            sessionId: localSessionId,
            seqNumber: brand(1),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([], 1),
        };
        const c2: TestCommit = {
            sessionId: localSessionId,
            seqNumber: brand(2),
            refNumber: brand(1),
            changeset: TestChangeRebaser.mintChangeset([1], 2),
        };
        const c3: TestCommit = {
            sessionId: localSessionId,
            seqNumber: brand(3),
            refNumber: brand(2),
            changeset: TestChangeRebaser.mintChangeset([1, 2], 3),
        };
        manager.addLocalChange(c1.changeset);
        manager.addSequencedChange(c1);
        manager.addLocalChange(c2.changeset);
        manager.addSequencedChange(c2);
        manager.addLocalChange(c3.changeset);
        manager.addSequencedChange(c3);
        checkChangeList(manager, [1, 2, 3]);
    });

    it("Can handle non-concurrent local changes being sequenced later", () => {
        const { rebaser, manager } = editManagerFactory();
        const c1: TestCommit = {
            sessionId: localSessionId,
            seqNumber: brand(1),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([], 1),
        };
        const c2: TestCommit = {
            sessionId: localSessionId,
            seqNumber: brand(2),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([1], 2),
        };
        const c3: TestCommit = {
            sessionId: localSessionId,
            seqNumber: brand(3),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([1, 2], 3),
        };
        manager.addLocalChange(c1.changeset);
        manager.addLocalChange(c2.changeset);
        manager.addLocalChange(c3.changeset);
        manager.addSequencedChange(c1);
        manager.addSequencedChange(c2);
        manager.addSequencedChange(c3);
        checkChangeList(manager, [1, 2, 3]);
    });

    it("Can handle non-concurrent peer changes sequenced immediately", () => {
        const { rebaser, manager } = editManagerFactory();
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(1),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([], 1),
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(2),
            refNumber: brand(1),
            changeset: TestChangeRebaser.mintChangeset([1], 2),
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(3),
            refNumber: brand(2),
            changeset: TestChangeRebaser.mintChangeset([1, 2], 3),
        });
        checkChangeList(manager, [1, 2, 3]);
    });

    it("Can handle non-concurrent peer changes sequenced later", () => {
        const { rebaser, manager } = editManagerFactory();
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(1),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([], 1),
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(2),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([1], 2),
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(3),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([1, 2], 3),
        });
        checkChangeList(manager, [1, 2, 3]);
    });

    it("Can rebase a single peer change over multiple peer changes", () => {
        const { rebaser, manager } = editManagerFactory();
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(1),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([], 1),
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(2),
            refNumber: brand(1),
            changeset: TestChangeRebaser.mintChangeset([1], 2),
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(3),
            refNumber: brand(2),
            changeset: TestChangeRebaser.mintChangeset([1, 2], 3),
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: brand(4),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([], 4),
        });
        checkChangeList(manager, [1, 2, 3, 4]);
    });

    it("Can rebase multiple non-interleaved peer changes", () => {
        const { rebaser, manager } = editManagerFactory();
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(1),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([], 1),
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(2),
            refNumber: brand(1),
            changeset: TestChangeRebaser.mintChangeset([1], 2),
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(3),
            refNumber: brand(2),
            changeset: TestChangeRebaser.mintChangeset([1, 2], 3),
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: brand(4),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([], 4),
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: brand(5),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([4], 5),
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: brand(6),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([4, 5], 6),
        });
        checkChangeList(manager, [1, 2, 3, 4, 5, 6]);
    });

    it("Can rebase multiple interleaved peer changes", () => {
        const { rebaser, manager } = editManagerFactory();
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(1),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([], 1),
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: brand(2),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([], 2),
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(3),
            refNumber: brand(1),
            changeset: TestChangeRebaser.mintChangeset([1], 3),
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: brand(4),
            refNumber: brand(2),
            changeset: TestChangeRebaser.mintChangeset([1, 2, 3], 4),
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: brand(5),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([2], 5),
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: brand(6),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([2, 5], 6),
        });
        checkChangeList(manager, [1, 2, 3, 4, 5, 6]);
    });

    it("Can rebase multiple interleaved peer and local changes", () => {
        const { rebaser, manager } = editManagerFactory();
        const c1: TestCommit = {
            sessionId: peerSessionId1,
            seqNumber: brand(1),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([], 1),
        };
        const c2: TestCommit = {
            sessionId: peerSessionId2,
            seqNumber: brand(2),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([], 2),
        };
        const c3: TestCommit = {
            sessionId: localSessionId,
            seqNumber: brand(3),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([], 3),
        };
        const c4: TestCommit = {
            sessionId: peerSessionId1,
            seqNumber: brand(4),
            refNumber: brand(1),
            changeset: TestChangeRebaser.mintChangeset([1], 4),
        };
        const c5: TestCommit = {
            sessionId: peerSessionId1,
            seqNumber: brand(5),
            refNumber: brand(2),
            changeset: TestChangeRebaser.mintChangeset([1, 2, 4], 5),
        };
        const c6: TestCommit = {
            sessionId: localSessionId,
            seqNumber: brand(6),
            refNumber: brand(2),
            changeset: TestChangeRebaser.mintChangeset([1, 2, 3], 6),
        };
        const c7: TestCommit = {
            sessionId: peerSessionId2,
            seqNumber: brand(7),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([2], 7),
        };
        const c8: TestCommit = {
            sessionId: localSessionId,
            seqNumber: brand(8),
            refNumber: brand(2),
            changeset: TestChangeRebaser.mintChangeset([1, 2, 3, 6], 8),
        };
        const c9: TestCommit = {
            sessionId: peerSessionId2,
            seqNumber: brand(9),
            refNumber: brand(0),
            changeset: TestChangeRebaser.mintChangeset([2, 7], 9),
        };
        manager.addLocalChange(c3.changeset);
        manager.addSequencedChange(c1);
        manager.addSequencedChange(c2);
        manager.addLocalChange(c6.changeset);
        manager.addLocalChange(c8.changeset);
        manager.addSequencedChange(c3);
        manager.addSequencedChange(c4);
        manager.addSequencedChange(c5);
        manager.addSequencedChange(c6);
        manager.addSequencedChange(c7);
        manager.addSequencedChange(c8);
        manager.addSequencedChange(c9);
        checkChangeList(manager, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
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
            // Uncomment the lines below to see which scenario fails first.
            // const name = scenario.map((step) => `${step.type}${step.client}`).join("-");
            // console.debug(name);
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
    clientData: { pulled: number; numLocal: number; }[];
    seq: number;
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
    localChanges: { change: TestChangeset; ref: number; }[];
    /** The last sequence number received by the client */
    ref: number;
    /** Intentions that the client should be aware of */
    intentions: number[];
}

function runScenario(scenario: readonly ScenarioStep[]): void {
    const { rebaser, family } = changeFamilyFactory();
    const trunk: Commit<TestChangeset>[] = [];
    const clientData: ClientData[] = makeArray(NUM_CLIENTS, (iClient) => newClientData(family, iClient));
    let changeCounter = 0;
    for (const step of scenario) {
        // Perform the step
        {
            const client = clientData[step.client];
            if (step.type === "Mint") {
                const cs = TestChangeRebaser.mintChangeset(getTipContext(client.manager), ++changeCounter);
                client.manager.addLocalChange(cs);
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
                client.manager.addSequencedChange(commit);
                // If the change came from this client
                if (commit.sessionId === step.client.toString()) {
                    // Discard the local change
                    client.localChanges.shift();
                    // Do not update the intentions
                } else {
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
            const intentionsThatAnchorsWereRebasedOver =
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                rebaser.anchorRebases.get(client.manager.anchors!)?.intentions;
            // Check the anchors have been updated if applicable
            assert.deepEqual(intentionsThatAnchorsWereRebasedOver ?? [], client.intentions);
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
        intentions: [],
    };
}

function checkChangeList(manager: TestEditManager, intentions: number[]): void {
    TestChangeRebaser.checkChangeList(getAllChanges(manager), intentions);
}

function getAllChanges(manager: TestEditManager): RecursiveReadonly<TestChangeset>[] {
    return manager.getTrunk().map((c) => c.changeset).concat(manager.getLocalChanges());
}

function getTipContext(manager: TestEditManager): number[] {
    const changes = getAllChanges(manager);
    for (let i = changes.length - 1; i >= 0; --i) {
        const change = changes[i];
        if (isNonEmptyChange(change)) {
            return [...change.outputContext];
        }
    }
    return [];
}
