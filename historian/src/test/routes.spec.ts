import * as assert from "assert";
import * as request from "supertest";
import * as app from "../app";
import { ICreateBlobParams, ICreateCommitParams, ICreateRefParams, ICreateTreeParams } from "../resources";
import * as testUtils from "./utils";

function createRepo(supertest: request.SuperTest<request.Test>, name: string) {
    return supertest
        .post("/repos")
        .set("Accept", "application/json")
        .set("Content-Type", "application/json")
        .send({ name })
        .expect(201);
}

function createBlob(supertest: request.SuperTest<request.Test>, repoName: string, blob: ICreateBlobParams) {
    return supertest
        .post(`/repos/${repoName}/git/blobs`)
        .set("Accept", "application/json")
        .set("Content-Type", "application/json")
        .send(blob)
        .expect(201);
}

function createTree(supertest: request.SuperTest<request.Test>, repoName: string, tree: ICreateTreeParams) {
    return supertest
        .post(`/repos/${repoName}/git/trees`)
        .set("Accept", "application/json")
        .set("Content-Type", "application/json")
        .send(tree)
        .expect(201);
}

function createCommit(supertest: request.SuperTest<request.Test>, repoName: string, commit: ICreateCommitParams) {
    return supertest
        .post(`/repos/${repoName}/git/commits`)
        .set("Accept", "application/json")
        .set("Content-Type", "application/json")
        .send(commit)
        .expect(201);
}

function createRef(supertest: request.SuperTest<request.Test>, repoName: string, ref: ICreateRefParams) {
    return supertest
        .post(`/repos/${repoName}/git/refs`)
        .set("Accept", "application/json")
        .set("Content-Type", "application/json")
        .send(ref)
        .expect(201);
}

async function initBaseRepo(
    supertest: request.SuperTest<request.Test>,
    repoName: string,
    testBlob: ICreateBlobParams,
    testTree: ICreateTreeParams,
    testCommit: ICreateCommitParams,
    testRef: ICreateRefParams) {
    await createRepo(supertest, repoName);
    await createBlob(supertest, repoName, testBlob);
    await createTree(supertest, repoName, testTree);
    await createCommit(supertest, repoName, testCommit);
    await createRef(supertest, repoName, testRef);
}

describe("Historian", () => {
    describe("Routes", () => {
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
                email: "kurtb@microsoft.com",
                name: "Kurt Berglund",
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
                    await createRepo(supertest, testRepoName);
                    return supertest
                        .get(`/repos/${testRepoName}`)
                        .expect(200);
                });

                it("Returns 400 for an unknown repo", async () => {
                    return supertest
                        .get(`/repos/${testRepoName}`)
                        .expect(400);
                });

                it("Rejects invalid repo names", () => {
                    return supertest
                        .post("/repos")
                        .set("Accept", "application/json")
                        .set("Content-Type", "application/json")
                        .send({ name: "../evilrepo"})
                        .expect(400);
                });

                it("Rejects missing repo names", () => {
                    return supertest
                        .post("/repos")
                        .expect(400);
                });
            });

            describe("Blobs", () => {
                it("Can create and retrieve a blob", async () => {
                    await createRepo(supertest, testRepoName);
                    const result = await createBlob(supertest, testRepoName, testBlob);
                    assert.equal(result.body.sha, "b45ef6fec89518d314f546fd6c3025367b721684");

                    return supertest
                        .get(`/repos/${testRepoName}/git/blobs/${result.body.sha}`)
                        .expect(200)
                        .expect((getResult) => {
                            assert.equal(getResult.body.sha, result.body.sha);
                        });
                });

                it("Can create an existing blob without error", async () => {
                    await createRepo(supertest, testRepoName);
                    await createBlob(supertest, testRepoName, testBlob);
                    await createBlob(supertest, testRepoName, testBlob);
                });
            });

            describe("Trees", () => {
                it("Can create and retrieve a tree", async () => {
                    await createRepo(supertest, testRepoName);
                    await createBlob(supertest, testRepoName, testBlob);
                    const tree = await createTree(supertest, testRepoName, testTree);
                    assert.equal(tree.body.sha, "bf4db183cbd07f48546a5dde098b4510745d79a1");

                    return supertest
                        .get(`/repos/${testRepoName}/git/trees/${tree.body.sha}`)
                        .expect(200)
                        .expect((getResult) => {
                            assert.equal(getResult.body.sha, tree.body.sha);
                        });
                });
            });

            describe("Commits", () => {
                it("Can create and retrieve a commit", async () => {
                    await createRepo(supertest, testRepoName);
                    await createBlob(supertest, testRepoName, testBlob);
                    await createTree(supertest, testRepoName, testTree);
                    const commit = await createCommit(supertest, testRepoName, testCommit);
                    assert.equal(commit.body.sha, "cf0b592907d683143b28edd64d274ca70f68998e");

                    return supertest
                        .get(`/repos/${testRepoName}/git/commits/${commit.body.sha}`)
                        .expect(200)
                        .expect((getResult) => {
                            assert.equal(getResult.body.sha, commit.body.sha);
                        });
                });
            });

            describe("Refs", () => {
                it("Can create and retrieve a reference", async () => {
                    await createRepo(supertest, testRepoName);
                    await createBlob(supertest, testRepoName, testBlob);
                    await createTree(supertest, testRepoName, testTree);
                    await createCommit(supertest, testRepoName, testCommit);
                    const ref = await createRef(supertest, testRepoName, testRef);
                    assert.equal(ref.body.ref, testRef.ref);

                    return supertest
                        .get(`/repos/${testRepoName}/git/${testRef.ref}`)
                        .expect(200)
                        .expect((getResult) => {
                            assert.equal(getResult.body.ref, ref.body.ref);
                        });
                });

                it("Can retrieve all references", async () => {
                    await initBaseRepo(supertest, testRepoName, testBlob, testTree, testCommit, testRef);
                    return supertest
                        .get(`/repos/${testRepoName}/git/refs`)
                        .expect(200)
                        .expect((getResult) => {
                            assert.equal(getResult.body.length, 1);
                            assert.equal(getResult.body[0].ref, testRef.ref);
                        });
                });

                // TODO need to verify the GitHub API works this way - odd to create a new commit via a patch command
                // but this simplfiies cases where we want to upsert
                it("Can patch to create a reference", async () => {
                    await initBaseRepo(supertest, testRepoName, testBlob, testTree, testCommit, testRef);
                    return supertest
                        .patch(`/repos/${testRepoName}/git/refs/heads/patch`)
                        .set("Accept", "application/json")
                        .set("Content-Type", "application/json")
                        .send({ force: true, sha: "cf0b592907d683143b28edd64d274ca70f68998e" })
                        .expect(200);
                });

                it("Can't patch an existing reference without force flag set", async () => {
                    await initBaseRepo(supertest, testRepoName, testBlob, testTree, testCommit, testRef);
                    return supertest
                        .patch(`/repos/${testRepoName}/git/${testRef.ref}`)
                        .set("Accept", "application/json")
                        .set("Content-Type", "application/json")
                        .send({ force: false, sha: "cf0b592907d683143b28edd64d274ca70f68998e" })
                        .expect(400);
                });

                it("Can patch an existing reference with force flag set", async () => {
                    await initBaseRepo(supertest, testRepoName, testBlob, testTree, testCommit, testRef);
                    return supertest
                        .patch(`/repos/${testRepoName}/git/${testRef.ref}`)
                        .set("Accept", "application/json")
                        .set("Content-Type", "application/json")
                        .send({ force: true, sha: "cf0b592907d683143b28edd64d274ca70f68998e" })
                        .expect(200);
                });

                it("Can delete a reference", async () => {
                    await initBaseRepo(supertest, testRepoName, testBlob, testTree, testCommit, testRef);
                    await supertest
                        .delete(`/repos/test/git/${testRef.ref}`)
                        .expect(204);

                    return supertest
                        .get(`/repos/${testRepoName}/git/${testRef.ref}`)
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
                            email: "kurtb@microsoft.com",
                            name: "Kurt Berglund",
                        },
                        type: "commit",
                    };

                    await initBaseRepo(supertest, testRepoName, testBlob, testTree, testCommit, testRef);
                    const tag = await supertest
                        .post(`/repos/${testRepoName}/git/tags`)
                        .set("Accept", "application/json")
                        .set("Content-Type", "application/json")
                        .send(tagParams)
                        .expect(201);
                    assert.equal(tag.body.sha, "a8588b3913aa692c3642697d6f136cec470dd82c");

                    return supertest
                        .get(`/repos/${testRepoName}/git/tags/${tag.body.sha}`)
                        .expect(200)
                        .expect((result) => {
                            assert.equal(result.body.sha, tag.body.sha);
                        });
                });
            });
        });

        // Higher level repository tests
        describe("Repository", () => {
            describe("Commits", () => {
                it("Can list recent commits", async () => {
                    await initBaseRepo(supertest, testRepoName, testBlob, testTree, testCommit, testRef);
                    return supertest
                        .get(`/repos/${testRepoName}/commits?sha=master`)
                        .expect(200)
                        .expect((result) => {
                            assert.equal(result.body.length, 1);
                        });
                });
            });

            describe("Content", () => {
                it("Can retrieve a stored object", async () => {
                    await initBaseRepo(supertest, testRepoName, testBlob, testTree, testCommit, testRef);
                    return supertest
                        .get(`/repos/${testRepoName}/contents/${testTree.tree[0].path}?ref=${testRef.sha}`)
                        .expect(200)
                        .expect((result) => {
                            // tslint:disable
                            console.log(result.body);
                        });
                });
            });
        });
    });
});
