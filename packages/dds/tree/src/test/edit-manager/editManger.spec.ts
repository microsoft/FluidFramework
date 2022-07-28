/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "assert";
import { ChangeFamily } from "../../change-family";
import { SeqNumber } from "../../changeset";
import { Commit, EditManager } from "../../edit-manager";
import { ChangeRebaser } from "../../rebase";
import { AnchorSet } from "../../tree";
import { makeArray, RecursiveReadonly } from "../../util";

interface TestChangeset {
    inputContext?: number;
    outputContext?: number;
    intentions: number[];
}

interface NonEmptyTestChangeset extends TestChangeset {
    inputContext: number;
    outputContext: number;
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

    public checkChangeList(changes: readonly RecursiveReadonly<TestChangeset>[], intentions?: Set<number>): void {
        const filtered = changes.filter(isNonEmptyChange);
        const intentionsSeen = new Set<number>();
        const intentionsExpected = new Set<number>(
            intentions ??
            makeArray(this.intentionCounter, (i: number) => i + 1),
        );
        let index = 0;
        for (const change of filtered) {
            for (const intention of change.intentions) {
                if (intention > 0) {
                    // The same intention should never be applied multiple times
                    assert.strictEqual(intentionsSeen.has(intention), false);
                    intentionsSeen.add(intention);
                    // The intention should be part of the expected set for this client
                    assert.strictEqual(intentionsExpected.has(intention), true);
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
        // All expected intentions were present
        assert.strictEqual(intentionsSeen.size, intentionsExpected.size);
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
const peerSessionId2 = 2;

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
            seqNumber: 1,
            refNumber: 0,
            changeset: cs1,
        });
        manager.addLocalChange(cs2);
        manager.addSequencedChange({
            sessionId: localSessionId,
            seqNumber: 2,
            refNumber: 1,
            changeset: cs2,
        });
        manager.addLocalChange(cs3);
        manager.addSequencedChange({
            sessionId: localSessionId,
            seqNumber: 3,
            refNumber: 2,
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
            seqNumber: 1,
            refNumber: 0,
            changeset: cs1,
        });
        manager.addSequencedChange({
            sessionId: localSessionId,
            seqNumber: 2,
            refNumber: 0,
            changeset: cs2,
        });
        manager.addSequencedChange({
            sessionId: localSessionId,
            seqNumber: 3,
            refNumber: 0,
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
            seqNumber: 1,
            refNumber: 0,
            changeset: cs1,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: 2,
            refNumber: 1,
            changeset: cs2,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: 3,
            refNumber: 2,
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
            seqNumber: 1,
            refNumber: 0,
            changeset: cs1,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: 2,
            refNumber: 1,
            changeset: cs2,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: 3,
            refNumber: 2,
            changeset: cs3,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: 4,
            refNumber: 0,
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
            seqNumber: 1,
            refNumber: 0,
            changeset: cs1,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: 2,
            refNumber: 1,
            changeset: cs2,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: 3,
            refNumber: 2,
            changeset: cs3,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: 4,
            refNumber: 0,
            changeset: cs4,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: 5,
            refNumber: 0,
            changeset: cs5,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: 6,
            refNumber: 0,
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
            seqNumber: 1,
            refNumber: 0,
            changeset: cs1,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: 2,
            refNumber: 0,
            changeset: cs4,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: 3,
            refNumber: 1,
            changeset: cs2,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: 4,
            refNumber: 2,
            changeset: cs3,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: 5,
            refNumber: 0,
            changeset: cs5,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: 6,
            refNumber: 0,
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
            seqNumber: 1,
            refNumber: 0,
            changeset: cs1,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: 2,
            refNumber: 0,
            changeset: cs4,
        });
        const cs8 = rebaser.mintChangeset(getLocalContext(manager));
        manager.addLocalChange(cs8);
        const cs9 = rebaser.mintChangeset(getLocalContext(manager));
        manager.addLocalChange(cs9);
        manager.addSequencedChange({
            sessionId: localSessionId,
            seqNumber: 3,
            refNumber: 0,
            changeset: cs7,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: 4,
            refNumber: 1,
            changeset: cs2,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId1,
            seqNumber: 5,
            refNumber: 2,
            changeset: cs3,
        });
        manager.addSequencedChange({
            sessionId: localSessionId,
            seqNumber: 6,
            refNumber: 2,
            changeset: cs8,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: 7,
            refNumber: 0,
            changeset: cs5,
        });
        manager.addSequencedChange({
            sessionId: localSessionId,
            seqNumber: 8,
            refNumber: 2,
            changeset: cs9,
        });
        manager.addSequencedChange({
            sessionId: peerSessionId2,
            seqNumber: 9,
            refNumber: 0,
            changeset: cs6,
        });
        checkChangeList(manager, rebaser);
    });

    it("Can handle all possible interleaving of steps", () => {
        const meta = {
            clientData: makeArray(NUM_CLIENTS, () => ({ pulled: 0, numLocal: 0 })),
            seq: 0,
        };
        for (const scenario of developAndRunScenario([], meta)) {
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

interface ScenarioMetadata {
    clientData: { pulled: SeqNumber; numLocal: number; }[];
    seq: SeqNumber;
}

function* developAndRunScenario(
    scenario: ScenarioStep[],
    meta: ScenarioMetadata,
): Generator<readonly ScenarioStep[]> {
    if (scenario.length >= NUM_STEPS) {
        yield scenario;
    } else {
        // Mint
        for (let iClient = 0; iClient < NUM_CLIENTS; ++iClient) {
            meta.clientData[iClient].numLocal += 1;
            scenario.push({ type: "Mint", client: iClient });
            developAndRunScenario(scenario, meta);
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
                developAndRunScenario(scenario, meta);
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
                developAndRunScenario(scenario, meta);
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
    const { rebaser, family } = changeFamilyFactory();
    const trunk: Commit<TestChangeset>[] = [];
    const clientData: ClientData[] = makeArray(NUM_CLIENTS, (iClient) => ({
        manager: new EditManager<TestChangeset, TestChangeFamily>(
            iClient,
            family,
        ),
        localChanges: [],
        ref: 0,
        intentions: new Set(),
    }));
    for (const step of scenario) {
        const client = clientData[step.client];
        if (step.type === "Mint") {
            const cs = rebaser.mintChangeset(getLocalContext(client.manager));
            client.manager.addLocalChange(cs);
            client.localChanges.push({ change: cs, ref: client.ref });
            cs.intentions.map(client.intentions.add);
        } else if (step.type === "Sequence") {
            const local = client.localChanges.shift() ?? fail("No local changes to sequence");
            trunk.push({
                changeset: local.change,
                refNumber: local.ref,
                sessionId: step.client,
                seqNumber: trunk.length + 1,
            });
        } else { // step.type === "Receive"
            const commit = trunk[client.ref];
            client.manager.addSequencedChange(commit);
            commit.changeset.intentions.map(client.intentions.add);
            client.ref += 1;
        }
    }
    for (const client of clientData) {
        checkChangeList(client.manager, rebaser, client.intentions);
    }
}

function checkChangeList(manager: TestEditManager, rebaser: TestChangeRebaser, intentions?: Set<number>): void {
    rebaser.checkChangeList(
        manager.getTrunk().map((c) => c.changeset)
        .concat(manager.getLocalChanges()),
        intentions,
    );
}

function getLocalContext(manager: TestEditManager): number {
    let context;
    const localChanges = manager.getLocalChanges();
    if (localChanges.length === 0) {
        const trunk = manager.getTrunk();
        if (trunk.length === 0) {
            context = 0;
        } else {
            context = trunk[trunk.length - 1].changeset.outputContext;
        }
    } else {
        const lastChange = localChanges[localChanges.length - 1];
        context = lastChange.outputContext;
    }
    return context ?? fail("Can't determine local context");
}
