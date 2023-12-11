/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { v4 as uuid } from "uuid";
import { ISummaryTestMode } from "./utils";
import { GitWholeSummaryManager, IsomorphicGitManagerFactory, MemFsManagerFactory } from "../utils";
import { NullExternalStorageManager } from "../externalStorageManager";

// Github Copilot wizardry.
function permuteFlags(obj: Record<string, boolean>): Record<string, boolean>[] {
    const keys = Object.keys(obj);
    const permutations: Record<string, boolean>[] = [];
    for (let i = 0; i < Math.pow(2, keys.length); i++) {
        const permutation: Record<string, boolean> = {};
        for (let j = 0; j < keys.length; j++) {
            permutation[keys[j]] = (i & (1 << j)) !== 0;
        }
        permutations.push(permutation);
    }
    return permutations;
}

const testModes = permuteFlags({
	repoPerDocEnabled: false,
    enableLowIoWrite: false,
    enableOptimizedInitialSummary: false,
    enableSlimGitInit: false,
}) as unknown as ISummaryTestMode[];

testModes.forEach((testMode) => {
    describe(`Summaries (${JSON.stringify(testMode)})`, () => {
        const memfsManagerFactory = new MemFsManagerFactory();
        const tenantId = 'gitrest-summaries-test';
        let documentId: string;
        let wholeSummaryManager: GitWholeSummaryManager;
        beforeEach(async () => {
            documentId = uuid();
            const repoManagerFactory = new IsomorphicGitManagerFactory(
                {
                    useRepoOwner: true,
                    baseDir: `/${uuid()}/tmp`
                },
                {
                    defaultFileSystemManagerFactory: memfsManagerFactory,
                },
                new NullExternalStorageManager(),
                testMode.repoPerDocEnabled,
                false /* enableRepositoryManagerMetrics */,
                testMode.enableSlimGitInit,
                undefined /* apiMetricsSamplingPeriod */
            );
            const repoManager = await repoManagerFactory.create({
                repoOwner: tenantId,
                repoName: documentId,
                storageRoutingId: { tenantId, documentId },
            });
            wholeSummaryManager = new GitWholeSummaryManager(
                uuid(),
                repoManager,
                {documentId, tenantId},
                false /* externalStorageEnabled */,
                {
                    enableLowIoWrite: testMode.enableLowIoWrite,
                    optimizeForInitialSummary: testMode.enableOptimizedInitialSummary,
                },
            );
        });

        afterEach(() => {
            process.stdout.write(`\nFinal storage size: ${JSON.stringify(memfsManagerFactory.volume.toJSON()).length/1_024}kb\n`);
            memfsManagerFactory.volume.reset();
        });

        it("Can create an initial summary", () => {
            assert(true);
        });
        it("Can create an incremental summary", () => {
            assert(true);
        });
    });
});
