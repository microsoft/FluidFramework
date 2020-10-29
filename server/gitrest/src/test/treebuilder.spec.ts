/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as async from "async";
import * as moniker from "moniker";
import git from "nodegit";
import * as testUtils from "./utils";

async function mockTree(repository: git.Repository, entries: number) {
    // eslint-disable-next-line no-null/no-null
    const builder = await git.Treebuilder.create(repository, null);

    const oid = git.Oid.fromString("b45ef6fec89518d314f546fd6c3025367b721684");
    for (let i = 0; i < entries; i++) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        builder.insert(
            moniker.choose(),
            oid,
            parseInt("100644", 8));
    }
    return builder.write();
}

describe("Treebuilder", () => {
    testUtils.initializeBeforeAfterTestHooks(testUtils.defaultProvider);

    it("Can create trees of multiple nodes", async () => {
        const concurrency = 10;
        const treeEntries = 100;
        const treeCount = 100;

        const isBare: any = 1;
        const repository = await git.Repository.init(
            `${testUtils.defaultProvider.get("storageDir")}/test`,
            isBare);

        const buffer = Buffer.from("Hello, World!", "utf-8");
        await repository.createBlobFromBuffer(buffer);

        // create a queue object with concurrency 2
        return new Promise<void>((resolve, reject) => {
            const q = async.queue((task, callback) => {
                const mockP = mockTree(repository, treeEntries).catch();
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                mockP.then(() => {
                    callback();
                });
            }, concurrency);

            q.drain = () => {
                resolve();
            };

            for (let i = 0; i < treeCount; i++) {
                q.push(1);
            }
        });
    });
});
