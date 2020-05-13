/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICommitDetails,
    ICreateBlobParams,
    ICreateBlobResponse,
    ICreateCommitParams,
    ICreateRefParams,
    ICreateTreeParams,
} from "@microsoft/fluid-gitresources";
import assert from "assert";
import * as async from "async";
import * as lorem from "lorem-ipsum";
import * as moniker from "moniker";
import * as request from "supertest";
import * as app from "../app";
import { createBlob as createBlobInternal } from "../routes/git/blobs";
import { createCommit as createCommitInternal } from "../routes/git/commits";
import { createTree as createTreeInternal } from "../routes/git/trees";
import { getCommits } from "../routes/repository/commits";
import * as utils from "../utils";
import * as testUtils from "./utils";

// TODO: (issue logged): replace email & name
const commitEmail = "kurtb@microsoft.com";
const commitName = "Kurt Berglund";

function createRepo(supertest: request.SuperTest<request.Test>, owner: string, name: string) {
    return supertest
        .post(`/${owner}/repos`)
        .set("Accept", "application/json")
        .set("Content-Type", "application/json")
        .send({ name })
        .expect(201);
}

function createBlob(
    supertest: request.SuperTest<request.Test>,
    owner: string,
    repoName: string,
    blob: ICreateBlobParams) {

    return supertest
        .post(`/repos/${owner}/${repoName}/git/blobs`)
        .set("Accept", "application/json")
        .set("Content-Type", "application/json")
        .send(blob)
        .expect(201);
}

function createTree(
    supertest: request.SuperTest<request.Test>,
    owner: string,
    repoName: string,
    tree: ICreateTreeParams) {

    return supertest
        .post(`/repos/${owner}/${repoName}/git/trees`)
        .set("Accept", "application/json")
        .set("Content-Type", "application/json")
        .send(tree)
        .expect(201);
}

function createCommit(
    supertest: request.SuperTest<request.Test>,
    owner: string,
    repoName: string,
    commit: ICreateCommitParams) {

    return supertest
        .post(`/repos/${owner}/${repoName}/git/commits`)
        .set("Accept", "application/json")
        .set("Content-Type", "application/json")
        .send(commit)
        .expect(201);
}

function createRef(
    supertest: request.SuperTest<request.Test>,
    owner: string,
    repoName: string,
    ref: ICreateRefParams) {

    return supertest
        .post(`/repos/${owner}/${repoName}/git/refs`)
        .set("Accept", "application/json")
        .set("Content-Type", "application/json")
        .send(ref)
        .expect(201);
}

async function initBaseRepo(
    supertest: request.SuperTest<request.Test>,
    owner: string,
    repoName: string,
    testBlob: ICreateBlobParams,
    testTree: ICreateTreeParams,
    testCommit: ICreateCommitParams,
    testRef: ICreateRefParams) {

    await createRepo(supertest, owner, repoName);
    await createBlob(supertest, owner, repoName, testBlob);
    await createTree(supertest, owner, repoName, testTree);
    await createCommit(supertest, owner, repoName, testCommit);
    await createRef(supertest, owner, repoName, testRef);
}

describe("Historian", () => {
    describe("Routes", () => {
        const testOwnerName = "owner";
        const testRepoName = "test";
        const testBlob: ICreateBlobParams = {
            content: "Hello, World!",
            encoding: "utf-8",
        };
        const testTree: ICreateTreeParams = {
            tree: [
                {
                    mode: "100644",
                    path: "file.txt",
                    sha: "b45ef6fec89518d314f546fd6c3025367b721684",
                    type: "blob",
                }],
        };
        const testCommit: ICreateCommitParams = {
            author: {
                date: "Thu Jul 13 2017 20:17:40 GMT-0700 (PDT)",
                email: commitEmail,
                name: commitName,
            },
            message: "first commit",
            parents: [],
            tree: "bf4db183cbd07f48546a5dde098b4510745d79a1",
        };
        const testRef: ICreateRefParams = {
            ref: "refs/heads/master",
            sha: "cf0b592907d683143b28edd64d274ca70f68998e",
        };

        testUtils.initializeBeforeAfterTestHooks(testUtils.defaultProvider);

        // Create the git repo before and after each test
        let supertest: request.SuperTest<request.Test>;
        beforeEach(() => {
            const testApp = app.create(testUtils.defaultProvider);
            supertest = request(testApp);
        });

        // Git data API tests
        describe("Git", () => {
            describe("Repos", () => {
                it("Can create and get a new repo", async () => {
                    await createRepo(supertest, testOwnerName, testRepoName);
                    return supertest
                        .get(`/repos/${testOwnerName}/${testRepoName}`)
                        .expect(200);
                });

                it("Returns 400 for an unknown repo", async () => {
                    return supertest
                        .get(`/repos/${testOwnerName}/${testRepoName}`)
                        .expect(400);
                });

                it("Rejects invalid repo names", () => {
                    return supertest
                        .post(`/${testOwnerName}/repos`)
                        .set("Accept", "application/json")
                        .set("Content-Type", "application/json")
                        .send({ name: "../evilrepo"})
                        .expect(400);
                });

                it("Rejects missing repo names", () => {
                    return supertest
                        .post(`/${testOwnerName}/repos`)
                        .expect(400);
                });
            });

            describe("Blobs", () => {
                it("Can create and retrieve a blob", async () => {
                    await createRepo(supertest, testOwnerName, testRepoName);
                    const result = await createBlob(supertest,  testOwnerName, testRepoName, testBlob);
                    assert.equal(result.body.sha, "b45ef6fec89518d314f546fd6c3025367b721684");

                    return supertest
                        .get(`/repos/${testOwnerName}/${testRepoName}/git/blobs/${result.body.sha}`)
                        .expect(200)
                        .expect((getResult) => {
                            assert.equal(getResult.body.sha, result.body.sha);
                        });
                });

                it("Can create an existing blob without error", async () => {
                    await createRepo(supertest, testOwnerName, testRepoName);
                    await createBlob(supertest, testOwnerName, testRepoName, testBlob);
                    await createBlob(supertest, testOwnerName, testRepoName, testBlob);
                });
            });

            describe("Trees", () => {
                it("Can create and retrieve a tree", async () => {
                    await createRepo(supertest, testOwnerName, testRepoName);
                    await createBlob(supertest, testOwnerName, testRepoName, testBlob);
                    const tree = await createTree(supertest,  testOwnerName, testRepoName, testTree);
                    assert.equal(tree.body.sha, "bf4db183cbd07f48546a5dde098b4510745d79a1");

                    return supertest
                        .get(`/repos/${testOwnerName}/${testRepoName}/git/trees/${tree.body.sha}`)
                        .expect(200)
                        .expect((getResult) => {
                            assert.equal(getResult.body.sha, tree.body.sha);
                        });
                });

                it("Can recursively retrieve a tree", async () => {
                    // Create a tree with a single sub directory
                    await createRepo(supertest, testOwnerName, testRepoName);
                    await createBlob(supertest, testOwnerName, testRepoName, testBlob);
                    await createTree(supertest, testOwnerName, testRepoName, testTree);
                    const parentBlob = await createBlob(
                        supertest,
                        testOwnerName,
                        testRepoName,
                        { content: "Parent", encoding: "utf-8" });
                    const parentTree = {
                        tree: [
                            {
                                mode: "100644",
                                path: "parentBlob.txt",
                                sha: parentBlob.body.sha,
                                type: "blob",
                            },
                            {
                                mode: "040000",
                                path: "subdir",
                                sha: "bf4db183cbd07f48546a5dde098b4510745d79a1",
                                type: "tree",
                            }],
                    };
                    const tree = await createTree(supertest, testOwnerName, testRepoName, parentTree);

                    // And then a commit to reference it
                    const treeCommit: ICreateCommitParams = {
                        author: {
                            date: "Thu Jul 13 2017 20:17:40 GMT-0700 (PDT)",
                            email: commitEmail,
                            name: commitName,
                        },
                        message: "complex tree",
                        parents: [],
                        tree: tree.body.sha,
                    };
                    const commit = await createCommit(supertest, testOwnerName, testRepoName, treeCommit);

                    return supertest
                        .get(`/repos/${testOwnerName}/${testRepoName}/git/trees/${commit.body.tree.sha}?recursive=1`)
                        .expect(200);
                });
            });

            describe("Commits", () => {
                it("Can create and retrieve a commit", async () => {
                    await createRepo(supertest, testOwnerName, testRepoName);
                    await createBlob(supertest, testOwnerName, testRepoName, testBlob);
                    await createTree(supertest, testOwnerName, testRepoName, testTree);
                    const commit = await createCommit(supertest, testOwnerName, testRepoName, testCommit);
                    assert.equal(commit.body.sha, "cf0b592907d683143b28edd64d274ca70f68998e");

                    return supertest
                        .get(`/repos/${testOwnerName}/${testRepoName}/git/commits/${commit.body.sha}`)
                        .expect(200)
                        .expect((getResult) => {
                            assert.equal(getResult.body.sha, commit.body.sha);
                        });
                });
            });

            describe("Refs", () => {
                it("Can create and retrieve a reference", async () => {
                    await createRepo(supertest, testOwnerName, testRepoName);
                    await createBlob(supertest, testOwnerName, testRepoName, testBlob);
                    await createTree(supertest, testOwnerName, testRepoName, testTree);
                    await createCommit(supertest, testOwnerName, testRepoName, testCommit);
                    const ref = await createRef(supertest, testOwnerName, testRepoName, testRef);
                    assert.equal(ref.body.ref, testRef.ref);

                    return supertest
                        .get(`/repos/${testOwnerName}/${testRepoName}/git/${testRef.ref}`)
                        .expect(200)
                        .expect((getResult) => {
                            assert.equal(getResult.body.ref, ref.body.ref);
                        });
                });

                it("Can retrieve all references", async () => {
                    await initBaseRepo(supertest, testOwnerName, testRepoName, testBlob, testTree, testCommit, testRef);
                    return supertest
                        .get(`/repos/${testOwnerName}/${testRepoName}/git/refs`)
                        .expect(200)
                        .expect((getResult) => {
                            assert.equal(getResult.body.length, 1);
                            assert.equal(getResult.body[0].ref, testRef.ref);
                        });
                });

                it("Can patch to create a reference", async () => {
                    await initBaseRepo(supertest, testOwnerName, testRepoName, testBlob, testTree, testCommit, testRef);
                    return supertest
                        .patch(`/repos/${testOwnerName}/${testRepoName}/git/refs/heads/patch`)
                        .set("Accept", "application/json")
                        .set("Content-Type", "application/json")
                        .send({ force: true, sha: "cf0b592907d683143b28edd64d274ca70f68998e" })
                        .expect(200);
                });

                it("Can't patch an existing reference without force flag set", async () => {
                    await initBaseRepo(supertest, testOwnerName, testRepoName, testBlob, testTree, testCommit, testRef);
                    return supertest
                        .patch(`/repos/${testOwnerName}/${testRepoName}/git/${testRef.ref}`)
                        .set("Accept", "application/json")
                        .set("Content-Type", "application/json")
                        .send({ force: false, sha: "cf0b592907d683143b28edd64d274ca70f68998e" })
                        .expect(400);
                });

                it("Can patch an existing reference with force flag set", async () => {
                    await initBaseRepo(supertest, testOwnerName, testRepoName, testBlob, testTree, testCommit, testRef);
                    return supertest
                        .patch(`/repos/${testOwnerName}/${testRepoName}/git/${testRef.ref}`)
                        .set("Accept", "application/json")
                        .set("Content-Type", "application/json")
                        .send({ force: true, sha: "cf0b592907d683143b28edd64d274ca70f68998e" })
                        .expect(200);
                });

                it("Can delete a reference", async () => {
                    await initBaseRepo(supertest, testOwnerName, testRepoName, testBlob, testTree, testCommit, testRef);
                    await supertest
                        .delete(`/repos/${testOwnerName}/${testRepoName}/git/${testRef.ref}`)
                        .expect(204);

                    return supertest
                        .get(`/repos/${testOwnerName}/${testRepoName}/git/${testRef.ref}`)
                        .expect(400);
                });
            });

            describe("Tags", () => {
                it("Can create and retrive an annotated tag", async () => {
                    const tagParams = {
                        message: "Hello, World!",
                        object: "cf0b592907d683143b28edd64d274ca70f68998e",
                        tag: "v1.0",
                        tagger: {
                            date: "Thu Jul 13 2017 20:17:40 GMT-0700 (PDT)",
                            email: commitEmail,
                            name: commitName,
                        },
                        type: "commit",
                    };

                    await initBaseRepo(supertest, testOwnerName, testRepoName, testBlob, testTree, testCommit, testRef);
                    const tag = await supertest
                        .post(`/repos/${testOwnerName}/${testRepoName}/git/tags`)
                        .set("Accept", "application/json")
                        .set("Content-Type", "application/json")
                        .send(tagParams)
                        .expect(201);
                    assert.equal(tag.body.sha, "a8588b3913aa692c3642697d6f136cec470dd82c");

                    return supertest
                        .get(`/repos/${testOwnerName}/${testRepoName}/git/tags/${tag.body.sha}`)
                        .expect(200)
                        .expect((result) => {
                            assert.equal(result.body.sha, tag.body.sha);
                        });
                });
            });
        });

        describe("Stress", () => {
            it("Run a long time and break", async () => {
                const MaxTreeLength = 10;
                const MaxParagraphs = 200;

                await initBaseRepo(supertest, testOwnerName, testRepoName, testBlob, testTree, testCommit, testRef);
                const manager = new utils.RepositoryManager(testUtils.defaultProvider.get("storageDir"));

                let lastCommit;

                async function runRound() {
                    const total = Math.floor(Math.random() * MaxTreeLength);
                    const blobsP: Array<Promise<ICreateBlobResponse>> = [];
                    for (let i = 0; i < total; i++) {
                        const param: ICreateBlobParams = {
                            content: lorem({
                                count: Math.floor(Math.random() * MaxParagraphs),
                                units: "paragraphs",
                            }),
                            encoding: "utf-8",
                        };
                        blobsP.push(createBlobInternal(manager, testOwnerName, testRepoName, param));
                    }

                    const blobs = await Promise.all(blobsP);
                    const files = blobs.map((blob) => {
                        return {
                            mode: "100644",
                            path: `${moniker.choose()}.txt`,
                            sha: blob.sha,
                            type: "blob",
                        };
                    });
                    const createTreeParams: ICreateTreeParams = {
                        tree: files,
                    };

                    const tree = await createTreeInternal(manager, testOwnerName, testRepoName, createTreeParams);

                    const parents: string[] = [];
                    if (lastCommit) {
                        const commits = await getCommits(manager, testOwnerName, testRepoName, lastCommit, 1);
                        const parentCommit = commits[0] as ICommitDetails;
                        assert.ok(parentCommit.commit);
                        parents.push(parentCommit.sha);
                    }

                    const commitParams: ICreateCommitParams = {
                        author: {
                            date: new Date().toISOString(),
                            email: commitEmail,
                            name: commitName,
                        },
                        message: lorem({ count: 1, units: "sentences" }),
                        parents,
                        tree: tree.sha,
                    };
                    const commit = await createCommitInternal(manager, testOwnerName, testRepoName, commitParams);

                    lastCommit = commit.sha;
                }

                const queue = async.queue(
                    (task, callback) => {
                        runRound().then(() => callback(), (error) => callback(error));
                    },
                    5);

                const resultP = new Promise((resolve, reject) => {
                    queue.drain = () => {
                        resolve();
                    };

                    queue.error = (error) => {
                        reject(error);
                    };
                });

                for (let i = 0; i < 100; i++) {
                    queue.push(i);
                }

                return resultP;
            }).timeout(4000);
        });

        // Higher level repository tests
        describe("Repository", () => {
            describe("Commits", () => {
                it("Can list recent commits", async () => {
                    await initBaseRepo(supertest, testOwnerName, testRepoName, testBlob, testTree, testCommit, testRef);
                    return supertest
                        .get(`/repos/${testOwnerName}/${testRepoName}/commits?sha=master`)
                        .expect(200)
                        .expect((result) => {
                            assert.equal(result.body.length, 1);
                        });
                });
            });

            describe("Content", () => {
                it("Can retrieve a stored object", async () => {
                    await initBaseRepo(supertest, testOwnerName, testRepoName, testBlob, testTree, testCommit, testRef);
                    const fullRepoPath = `${testOwnerName}/${testRepoName}`;
                    return supertest
                        .get(`/repos/${fullRepoPath}/contents/${testTree.tree[0].path}?ref=${testRef.sha}`)
                        .expect(200);
                });
            });
        });
    });
});
