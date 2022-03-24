/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as async from "async";
import sillyname from "sillyname";
import git from "nodegit";
import * as testUtils from "./utils";

async function mockTree(repository: git.Repository, entries: number) {
    const builder = await git.Treebuilder.create(repository, null);

    const oid = git.Oid.fromString("b45ef6fec89518d314f546fd6c3025367b721684");
    for (let i = 0; i < entries; i++) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        builder.insert(
            (sillyname() as string).toLowerCase().split(" ").join("-"),
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

            q.drain(() => {
                resolve();
            });

            for (let i = 0; i < treeCount; i++) {
                void q.push(1);
            }
        });
    });
});
