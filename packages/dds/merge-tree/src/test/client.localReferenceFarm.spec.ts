/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import random from "random-js";
import { ReferencePosition } from "../referencePositions";
import { ReferenceType } from "../ops";
import {
    IMergeTreeOperationRunnerConfig,
    removeRange,
    runMergeTreeOperationRunner,
    generateClientNames,
    IConfigRange,
} from "./mergeTreeOperationRunner";
import { TestClient } from "./testClient";
import { TestClientLogger } from "./testClientLogger";
import { doOverRange } from ".";

 const defaultOptions: Record<"initLen" | "modLen", IConfigRange> & IMergeTreeOperationRunnerConfig = {
    initLen: { min: 2, max: 4 },
    modLen: { min: 1, max: 8 },
    opsPerRoundRange: { min: 10, max: 10 },
    rounds: 10,
    operations: [removeRange],
    growthFunc: (input: number) => input * 2,
};

describe("MergeTree.Client", () => {
    // Generate a list of single character client names, support up to 69 clients
    const clientNames = generateClientNames();

    doOverRange(defaultOptions.initLen, defaultOptions.growthFunc, (initLen) => {
        doOverRange(defaultOptions.modLen, defaultOptions.growthFunc, (modLen) => {
            it(`LocalReferenceFarm_${initLen}_${modLen}`, async () => {
                const mt = random.engines.mt19937();
                mt.seedWithArray([0xDEADBEEF, 0xFEEDBED, initLen, modLen]);

                const clients: TestClient[] = new Array(3).fill(0).map(() => new TestClient());
                clients.forEach(
                    (c, i) => c.startOrUpdateCollaboration(clientNames[i]));

                let seq = 0;
                // init with random values
                seq = runMergeTreeOperationRunner(
                    mt,
                    seq,
                    clients,
                    initLen,
                    defaultOptions,
                );
                // add local references
                const refs: ReferencePosition[][] = [];

                const validateRefs = (reason: string, workload: () => void) => {
                    const preWorkload = TestClientLogger.toString(clients);
                    workload();
                    for (let c = 1; c < clients.length; c++) {
                        for (let r = 0; r < refs[c].length; r++) {
                            const pos0 = clients[0].localReferencePositionToPosition(refs[0][r]);
                            const posC = clients[c].localReferencePositionToPosition(refs[c][r]);
                            if (pos0 !== posC) {
                                assert.equal(
                                    pos0, posC,
                                    `${reason}:\n${preWorkload}\n${TestClientLogger.toString(clients)}`);
                            }
                        }
                    }
                    // console.log(`${reason}:\n${preWorkload}\n${TestClientLogger.toString(clients)}`)
                };

                validateRefs("Initialize", () => {
                    clients.forEach((c, i) => {
                        refs.push([]);
                        for (let t = 0; t < c.getLength(); t++) {
                            const seg = c.getContainingSegment(t);
                            const lref = c.createLocalReferencePosition(
                                seg.segment!, seg.offset!, ReferenceType.SlideOnRemove, { t });
                            refs[i].push(lref);
                        }
                    });
                });

                validateRefs("After Init Zamboni", () => {
                    // trigger zamboni multiple times as it is incremental
                    for (let i = clients[0].getCollabWindow().minSeq; i <= seq; i++) {
                        clients.forEach((c) => c.updateMinSeq(i));
                    }
                });

                validateRefs("After More Ops", () => {
                    // init with random values
                    seq = runMergeTreeOperationRunner(
                        mt,
                        seq,
                        clients,
                        modLen,
                        defaultOptions,
                    );
                });

                validateRefs("After Final Zamboni", () => {
                    // trigger zamboni multiple times as it is incremental
                    for (let i = clients[0].getCollabWindow().minSeq; i <= seq; i++) {
                        clients.forEach((c) => c.updateMinSeq(i));
                    }
                });
            });
        });
    });
});
