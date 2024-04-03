/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ICreateBlobParams,
	ICreateBlobResponse,
	ICreateCommitParams,
	ICreateRefParams,
	ICreateTreeParams,
} from "@fluidframework/gitresources";
import {
	ICreateRefParamsExternal,
	IGetRefParamsExternal,
} from "@fluidframework/server-services-client";
import assert from "assert";
import * as async from "async";
import lorem from "lorem-ipsum";
import sillyname from "sillyname";
import request from "supertest";
import * as app from "../app";
import { ExternalStorageManager } from "../externalStorageManager";
import { Constants, IsomorphicGitManagerFactory, NodeFsManagerFactory } from "../utils";
import * as testUtils from "./utils";

// TODO: (issue logged): replace email & name
const commitEmail = "kurtb@microsoft.com";
const commitName = "Kurt Berglund";

async function createRepo(supertest: request.SuperTest<request.Test>, owner: string, name: string) {
	return supertest
		.post(`/${owner}/repos`)
		.set("Accept", "application/json")
		.set("Content-Type", "application/json")
		.send({ name })
		.expect(201);
}

async function createBlob(
	supertest: request.SuperTest<request.Test>,
	owner: string,
	repoName: string,
	documentId: string,
	blob: ICreateBlobParams,
) {
	return supertest
		.post(`/repos/${owner}/${repoName}/git/blobs`)
		.set("Accept", "application/json")
		.set("Content-Type", "application/json")
		.set(Constants.StorageRoutingIdHeader, getStorageRoutingHeaderValue(repoName, documentId))
		.send(blob)
		.expect(201);
}

async function createTree(
	supertest: request.SuperTest<request.Test>,
	owner: string,
	repoName: string,
	documentId: string,
	tree: ICreateTreeParams,
) {
	return supertest
		.post(`/repos/${owner}/${repoName}/git/trees`)
		.set("Accept", "application/json")
		.set("Content-Type", "application/json")
		.set(Constants.StorageRoutingIdHeader, getStorageRoutingHeaderValue(repoName, documentId))
		.send(tree)
		.expect(201);
}

async function createCommit(
	supertest: request.SuperTest<request.Test>,
	owner: string,
	repoName: string,
	documentId: string,
	commit: ICreateCommitParams,
) {
	return supertest
		.post(`/repos/${owner}/${repoName}/git/commits`)
		.set("Accept", "application/json")
		.set("Content-Type", "application/json")
		.set(Constants.StorageRoutingIdHeader, getStorageRoutingHeaderValue(repoName, documentId))
		.send(commit)
		.expect(201);
}

async function createRef(
	supertest: request.SuperTest<request.Test>,
	owner: string,
	repoName: string,
	documentId: string,
	ref: ICreateRefParams,
) {
	return supertest
		.post(`/repos/${owner}/${repoName}/git/refs`)
		.set("Accept", "application/json")
		.set("Content-Type", "application/json")
		.set(Constants.StorageRoutingIdHeader, getStorageRoutingHeaderValue(repoName, documentId))
		.send(ref)
		.expect(201);
}

async function initBaseRepo(
	supertest: request.SuperTest<request.Test>,
	owner: string,
	repoName: string,
	documentId: string,
	testBlob: ICreateBlobParams,
	testTree: ICreateTreeParams,
	testCommit: ICreateCommitParams,
	testRef: ICreateRefParams,
) {
	await createRepo(supertest, owner, repoName);
	await createBlob(supertest, owner, repoName, documentId, testBlob);
	await createTree(supertest, owner, repoName, documentId, testTree);
	await createCommit(supertest, owner, repoName, documentId, testCommit);
	await createRef(supertest, owner, repoName, documentId, testRef);
}

function getStorageRoutingHeaderValue(tenantId: string, documentId: string) {
	return `${tenantId}:${documentId}`;
}

function normalizeMessage(gitLibrary: testUtils.gitLibType, message: string) {
	// For isomorphic-git, we keep the message as is.
	return message;
}

const testModes: testUtils.IRouteTestMode[] = [
	{
		name: "Using isomorphic-git as RepoManager with repoPerDoc enabled",
		gitLibrary: "isomorphic-git",
		repoPerDocEnabled: true,
	},
	{
		name: "Using isomorphic-git as RepoManager with repoPerDoc disabled",
		gitLibrary: "isomorphic-git",
		repoPerDocEnabled: false,
	},
];

testModes.forEach((mode) => {
	describe(`GitRest: ${mode.name}`, () => {
		const testOwnerName = "owner";
		const testRepoName = "test";
		const testDocId = "document1";
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
				},
			],
		};
		const testCommit: ICreateCommitParams = {
			author: {
				date: "Thu Jul 13 2017 20:17:40 GMT-0700 (PDT)",
				email: commitEmail,
				name: commitName,
			},
			message: normalizeMessage(mode.gitLibrary, "first commit"),
			parents: [],
			tree: "bf4db183cbd07f48546a5dde098b4510745d79a1",
		};
		const testRef: ICreateRefParamsExternal = {
			ref: "refs/heads/main",
			sha: "38421e18f9cf4ec024ae98f687e79c0bdf8f3f18",
			config: { enabled: true },
		};

		const testReadParams: IGetRefParamsExternal = {
			config: { enabled: true },
		};

		const testRefWriteDisabled: ICreateRefParams = {
			ref: "refs/heads/main",
			sha: "38421e18f9cf4ec024ae98f687e79c0bdf8f3f18",
		};

		const fileSystemManagerFactory = new NodeFsManagerFactory();
		const externalStorageManager = new ExternalStorageManager(testUtils.defaultProvider);
		const getRepoManagerFactory = (testMode: testUtils.IRouteTestMode) => {
			// The other possibility is isomorphic-git.
			return new IsomorphicGitManagerFactory(
				testUtils.defaultProvider.get("storageDir"),
				{ defaultFileSystemManagerFactory: fileSystemManagerFactory },
				externalStorageManager,
				testMode.repoPerDocEnabled,
			);
		};
		describe("Routes", () => {
			testUtils.initializeBeforeAfterTestHooks(testUtils.defaultProvider);

			// Create the git repo before and after each test
			let supertest: request.SuperTest<request.Test>;
			beforeEach(() => {
				const repoManagerFactory = getRepoManagerFactory(mode);
				testUtils.defaultProvider.set("git:repoPerDocEnabled", mode.repoPerDocEnabled);
				const testApp = app.create(
					testUtils.defaultProvider,
					{ defaultFileSystemManagerFactory: fileSystemManagerFactory },
					repoManagerFactory,
				);
				supertest = request(testApp);
			});

			// Git data API tests
			describe("Git", () => {
				describe("Repos", () => {
					it("Can create and get a new repo", async () => {
						await createRepo(supertest, testOwnerName, testRepoName);
						return supertest.get(`/repos/${testOwnerName}/${testRepoName}`).expect(200);
					});

					if (!mode.repoPerDocEnabled) {
						it("Returns 400 for an unknown repo", async () => {
							return supertest
								.get(`/repos/${testOwnerName}/${testRepoName}`)
								.expect(400);
						});

						it("Rejects invalid repo names", async () => {
							return supertest
								.post(`/${testOwnerName}/repos`)
								.set("Accept", "application/json")
								.set("Content-Type", "application/json")
								.send({ name: "../evilrepo" })
								.expect(400);
						});

						it("Rejects missing repo names", async () => {
							return supertest.post(`/${testOwnerName}/repos`).expect(400);
						});
					}
				});

				describe("Blobs", () => {
					it("Can create and retrieve a blob", async () => {
						await createRepo(supertest, testOwnerName, testRepoName);
						const result = await createBlob(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testBlob,
						);
						assert.strictEqual(
							result.body.sha,
							"b45ef6fec89518d314f546fd6c3025367b721684",
						);

						return supertest
							.get(
								`/repos/${testOwnerName}/${testRepoName}/git/blobs/${result.body.sha}`,
							)
							.set(
								Constants.StorageRoutingIdHeader,
								getStorageRoutingHeaderValue(testRepoName, testDocId),
							)
							.expect(200)
							.expect((getResult) => {
								assert.strictEqual(getResult.body.sha, result.body.sha);
							});
					});

					it("Can create an existing blob without error", async () => {
						await createRepo(supertest, testOwnerName, testRepoName);
						await createBlob(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testBlob,
						);
						await createBlob(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testBlob,
						);
					});
				});

				describe("Trees", () => {
					it("Can create and retrieve a tree", async () => {
						await createRepo(supertest, testOwnerName, testRepoName);
						await createBlob(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testBlob,
						);
						const tree = await createTree(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testTree,
						);
						assert.strictEqual(
							tree.body.sha,
							"bf4db183cbd07f48546a5dde098b4510745d79a1",
						);

						return supertest
							.get(
								`/repos/${testOwnerName}/${testRepoName}/git/trees/${tree.body.sha}`,
							)
							.set(
								Constants.StorageRoutingIdHeader,
								getStorageRoutingHeaderValue(testRepoName, testDocId),
							)
							.expect(200)
							.expect((getResult) => {
								assert.strictEqual(getResult.body.sha, tree.body.sha);
							});
					});

					it("Can recursively retrieve a tree", async () => {
						// Create a tree with a single sub directory
						await createRepo(supertest, testOwnerName, testRepoName);
						await createBlob(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testBlob,
						);
						await createTree(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testTree,
						);
						const parentBlob = await createBlob(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							{ content: "Parent", encoding: "utf-8" },
						);
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
								},
							],
						};
						const tree = await createTree(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							parentTree,
						);

						// And then a commit to reference it
						const treeCommit: ICreateCommitParams = {
							author: {
								date: "Thu Jul 13 2017 20:17:40 GMT-0700 (PDT)",
								email: commitEmail,
								name: commitName,
							},
							message: normalizeMessage(mode.gitLibrary, "complex tree"),
							parents: [],
							tree: tree.body.sha,
						};
						const commit = await createCommit(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							treeCommit,
						);

						return supertest
							.get(
								`/repos/${testOwnerName}/${testRepoName}/git/trees/${commit.body.tree.sha}?recursive=1`,
							)
							.set(
								Constants.StorageRoutingIdHeader,
								getStorageRoutingHeaderValue(testRepoName, testDocId),
							)
							.expect(200);
					});
				});

				describe("Commits", () => {
					it("Can create and retrieve a commit", async () => {
						await createRepo(supertest, testOwnerName, testRepoName);
						await createBlob(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testBlob,
						);
						await createTree(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testTree,
						);
						const commit = await createCommit(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testCommit,
						);
						assert.strictEqual(
							commit.body.sha,
							"38421e18f9cf4ec024ae98f687e79c0bdf8f3f18",
						);

						return supertest
							.get(
								`/repos/${testOwnerName}/${testRepoName}/git/commits/${commit.body.sha}`,
							)
							.set(
								Constants.StorageRoutingIdHeader,
								getStorageRoutingHeaderValue(testRepoName, testDocId),
							)
							.expect(200)
							.expect((getResult) => {
								assert.strictEqual(getResult.body.sha, commit.body.sha);
							});
					});
				});

				describe("Refs", () => {
					it("Can create and retrieve a reference", async () => {
						await createRepo(supertest, testOwnerName, testRepoName);
						await createBlob(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testBlob,
						);
						await createTree(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testTree,
						);
						await createCommit(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testCommit,
						);
						const ref = await createRef(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testRef,
						);
						assert.strictEqual(ref.body.ref, testRef.ref);

						return supertest
							.get(`/repos/${testOwnerName}/${testRepoName}/git/${testRef.ref}`)
							.set(
								Constants.StorageRoutingIdHeader,
								getStorageRoutingHeaderValue(testRepoName, testDocId),
							)
							.expect(200)
							.expect((getResult) => {
								assert.strictEqual(getResult.body.ref, ref.body.ref);
							});
					});

					it("Can retrieve all references", async () => {
						await initBaseRepo(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testBlob,
							testTree,
							testCommit,
							testRef,
						);
						return supertest
							.get(`/repos/${testOwnerName}/${testRepoName}/git/refs`)
							.set(
								Constants.StorageRoutingIdHeader,
								getStorageRoutingHeaderValue(testRepoName, testDocId),
							)
							.expect(200)
							.expect((getResult) => {
								assert.strictEqual(getResult.body.length, 1);
								assert.strictEqual(getResult.body[0].ref, testRef.ref);
							});
					});

					it("Can patch to create a reference", async () => {
						await initBaseRepo(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testBlob,
							testTree,
							testCommit,
							testRef,
						);
						return supertest
							.patch(`/repos/${testOwnerName}/${testRepoName}/git/refs/heads/patch`)
							.set("Accept", "application/json")
							.set("Content-Type", "application/json")
							.set(
								Constants.StorageRoutingIdHeader,
								getStorageRoutingHeaderValue(testRepoName, testDocId),
							)
							.send({
								force: true,
								sha: "38421e18f9cf4ec024ae98f687e79c0bdf8f3f18",
								config: { enabled: true },
							})
							.expect(200);
					});

					it("Can't patch an existing reference without force flag set", async () => {
						await initBaseRepo(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testBlob,
							testTree,
							testCommit,
							testRef,
						);
						return supertest
							.patch(`/repos/${testOwnerName}/${testRepoName}/git/${testRef.ref}`)
							.set("Accept", "application/json")
							.set("Content-Type", "application/json")
							.set(
								Constants.StorageRoutingIdHeader,
								getStorageRoutingHeaderValue(testRepoName, testDocId),
							)
							.send({
								force: false,
								sha: "38421e18f9cf4ec024ae98f687e79c0bdf8f3f18",
								config: { enabled: true },
							})
							.expect(400);
					});

					it("Can patch an existing reference with force flag set", async () => {
						await initBaseRepo(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testBlob,
							testTree,
							testCommit,
							testRef,
						);
						return supertest
							.patch(`/repos/${testOwnerName}/${testRepoName}/git/${testRef.ref}`)
							.set("Accept", "application/json")
							.set("Content-Type", "application/json")
							.set(
								Constants.StorageRoutingIdHeader,
								getStorageRoutingHeaderValue(testRepoName, testDocId),
							)
							.send({
								force: true,
								sha: "38421e18f9cf4ec024ae98f687e79c0bdf8f3f18",
								config: { enabled: true },
							})
							.expect(200);
					});

					it("Can delete a reference", async () => {
						await initBaseRepo(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testBlob,
							testTree,
							testCommit,
							testRefWriteDisabled,
						);
						await supertest
							.delete(
								`/repos/${testOwnerName}/${testRepoName}/git/${testRefWriteDisabled.ref}`,
							)
							.set(
								Constants.StorageRoutingIdHeader,
								getStorageRoutingHeaderValue(testRepoName, testDocId),
							)
							.expect(204);

						return supertest
							.get(
								`/repos/${testOwnerName}/${testRepoName}/git/${testRefWriteDisabled.ref}`,
							)
							.set(
								Constants.StorageRoutingIdHeader,
								getStorageRoutingHeaderValue(testRepoName, testDocId),
							)
							.expect(400);
					});
				});

				describe("Tags", () => {
					it("Can create and retrieve an annotated tag", async () => {
						const tagParams = {
							message: normalizeMessage(mode.gitLibrary, "Hello, World!"),
							object: "38421e18f9cf4ec024ae98f687e79c0bdf8f3f18",
							tag: "v1.0",
							tagger: {
								date: "Thu Jul 13 2017 20:17:40 GMT-0700 (PDT)",
								email: commitEmail,
								name: commitName,
							},
							type: "commit",
						};

						await initBaseRepo(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testBlob,
							testTree,
							testCommit,
							testRef,
						);
						const tag = await supertest
							.post(`/repos/${testOwnerName}/${testRepoName}/git/tags`)
							.set("Accept", "application/json")
							.set("Content-Type", "application/json")
							.set(
								Constants.StorageRoutingIdHeader,
								getStorageRoutingHeaderValue(testRepoName, testDocId),
							)
							.send(tagParams)
							.expect(201);
						assert.strictEqual(
							tag.body.sha,
							"2f208d6d4c5698feada2b5dad3886a0ceff4f80b",
						);

						return supertest
							.get(`/repos/${testOwnerName}/${testRepoName}/git/tags/${tag.body.sha}`)
							.set(
								Constants.StorageRoutingIdHeader,
								getStorageRoutingHeaderValue(testRepoName, testDocId),
							)
							.expect(200)
							.expect((result) => {
								assert.strictEqual(result.body.sha, tag.body.sha);
							});
					});
				});
			});

			describe("Stress", () => {
				it("Run a long time and break", async () => {
					const MaxTreeLength = 10;
					const MaxParagraphs = 200;

					await initBaseRepo(
						supertest,
						testOwnerName,
						testRepoName,
						testDocId,
						testBlob,
						testTree,
						testCommit,
						testRef,
					);
					const repoManagerFactory = getRepoManagerFactory(mode);
					const repoManager = await repoManagerFactory.open({
						repoOwner: testOwnerName,
						repoName: testRepoName,
						storageRoutingId: {
							tenantId: testRepoName,
							documentId: testDocId,
						},
					});

					let lastCommit;

					async function runRound() {
						const total = Math.floor(Math.random() * MaxTreeLength);
						const blobsP: Promise<ICreateBlobResponse>[] = [];
						for (let i = 0; i < total; i++) {
							const param: ICreateBlobParams = {
								content: lorem({
									count: Math.floor(Math.random() * MaxParagraphs),
									units: "paragraphs",
								}),
								encoding: "utf-8",
							};
							blobsP.push(repoManager.createBlob(param));
						}

						const blobs = await Promise.all(blobsP);
						const files = blobs.map((blob) => {
							return {
								mode: "100644",
								path: `${(sillyname() as string)
									.toLowerCase()
									.split(" ")
									.join("-")}.txt`,
								sha: blob.sha,
								type: "blob",
							};
						});
						const createTreeParams: ICreateTreeParams = {
							tree: files,
						};

						const tree = await repoManager.createTree(createTreeParams);

						const parents: string[] = [];
						if (lastCommit) {
							const commits = await repoManager.getCommits(
								lastCommit,
								1,
								testReadParams.config,
							);
							const parentCommit = commits[0];
							assert.ok(parentCommit.commit);
							parents.push(parentCommit.sha);
						}

						const commitParams: ICreateCommitParams = {
							author: {
								date: new Date().toISOString(),
								email: commitEmail,
								name: commitName,
							},
							message: normalizeMessage(
								mode.gitLibrary,
								lorem({ count: 1, units: "sentences" }),
							),
							parents,
							tree: tree.sha,
						};
						const commit = await repoManager.createCommit(commitParams);

						lastCommit = commit.sha;
					}

					const queue = async.queue((task, callback) => {
						runRound().then(
							() => callback(),
							(error) => callback(error),
						);
					}, 5);

					const resultP = new Promise<void>((resolve, reject) => {
						queue.drain(() => {
							resolve();
						});

						queue.error((error) => {
							reject(error);
						});
					});

					for (let i = 0; i < 100; i++) {
						void queue.push(i);
					}

					return resultP;
				}).timeout(4000);
			});

			// Higher level repository tests
			describe("Repository", () => {
				describe("Commits", () => {
					it("Can list recent commits", async () => {
						await initBaseRepo(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testBlob,
							testTree,
							testCommit,
							testRef,
						);
						return supertest
							.get(`/repos/${testOwnerName}/${testRepoName}/commits?sha=main`)
							.set(
								Constants.StorageRoutingIdHeader,
								getStorageRoutingHeaderValue(testRepoName, testDocId),
							)
							.expect(200)
							.expect((result) => {
								assert.strictEqual(result.body.length, 1);
							});
					});
				});

				describe("Content", () => {
					it("Can retrieve a stored object", async () => {
						await initBaseRepo(
							supertest,
							testOwnerName,
							testRepoName,
							testDocId,
							testBlob,
							testTree,
							testCommit,
							testRef,
						);
						const fullRepoPath = `${testOwnerName}/${testRepoName}`;
						return supertest
							.get(
								`/repos/${fullRepoPath}/contents/${testTree.tree[0].path}?ref=${testRef.sha}`,
							)
							.set(
								Constants.StorageRoutingIdHeader,
								getStorageRoutingHeaderValue(testRepoName, testDocId),
							)
							.expect(200);
					});
				});
			});

			describe("CorrelationId", () => {
				const correlationIdHeaderName = "x-correlation-id";
				const testCorrelationId = "test-correlation-id";

				const assertCorrelationId = async (
					url: string,
					method: "get" | "post" | "patch" | "delete" = "get",
				): Promise<void> => {
					await supertest[method](url)
						.set(correlationIdHeaderName, testCorrelationId)
						.set("Accept", "application/json")
						.set("Content-Type", "application/json")
						.set(
							Constants.StorageRoutingIdHeader,
							getStorageRoutingHeaderValue(testRepoName, testDocId),
						)
						.then((res) => {
							assert.strictEqual(
								res.headers?.[correlationIdHeaderName],
								testCorrelationId,
							);
						});
				};

				describe("Git", () => {
					describe("Blobs", () => {
						it("Should have correlation id when creating a blob", async () => {
							await initBaseRepo(
								supertest,
								testOwnerName,
								testRepoName,
								testDocId,
								testBlob,
								testTree,
								testCommit,
								testRef,
							);
							await assertCorrelationId(`/${testOwnerName}/repos`, "post");
						});
						it("Should have correlation id when getting a blob", async () => {
							await initBaseRepo(
								supertest,
								testOwnerName,
								testRepoName,
								testDocId,
								testBlob,
								testTree,
								testCommit,
								testRef,
							);
							await assertCorrelationId(
								`/repos/${testOwnerName}/${testRepoName}/git/blobs/${testTree.tree[0].sha}`,
							);
						});
					});

					describe("Commits", () => {
						it("Should have correlation id when creating a commit", async () => {
							await initBaseRepo(
								supertest,
								testOwnerName,
								testRepoName,
								testDocId,
								testBlob,
								testTree,
								testCommit,
								testRef,
							);
							await assertCorrelationId(
								`/repos/${testOwnerName}/${testRepoName}/git/commits`,
								"post",
							);
						});
						it("Should have correlation id when getting a commit", async () => {
							await initBaseRepo(
								supertest,
								testOwnerName,
								testRepoName,
								testDocId,
								testBlob,
								testTree,
								testCommit,
								testRef,
							);
							await assertCorrelationId(
								`/repos/${testOwnerName}/${testRepoName}/git/commits/${testTree.tree[0].sha}`,
							);
						});
					});

					describe("Refs", () => {
						it("GET /repos/:owner/:repo/git/refs", async () => {
							await initBaseRepo(
								supertest,
								testOwnerName,
								testRepoName,
								testDocId,
								testBlob,
								testTree,
								testCommit,
								testRef,
							);
							await assertCorrelationId(
								`/repos/${testOwnerName}/${testRepoName}/git/${testRef.ref}`,
							);
						});
						it("GET /repos/:owner/:repo/git/refs/*", async () => {
							await initBaseRepo(
								supertest,
								testOwnerName,
								testRepoName,
								testDocId,
								testBlob,
								testTree,
								testCommit,
								testRef,
							);
							await assertCorrelationId(
								`/repos/${testOwnerName}/${testRepoName}/git/${testRef.ref}/*`,
							);
						});
						it("POST /repos/:owner/:repo/git/refs", async () => {
							await initBaseRepo(
								supertest,
								testOwnerName,
								testRepoName,
								testDocId,
								testBlob,
								testTree,
								testCommit,
								testRef,
							);
							await assertCorrelationId(
								`/repos/${testOwnerName}/${testRepoName}/git/refs`,
								"post",
							);
						});
						it("PATCH /repos/:owner/:repo/git/refs/*", async () => {
							await initBaseRepo(
								supertest,
								testOwnerName,
								testRepoName,
								testDocId,
								testBlob,
								testTree,
								testCommit,
								testRef,
							);
							await assertCorrelationId(
								`/repos/${testOwnerName}/${testRepoName}/git/refs/heads/patch`,
								"patch",
							);
						});
						it("DELETE /repos/:owner/:repo/git/refs/*", async () => {
							await initBaseRepo(
								supertest,
								testOwnerName,
								testRepoName,
								testDocId,
								testBlob,
								testTree,
								testCommit,
								testRef,
							);
							await assertCorrelationId(
								`/repos/${testOwnerName}/${testRepoName}/git/${testRefWriteDisabled.ref}`,
								"delete",
							);
						});
					});

					describe("Repos", () => {
						it("Should have correlation id when creating a repo", async () => {
							await initBaseRepo(
								supertest,
								testOwnerName,
								testRepoName,
								testDocId,
								testBlob,
								testTree,
								testCommit,
								testRef,
							);
							await assertCorrelationId(`/repos/${testOwnerName}/repos`, "post");
						});
						it("Should have correlation id when getting a repo", async () => {
							await initBaseRepo(
								supertest,
								testOwnerName,
								testRepoName,
								testDocId,
								testBlob,
								testTree,
								testCommit,
								testRef,
							);
							await assertCorrelationId(`/repos/${testOwnerName}/${testRepoName}`);
						});
					});

					describe("Tags", () => {
						it("Should have correlation id when creating a tag", async () => {
							await initBaseRepo(
								supertest,
								testOwnerName,
								testRepoName,
								testDocId,
								testBlob,
								testTree,
								testCommit,
								testRef,
							);
							await assertCorrelationId(
								`/repos/${testOwnerName}/${testRepoName}/git/tags`,
								"post",
							);
						});
						it("Should have correlation id when getting a tag", async () => {
							await initBaseRepo(
								supertest,
								testOwnerName,
								testRepoName,
								testDocId,
								testBlob,
								testTree,
								testCommit,
								testRef,
							);
							await assertCorrelationId(
								`/repos/${testOwnerName}/${testRepoName}/git/tags/${testTree.tree[0].sha}`,
							);
						});
					});

					describe("Trees", () => {
						it("Should have correlation id when creating a tree", async () => {
							await initBaseRepo(
								supertest,
								testOwnerName,
								testRepoName,
								testDocId,
								testBlob,
								testTree,
								testCommit,
								testRef,
							);
							await assertCorrelationId(
								`/repos/${testOwnerName}/${testRepoName}/git/trees`,
								"post",
							);
						});
						it("Should have correlation id when getting a tree", async () => {
							await initBaseRepo(
								supertest,
								testOwnerName,
								testRepoName,
								testDocId,
								testBlob,
								testTree,
								testCommit,
								testRef,
							);
							await assertCorrelationId(
								`/repos/${testOwnerName}/${testRepoName}/git/trees/${testTree.tree[0].sha}`,
							);
						});
					});
				});

				describe("Repository", () => {
					describe("Commits", () => {
						it("Should have correlation id when listing recent commits", async () => {
							await initBaseRepo(
								supertest,
								testOwnerName,
								testRepoName,
								testDocId,
								testBlob,
								testTree,
								testCommit,
								testRef,
							);
							await assertCorrelationId(
								`/repos/${testOwnerName}/${testRepoName}/commits?sha=main`,
							);
						});
					});

					describe("Content", () => {
						it("Should have correlation id when retrieving a stored object", async () => {
							await initBaseRepo(
								supertest,
								testOwnerName,
								testRepoName,
								testDocId,
								testBlob,
								testTree,
								testCommit,
								testRef,
							);
							const fullRepoPath = `${testOwnerName}/${testRepoName}`;
							await assertCorrelationId(
								`/repos/${fullRepoPath}/contents/${testTree.tree[0].path}?ref=${testRef.sha}`,
							);
						});
					});
				});
			});
		});
	});
});
