/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import random from "random-js";
import {
    IMergeTreeOperationRunnerConfig,
    removeRange,
    runMergeTreeOperationRunner,
    generateClientNames,
    IConfigRange,
    TestOperation,
    resolveRanges,
} from "./mergeTreeOperationRunner";
import { TestClient } from "./testClient";
import { TestClientLogger } from "./testClientLogger";
import { combineInterpreters, trackProperties } from "./testUtils";
import { defaultInterpreter } from "../mergeTree";
import { AttributionKey } from "../mergeTreeNodes";
import { generatePairwiseOptions } from "@fluidframework/test-pairwise-generator";

export const annotateRange: TestOperation =
    (client: TestClient, opStart: number, opEnd: number) =>
        client.annotateRangeLocal(opStart, opEnd, { client: client.longClientId }, undefined);


const defaultOptions: Record<"initLen" | "modLen", IConfigRange> & IMergeTreeOperationRunnerConfig = {
    initLen: { min: 2, max: 4 },
    modLen: { min: 1, max: 8 },
    opsPerRoundRange: { min: 10, max: 40 },
    rounds: 10,
    operations: [annotateRange, removeRange],
    growthFunc: (input: number) => input * 2,
};

describe.only("MergeTree.Attribution", () => {
    // Generate a list of single character client names, support up to 69 clients
    const clientNames = generateClientNames();
    const rangeOptions = resolveRanges(defaultOptions, defaultOptions.growthFunc);
    generatePairwiseOptions(rangeOptions).forEach(({ initLen, modLen, opsPerRoundRange }) => {
        it(`AttributionFarm_${initLen}_${modLen}_${opsPerRoundRange}`, async () => {
            const mt = random.engines.mt19937();
            mt.seedWithArray([0xDEADBEEF, 0xFEEDBED, initLen, modLen]);

            const clients: TestClient[] = new Array(3).fill(0).map(() => new TestClient({
                attribution: {
                    track: true,
                    interpreter: combineInterpreters(trackProperties("trackedProp1"), defaultInterpreter)
                }
            }));
            clients.forEach(
                (c, i) => c.startOrUpdateCollaboration(clientNames[i]));

            const getAttributionAtPosition = (client: TestClient, pos: number) => {
                const { segment, offset } = client.getContainingSegment(pos);
                if (segment?.attribution === undefined || offset === undefined) {
                    return undefined;
                }
                const { attribution } = segment;
                let channels: { [name: string]: AttributionKey | undefined } | undefined = undefined;
                const result: { root: AttributionKey | undefined; channels?: { [name: string]: AttributionKey | undefined } } = {
                    root: attribution.getAtOffset(offset),
                }
                for (const name of attribution.channelNames) {
                    (channels ??= {})[name] = attribution.getAtOffset(offset, name);
                    result.channels = channels;
                }
                return channels;
            }

            const validateAnnotation = (reason: string, workload: () => void) => {
                const preWorkload = TestClientLogger.toString(clients);
                workload();
                const attributions = Array.from({ length: clients[0].getLength() }).map(
                    (_, i) => getAttributionAtPosition(clients[0], i)
                );
                for (let c = 1; c < clients.length; c++) {
                    for (let i = 0; i < clients[c].getLength(); i++) {
                        const attribution0 = attributions[i];
                        const attributionC = getAttributionAtPosition(clients[c], i);
                        if (attribution0 !== attributionC) {
                            assert.equal(
                                attribution0, attributionC,
                                `${reason}:\n${preWorkload}\n${TestClientLogger.toString(clients)}`);
                        }
                    }
                }
            };
            
            let seq = 0;

            validateAnnotation("Initialize", () => {    
                seq = runMergeTreeOperationRunner(
                    mt,
                    seq,
                    clients,
                    initLen,
                    defaultOptions,
                );
            });

            validateAnnotation("After Init Zamboni", () => {
                // trigger zamboni multiple times as it is incremental
                for (let i = clients[0].getCollabWindow().minSeq; i <= seq; i++) {
                    clients.forEach((c) => c.updateMinSeq(i));
                }
            });

            validateAnnotation("After More Ops", () => {
                seq = runMergeTreeOperationRunner(
                    mt,
                    seq,
                    clients,
                    modLen,
                    defaultOptions,
                );
            });

            validateAnnotation("After Final Zamboni", () => {
                // trigger zamboni multiple times as it is incremental
                for (let i = clients[0].getCollabWindow().minSeq; i <= seq; i++) {
                    clients.forEach((c) => c.updateMinSeq(i));
                }
            });
        });
    });
});


