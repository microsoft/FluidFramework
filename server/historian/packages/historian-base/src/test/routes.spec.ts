/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import express from "express";
import * as sinon from "sinon";
import request from "supertest";
import * as nconf from "nconf";
import { TestThrottler } from "@fluidframework/server-test-utils";
import type { IDocument } from "@fluidframework/server-services-core";
import { Lumberjack, TestEngine1 } from "@fluidframework/server-services-telemetry";
import { configureGlobalTelemetryContext } from "@fluidframework/server-services-utils";
import * as historianApp from "../app";
import { RestGitService } from "../services";
import { TestTenantService, TestCache, TestDocumentManager } from "./utils";
import { Constants } from "../utils";
import { createRouteContext } from "../routes/utils";
import {
	generateToken,
	getAuthorizationTokenFromCredentials,
	NetworkError,
} from "@fluidframework/server-services-client";
import { ScopeType } from "@fluidframework/protocol-definitions";
import { StartupCheck } from "@fluidframework/server-services-shared";

const limit = 10;
const sha = "testSha";
const tenantId = "testTenantId";
const documentId = "testDocumentId";
const tenantKey = "testTenantKey";
const testUrl = "http://localhost/historian";
const defaultCache = new TestCache();
const defaultProvider = new nconf.Provider({}).defaults({
	auth: {
		maxTokenLifetimeSec: 1000000,
		enableTokenExpiration: true,
	},
	logger: {
		morganFormat: "json",
	},
});
const defaultTenantService = new TestTenantService();

const lumberjackEngine = new TestEngine1();
if (!Lumberjack.isSetupCompleted()) {
	Lumberjack.setup([lumberjackEngine]);
}

/**
 * A helper method that will first send (limit) number of requests and assert they are not throttled,
 * and then send another request which exceeds the throttling limit to assert the throttling response is received.
 */
const sendRequestsTillThrottledWithAssertion = async (
	superTest: request.SuperTest<request.Test>,
	url: string,
	method: "get" | "post" | "patch" | "delete" = "get",
): Promise<void> => {
	const sendReq = () =>
		superTest[method](url).set(
			"Authorization",
			getAuthorizationTokenFromCredentials({
				user: tenantId,
				password: generateToken(tenantId, documentId, tenantKey, [
					ScopeType.DocRead,
					ScopeType.DocWrite,
					ScopeType.SummaryWrite,
				]),
			}),
		);
	for (let i = 0; i < limit; i++) {
		// we're not interested in making the requests succeed with 200s, so just assert that not 429
		await sendReq().expect((res) => {
			assert.notStrictEqual(res.status, 429);
		});
	}
	await new Promise((resolve) => process.nextTick(resolve));
	await sendReq().expect((res) => {
		assert.strictEqual(res.status, 429);
	});
};

describe("routes", () => {
	describe("throttling", () => {
		describe("verify blobs endpoints are throttled once throttling limit is exceeded", () => {
			let app: express.Application;
			let superTest: request.SuperTest<request.Test>;
			let getBlobStub: any;
			let createBlobStub: any;

			beforeEach(() => {
				getBlobStub = sinon.stub(RestGitService.prototype, "getBlob").returns(
					Promise.resolve({
						content: "testContent",
						encoding: "testEncoding",
						url: testUrl,
						sha,
						size: 1,
					}),
				);
				createBlobStub = sinon.stub(RestGitService.prototype, "createBlob").returns(
					Promise.resolve({
						url: testUrl,
						sha,
					}),
				);

				const tenantThrottler1 = new TestThrottler(limit);
				const tenantThrottler2 = new TestThrottler(limit);
				const tenantThrottler3 = new TestThrottler(limit);
				const tenantThrottlers = new Map<string, TestThrottler>();
				tenantThrottlers.set(Constants.generalRestCallThrottleIdPrefix, tenantThrottler1);
				tenantThrottlers.set(Constants.createSummaryThrottleIdPrefix, tenantThrottler2);
				tenantThrottlers.set(Constants.getSummaryThrottleIdPrefix, tenantThrottler3);

				const clusterThrottler1 = new TestThrottler(limit);
				const clusterThrottler2 = new TestThrottler(limit);

				const clusterThrottlers = new Map<string, TestThrottler>();
				clusterThrottlers.set(Constants.createSummaryThrottleIdPrefix, clusterThrottler1);
				clusterThrottlers.set(Constants.getSummaryThrottleIdPrefix, clusterThrottler2);

				const documentManager = new TestDocumentManager();
				sinon.stub(documentManager, "readStaticProperties").returns(undefined);
				const startupCheck = new StartupCheck();

				app = historianApp.create(
					defaultProvider,
					defaultTenantService,
					undefined,
					tenantThrottlers,
					clusterThrottlers,
					documentManager,
					startupCheck,
					defaultCache,
				);
				superTest = request(app);
			});

			afterEach(() => {
				getBlobStub.restore();
				createBlobStub.restore();
			});

			describe("/git/blobs", () => {
				it("/ping", async () => {
					await sendRequestsTillThrottledWithAssertion(superTest, "/repos/ping");
				});
				it("/:ignored?/:tenantId/git/blobs", async () => {
					await sendRequestsTillThrottledWithAssertion(
						superTest,
						`/repos/${tenantId}/git/blobs`,
						"post",
					);
				});
				it("/:ignored?/:tenantId/git/blobs/:sha", async () => {
					await sendRequestsTillThrottledWithAssertion(
						superTest,
						`/repos/${tenantId}/git/blobs/${sha}`,
					);
				});
				it("/:ignored?/:tenantId/git/blobs/raw/:sha", async () => {
					await sendRequestsTillThrottledWithAssertion(
						superTest,
						`/repos/${tenantId}/git/blobs/raw/${sha}`,
					);
				});
			});
		});

		describe("verify commits endpoints are throttled once throttling limit is exceeded", () => {
			let app: express.Application;
			let superTest: request.SuperTest<request.Test>;
			let getCommitStub: any;
			let getCommitsStub: any;
			let createCommitStub: any;

			beforeEach(() => {
				getCommitStub = sinon.stub(RestGitService.prototype, "getCommit").returns(
					Promise.resolve({
						sha,
						url: testUrl,
						author: { name: "test", email: "test@domain.com", date: "time" },
						committer: { name: "test", email: "test@domain.com", date: "time" },
						message: "testMessage",
						tree: { url: testUrl, sha },
						parents: [{ url: testUrl, sha }],
					}),
				);
				getCommitsStub = sinon.stub(RestGitService.prototype, "getCommits").returns(
					Promise.resolve([
						{
							url: testUrl,
							sha,
							commit: {
								url: testUrl,
								author: { name: "test", email: "test@domain.com", date: "time" },
								committer: { name: "test", email: "test@domain.com", date: "time" },
								message: "testMessage",
								tree: { url: testUrl, sha },
							},
							parents: [],
						},
					]),
				);
				createCommitStub = sinon.stub(RestGitService.prototype, "createCommit").returns(
					Promise.resolve({
						sha,
						url: testUrl,
						author: { name: "test", email: "test@domain.com", date: "time" },
						committer: { name: "test", email: "test@domain.com", date: "time" },
						message: "testMessage",
						tree: { url: testUrl, sha },
						parents: [{ url: testUrl, sha }],
					}),
				);

				const tenantThrottler1 = new TestThrottler(limit);
				const tenantThrottler2 = new TestThrottler(limit);
				const tenantThrottler3 = new TestThrottler(limit);
				const tenantThrottlers = new Map<string, TestThrottler>();
				tenantThrottlers.set(Constants.generalRestCallThrottleIdPrefix, tenantThrottler1);
				tenantThrottlers.set(Constants.createSummaryThrottleIdPrefix, tenantThrottler2);
				tenantThrottlers.set(Constants.getSummaryThrottleIdPrefix, tenantThrottler3);

				const clusterThrottler1 = new TestThrottler(limit);
				const clusterThrottler2 = new TestThrottler(limit);
				const clusterThrottlers = new Map<string, TestThrottler>();
				clusterThrottlers.set(Constants.createSummaryThrottleIdPrefix, clusterThrottler1);
				clusterThrottlers.set(Constants.getSummaryThrottleIdPrefix, clusterThrottler2);

				const documentManager = new TestDocumentManager();
				sinon.stub(documentManager, "readStaticProperties").returns(undefined);
				const startupCheck = new StartupCheck();

				app = historianApp.create(
					defaultProvider,
					defaultTenantService,
					undefined,
					tenantThrottlers,
					clusterThrottlers,
					documentManager,
					startupCheck,
					defaultCache,
				);
				superTest = request(app);
			});

			afterEach(() => {
				getCommitStub.restore();
				getCommitsStub.restore();
				createCommitStub.restore();
			});

			describe("/git/commits", () => {
				it("/:ignored?/:tenantId/git/commits", async () => {
					await sendRequestsTillThrottledWithAssertion(
						superTest,
						`/repos/${tenantId}/git/commits`,
						"post",
					);
				});
				it("/:ignored?/:tenantId/git/commits/:sha", async () => {
					await sendRequestsTillThrottledWithAssertion(
						superTest,
						`/repos/${tenantId}/git/commits/${sha}`,
					);
				});
			});

			describe("/repo/commits", () => {
				it("/:ignored?/:tenantId/commits", async () => {
					await sendRequestsTillThrottledWithAssertion(
						superTest,
						`/repos/${tenantId}/commits`,
					);
				});
			});
		});

		describe("verify refs endpoints are throttled once throttling limit is exceeded", () => {
			let app: express.Application;
			let superTest: request.SuperTest<request.Test>;
			let getRefStub: any;
			let getRefsStub: any;
			let createRefStub: any;
			let updateRefStub: any;
			let deleteRefStub: any;

			beforeEach(() => {
				getRefStub = sinon.stub(RestGitService.prototype, "getRef").returns(
					Promise.resolve({
						ref: "testRef",
						url: testUrl,
						object: {
							type: "testType",
							sha,
							url: testUrl,
						},
					}),
				);
				getRefsStub = sinon.stub(RestGitService.prototype, "getRefs").returns(
					Promise.resolve([
						{
							ref: "testRef",
							url: testUrl,
							object: {
								type: "testType",
								sha,
								url: testUrl,
							},
						},
					]),
				);
				createRefStub = sinon.stub(RestGitService.prototype, "createRef").returns(
					Promise.resolve({
						ref: "testRef",
						url: testUrl,
						object: {
							type: "testType",
							sha,
							url: testUrl,
						},
					}),
				);
				updateRefStub = sinon.stub(RestGitService.prototype, "updateRef").returns(
					Promise.resolve({
						ref: "testRef",
						url: testUrl,
						object: {
							type: "testType",
							sha,
							url: testUrl,
						},
					}),
				);
				deleteRefStub = sinon
					.stub(RestGitService.prototype, "deleteRef")
					.returns(Promise.resolve());

				const tenantThrottler1 = new TestThrottler(limit);
				const tenantThrottler2 = new TestThrottler(limit);
				const tenantThrottler3 = new TestThrottler(limit);
				const tenantThrottlers = new Map<string, TestThrottler>();
				tenantThrottlers.set(Constants.generalRestCallThrottleIdPrefix, tenantThrottler1);
				tenantThrottlers.set(Constants.createSummaryThrottleIdPrefix, tenantThrottler2);
				tenantThrottlers.set(Constants.getSummaryThrottleIdPrefix, tenantThrottler3);

				const clusterThrottler1 = new TestThrottler(limit);
				const clusterThrottler2 = new TestThrottler(limit);
				const clusterThrottlers = new Map<string, TestThrottler>();
				clusterThrottlers.set(Constants.createSummaryThrottleIdPrefix, clusterThrottler1);
				clusterThrottlers.set(Constants.getSummaryThrottleIdPrefix, clusterThrottler2);

				const documentManager = new TestDocumentManager();
				sinon.stub(documentManager, "readStaticProperties").returns(undefined);
				const startupCheck = new StartupCheck();

				app = historianApp.create(
					defaultProvider,
					defaultTenantService,
					undefined,
					tenantThrottlers,
					clusterThrottlers,
					documentManager,
					startupCheck,
					defaultCache,
				);
				superTest = request(app);
			});

			afterEach(() => {
				getRefStub.restore();
				getRefsStub.restore();
				createRefStub.restore();
				updateRefStub.restore();
				deleteRefStub.restore();
			});

			describe("/git/refs", () => {
				it("/:ignored?/:tenantId/git/refs", async () => {
					await sendRequestsTillThrottledWithAssertion(
						superTest,
						`/repos/${tenantId}/git/refs`,
					);
				});
				it("/:ignored?/:tenantId/git/refs/*", async () => {
					await sendRequestsTillThrottledWithAssertion(
						superTest,
						`/repos/${tenantId}/git/refs/*`,
					);
				});
				it("/:ignored?/:tenantId/git/refs post", async () => {
					await sendRequestsTillThrottledWithAssertion(
						superTest,
						`/repos/${tenantId}/git/refs`,
						"post",
					);
				});
				it("/:ignored?/:tenantId/git/refs/* patch", async () => {
					await sendRequestsTillThrottledWithAssertion(
						superTest,
						`/repos/${tenantId}/git/refs/*`,
						"patch",
					);
				});
				it("/:ignored?/:tenantId/git/refs/* delete", async () => {
					await sendRequestsTillThrottledWithAssertion(
						superTest,
						`/repos/${tenantId}/git/refs/*`,
						"delete",
					);
				});
			});
		});

		describe("verify tags endpoints are throttled once throttling limit is exceeded", () => {
			let app: express.Application;
			let superTest: request.SuperTest<request.Test>;
			let getTagStub: any;
			let createTagStub: any;

			beforeEach(() => {
				getTagStub = sinon.stub(RestGitService.prototype, "getTag").returns(
					Promise.resolve({
						tag: "testTag",
						sha,
						url: testUrl,
						message: "testMessage",
						tagger: { name: "test", email: "test@domain.com", date: "now" },
						object: {
							type: "testType",
							sha,
							url: testUrl,
						},
					}),
				);
				createTagStub = sinon.stub(RestGitService.prototype, "createTag").returns(
					Promise.resolve({
						tag: "testTag",
						sha,
						url: testUrl,
						message: "testMessage",
						tagger: { name: "test", email: "test@domain.com", date: "now" },
						object: {
							type: "testType",
							sha,
							url: testUrl,
						},
					}),
				);

				const tenantThrottler1 = new TestThrottler(limit);
				const tenantThrottler2 = new TestThrottler(limit);
				const tenantThrottler3 = new TestThrottler(limit);
				const tenantThrottlers = new Map<string, TestThrottler>();
				tenantThrottlers.set(Constants.generalRestCallThrottleIdPrefix, tenantThrottler1);
				tenantThrottlers.set(Constants.createSummaryThrottleIdPrefix, tenantThrottler2);
				tenantThrottlers.set(Constants.getSummaryThrottleIdPrefix, tenantThrottler3);

				const clusterThrottler1 = new TestThrottler(limit);
				const clusterThrottler2 = new TestThrottler(limit);
				const clusterThrottlers = new Map<string, TestThrottler>();
				clusterThrottlers.set(Constants.createSummaryThrottleIdPrefix, clusterThrottler1);
				clusterThrottlers.set(Constants.getSummaryThrottleIdPrefix, clusterThrottler2);

				const documentManager = new TestDocumentManager();
				sinon.stub(documentManager, "readStaticProperties").returns(undefined);
				const startupCheck = new StartupCheck();

				app = historianApp.create(
					defaultProvider,
					defaultTenantService,
					undefined,
					tenantThrottlers,
					clusterThrottlers,
					documentManager,
					startupCheck,
					defaultCache,
				);
				superTest = request(app);
			});

			afterEach(() => {
				getTagStub.restore();
				createTagStub.restore();
			});

			describe("/git/tags", () => {
				it("/:ignored?/:tenantId/git/tags", async () => {
					await sendRequestsTillThrottledWithAssertion(
						superTest,
						`/repos/${tenantId}/git/tags`,
						"post",
					);
				});
				it("/:ignored?/:tenantId/git/tags/*", async () => {
					await sendRequestsTillThrottledWithAssertion(
						superTest,
						`/repos/${tenantId}/git/tags/*`,
					);
				});
			});
		});

		describe("verify trees endpoints are throttled once throttling limit is exceeded", () => {
			let app: express.Application;
			let superTest: request.SuperTest<request.Test>;
			let getTreeStub: any;
			let createTreeStub: any;

			beforeEach(() => {
				getTreeStub = sinon.stub(RestGitService.prototype, "getTree").returns(
					Promise.resolve({
						sha,
						url: testUrl,
						tree: [],
					}),
				);
				createTreeStub = sinon.stub(RestGitService.prototype, "createTree").returns(
					Promise.resolve({
						sha,
						url: testUrl,
						tree: [],
					}),
				);

				const tenantThrottler1 = new TestThrottler(limit);
				const tenantThrottler2 = new TestThrottler(limit);
				const tenantThrottler3 = new TestThrottler(limit);
				const tenantThrottlers = new Map<string, TestThrottler>();
				tenantThrottlers.set(Constants.generalRestCallThrottleIdPrefix, tenantThrottler1);
				tenantThrottlers.set(Constants.createSummaryThrottleIdPrefix, tenantThrottler2);
				tenantThrottlers.set(Constants.getSummaryThrottleIdPrefix, tenantThrottler3);

				const clusterThrottler1 = new TestThrottler(limit);
				const clusterThrottler2 = new TestThrottler(limit);
				const clusterThrottlers = new Map<string, TestThrottler>();
				clusterThrottlers.set(Constants.createSummaryThrottleIdPrefix, clusterThrottler1);
				clusterThrottlers.set(Constants.getSummaryThrottleIdPrefix, clusterThrottler2);

				const documentManager = new TestDocumentManager();
				sinon.stub(documentManager, "readStaticProperties").returns(undefined);
				const startupCheck = new StartupCheck();

				app = historianApp.create(
					defaultProvider,
					defaultTenantService,
					undefined,
					tenantThrottlers,
					clusterThrottlers,
					documentManager,
					startupCheck,
					defaultCache,
				);
				superTest = request(app);
			});

			afterEach(() => {
				getTreeStub.restore();
				createTreeStub.restore();
			});

			describe("/git/trees", () => {
				it("/:ignored?/:tenantId/git/trees", async () => {
					await sendRequestsTillThrottledWithAssertion(
						superTest,
						`/repos/${tenantId}/git/trees`,
						"post",
					);
				});
				it("/:ignored?/:tenantId/git/tags/:sha", async () => {
					await sendRequestsTillThrottledWithAssertion(
						superTest,
						`/repos/${tenantId}/git/trees/${sha}`,
					);
				});
			});
		});

		describe("verify contents endpoints are throttled once throttling limit is exceeded", () => {
			let app: express.Application;
			let superTest: request.SuperTest<request.Test>;
			let getContentStub: any;

			beforeEach(() => {
				getContentStub = sinon.stub(RestGitService.prototype, "getContent").returns(
					Promise.resolve({
						sha,
						url: testUrl,
						tree: [],
					}),
				);

				const tenantThrottler1 = new TestThrottler(limit);
				const tenantThrottler2 = new TestThrottler(limit);
				const tenantThrottler3 = new TestThrottler(limit);
				const tenantThrottlers = new Map<string, TestThrottler>();
				tenantThrottlers.set(Constants.generalRestCallThrottleIdPrefix, tenantThrottler1);
				tenantThrottlers.set(Constants.createSummaryThrottleIdPrefix, tenantThrottler2);
				tenantThrottlers.set(Constants.getSummaryThrottleIdPrefix, tenantThrottler3);

				const clusterThrottler1 = new TestThrottler(limit);
				const clusterThrottler2 = new TestThrottler(limit);
				const clusterThrottlers = new Map<string, TestThrottler>();
				clusterThrottlers.set(Constants.createSummaryThrottleIdPrefix, clusterThrottler1);
				clusterThrottlers.set(Constants.getSummaryThrottleIdPrefix, clusterThrottler2);

				const documentManager = new TestDocumentManager();
				sinon.stub(documentManager, "readStaticProperties").returns(undefined);
				const startupCheck = new StartupCheck();

				app = historianApp.create(
					defaultProvider,
					defaultTenantService,
					undefined,
					tenantThrottlers,
					clusterThrottlers,
					documentManager,
					startupCheck,
					defaultCache,
				);
				superTest = request(app);
			});

			afterEach(() => {
				getContentStub.restore();
			});

			describe("/repo/contents", () => {
				it("/:ignored?/:tenantId/contents/*", async () => {
					await sendRequestsTillThrottledWithAssertion(
						superTest,
						`/repos/${tenantId}/contents/*`,
					);
				});
			});
		});

		describe("verify trees endpoints are throttled once throttling limit is exceeded", () => {
			let app: express.Application;
			let superTest: request.SuperTest<request.Test>;
			let getHeaderStub: any;
			let getTreeStub: any;

			beforeEach(() => {
				getHeaderStub = sinon.stub(RestGitService.prototype, "getHeader").returns(
					Promise.resolve({
						tree: { sha, url: testUrl, tree: [] },
						blobs: [],
					}),
				);
				getTreeStub = sinon.stub(RestGitService.prototype, "getFullTree").returns(
					Promise.resolve({
						sha,
						url: testUrl,
						tree: [],
					}),
				);

				const tenantThrottler1 = new TestThrottler(limit);
				const tenantThrottler2 = new TestThrottler(limit);
				const tenantThrottler3 = new TestThrottler(limit);
				const tenantThrottlers = new Map<string, TestThrottler>();
				tenantThrottlers.set(Constants.generalRestCallThrottleIdPrefix, tenantThrottler1);
				tenantThrottlers.set(Constants.createSummaryThrottleIdPrefix, tenantThrottler2);
				tenantThrottlers.set(Constants.getSummaryThrottleIdPrefix, tenantThrottler3);

				const clusterThrottler1 = new TestThrottler(limit);
				const clusterThrottler2 = new TestThrottler(limit);
				const clusterThrottlers = new Map<string, TestThrottler>();
				clusterThrottlers.set(Constants.createSummaryThrottleIdPrefix, clusterThrottler1);
				clusterThrottlers.set(Constants.getSummaryThrottleIdPrefix, clusterThrottler2);

				const documentManager = new TestDocumentManager();
				sinon.stub(documentManager, "readStaticProperties").returns(undefined);
				const startupCheck = new StartupCheck();

				app = historianApp.create(
					defaultProvider,
					defaultTenantService,
					undefined,
					tenantThrottlers,
					clusterThrottlers,
					documentManager,
					startupCheck,
					defaultCache,
				);
				superTest = request(app);
			});

			afterEach(() => {
				getHeaderStub.restore();
				getTreeStub.restore();
			});

			describe("/repo/headers", () => {
				it("/:ignored?/:tenantId/headers/:sha", async () => {
					await sendRequestsTillThrottledWithAssertion(
						superTest,
						`/repos/${tenantId}/headers/${sha}`,
					);
				});
				it("/:ignored?/:tenantId/tree/:sha", async () => {
					await sendRequestsTillThrottledWithAssertion(
						superTest,
						`/repos/${tenantId}/tree/${sha}`,
					);
				});
			});
		});
	});

	describe("CorrelationId", () => {
		const correlationIdHeaderName = "x-correlation-id";
		const testCorrelationId = "test-correlation-id";
		const maxThrottlerLimit = 1000000;

		let app: express.Application;
		let superTest: request.SuperTest<request.Test>;

		const assertCorrelationId = async (
			url: string,
			method: "get" | "post" | "put" | "patch" | "delete" = "get",
		): Promise<void> => {
			await superTest[method](url)
				.set(correlationIdHeaderName, testCorrelationId)
				.then((res) => {
					assert.strictEqual(res.headers?.[correlationIdHeaderName], testCorrelationId);
				});
		};

		describe("verify blobs endpoints pass and store correlation id and add in response header", () => {
			let getBlobStub: any;
			let createBlobStub: any;

			beforeEach(() => {
				getBlobStub = sinon.stub(RestGitService.prototype, "getBlob").returns(
					Promise.resolve({
						content: "testContent",
						encoding: "testEncoding",
						url: testUrl,
						sha,
						size: 1,
					}),
				);
				createBlobStub = sinon.stub(RestGitService.prototype, "createBlob").returns(
					Promise.resolve({
						url: testUrl,
						sha,
					}),
				);

				const tenantThrottler1 = new TestThrottler(limit);
				const tenantThrottler2 = new TestThrottler(limit);
				const tenantThrottler3 = new TestThrottler(limit);
				const tenantThrottlers = new Map<string, TestThrottler>();
				tenantThrottlers.set(Constants.generalRestCallThrottleIdPrefix, tenantThrottler1);
				tenantThrottlers.set(Constants.createSummaryThrottleIdPrefix, tenantThrottler2);
				tenantThrottlers.set(Constants.getSummaryThrottleIdPrefix, tenantThrottler3);

				const clusterThrottler1 = new TestThrottler(maxThrottlerLimit);
				const clusterThrottler2 = new TestThrottler(maxThrottlerLimit);
				const clusterThrottlers = new Map<string, TestThrottler>();
				clusterThrottlers.set(Constants.createSummaryThrottleIdPrefix, clusterThrottler1);
				clusterThrottlers.set(Constants.getSummaryThrottleIdPrefix, clusterThrottler2);

				const documentManager = new TestDocumentManager();
				sinon.stub(documentManager, "readStaticProperties").returns(undefined);
				const startupCheck = new StartupCheck();

				app = historianApp.create(
					defaultProvider,
					defaultTenantService,
					undefined,
					tenantThrottlers,
					clusterThrottlers,
					documentManager,
					startupCheck,
					defaultCache,
				);
				superTest = request(app);
			});

			afterEach(() => {
				getBlobStub.restore();
				createBlobStub.restore();
			});

			describe("/git/blobs", () => {
				it("/ping", async () => {
					await assertCorrelationId("/repos/ping");
				});
				it("/:ignored?/:tenantId/git/blobs", async () => {
					await assertCorrelationId(`/repos/${tenantId}/git/blobs`, "post");
				});
				it("/:ignored?/:tenantId/git/blobs/:sha", async () => {
					await assertCorrelationId(`/repos/${tenantId}/git/blobs/${sha}`);
				});
				it("/:ignored?/:tenantId/git/blobs/raw/:sha", async () => {
					await assertCorrelationId(`/repos/${tenantId}/git/blobs/raw/${sha}`);
				});
			});
		});

		describe("verify commits endpoints pass and store correlation id and add in response header", () => {
			let getCommitStub: any;
			let getCommitsStub: any;
			let createCommitStub: any;

			beforeEach(() => {
				getCommitStub = sinon.stub(RestGitService.prototype, "getCommit").returns(
					Promise.resolve({
						sha,
						url: testUrl,
						author: { name: "test", email: "test@domain.com", date: "time" },
						committer: { name: "test", email: "test@domain.com", date: "time" },
						message: "testMessage",
						tree: { url: testUrl, sha },
						parents: [{ url: testUrl, sha }],
					}),
				);
				getCommitsStub = sinon.stub(RestGitService.prototype, "getCommits").returns(
					Promise.resolve([
						{
							url: testUrl,
							sha,
							commit: {
								url: testUrl,
								author: { name: "test", email: "test@domain.com", date: "time" },
								committer: { name: "test", email: "test@domain.com", date: "time" },
								message: "testMessage",
								tree: { url: testUrl, sha },
							},
							parents: [],
						},
					]),
				);
				createCommitStub = sinon.stub(RestGitService.prototype, "createCommit").returns(
					Promise.resolve({
						sha,
						url: testUrl,
						author: { name: "test", email: "test@domain.com", date: "time" },
						committer: { name: "test", email: "test@domain.com", date: "time" },
						message: "testMessage",
						tree: { url: testUrl, sha },
						parents: [{ url: testUrl, sha }],
					}),
				);

				const tenantThrottler1 = new TestThrottler(limit);
				const tenantThrottler2 = new TestThrottler(limit);
				const tenantThrottler3 = new TestThrottler(limit);
				const tenantThrottlers = new Map<string, TestThrottler>();
				tenantThrottlers.set(Constants.generalRestCallThrottleIdPrefix, tenantThrottler1);
				tenantThrottlers.set(Constants.createSummaryThrottleIdPrefix, tenantThrottler2);
				tenantThrottlers.set(Constants.getSummaryThrottleIdPrefix, tenantThrottler3);

				const clusterThrottler1 = new TestThrottler(maxThrottlerLimit);
				const clusterThrottler2 = new TestThrottler(maxThrottlerLimit);
				const clusterThrottlers = new Map<string, TestThrottler>();
				clusterThrottlers.set(Constants.createSummaryThrottleIdPrefix, clusterThrottler1);
				clusterThrottlers.set(Constants.getSummaryThrottleIdPrefix, clusterThrottler2);

				const documentManager = new TestDocumentManager();
				sinon.stub(documentManager, "readStaticProperties").returns(undefined);
				const startupCheck = new StartupCheck();

				app = historianApp.create(
					defaultProvider,
					defaultTenantService,
					undefined,
					tenantThrottlers,
					clusterThrottlers,
					documentManager,
					startupCheck,
					defaultCache,
				);
				superTest = request(app);
			});

			afterEach(() => {
				getCommitStub.restore();
				getCommitsStub.restore();
				createCommitStub.restore();
			});

			describe("/git/commits", () => {
				it("/:ignored?/:tenantId/git/commits", async () => {
					await assertCorrelationId(`/repos/${tenantId}/git/commits`, "post");
				});
				it("/:ignored?/:tenantId/git/commits/:sha", async () => {
					await assertCorrelationId(`/repos/${tenantId}/git/commits/${sha}`);
				});
			});

			describe("/repo/commits", () => {
				it("/:ignored?/:tenantId/commits", async () => {
					await assertCorrelationId(`/repos/${tenantId}/commits`);
				});
			});
		});

		describe("verify refs endpoints pass and store correlation id and add in response header", () => {
			let getRefStub: any;
			let getRefsStub: any;
			let createRefStub: any;
			let updateRefStub: any;
			let deleteRefStub: any;

			beforeEach(() => {
				getRefStub = sinon.stub(RestGitService.prototype, "getRef").returns(
					Promise.resolve({
						ref: "testRef",
						url: testUrl,
						object: {
							type: "testType",
							sha,
							url: testUrl,
						},
					}),
				);
				getRefsStub = sinon.stub(RestGitService.prototype, "getRefs").returns(
					Promise.resolve([
						{
							ref: "testRef",
							url: testUrl,
							object: {
								type: "testType",
								sha,
								url: testUrl,
							},
						},
					]),
				);
				createRefStub = sinon.stub(RestGitService.prototype, "createRef").returns(
					Promise.resolve({
						ref: "testRef",
						url: testUrl,
						object: {
							type: "testType",
							sha,
							url: testUrl,
						},
					}),
				);
				updateRefStub = sinon.stub(RestGitService.prototype, "updateRef").returns(
					Promise.resolve({
						ref: "testRef",
						url: testUrl,
						object: {
							type: "testType",
							sha,
							url: testUrl,
						},
					}),
				);
				deleteRefStub = sinon
					.stub(RestGitService.prototype, "deleteRef")
					.returns(Promise.resolve());

				const tenantThrottler1 = new TestThrottler(limit);
				const tenantThrottler2 = new TestThrottler(limit);
				const tenantThrottler3 = new TestThrottler(limit);
				const tenantThrottlers = new Map<string, TestThrottler>();
				tenantThrottlers.set(Constants.generalRestCallThrottleIdPrefix, tenantThrottler1);
				tenantThrottlers.set(Constants.createSummaryThrottleIdPrefix, tenantThrottler2);
				tenantThrottlers.set(Constants.getSummaryThrottleIdPrefix, tenantThrottler3);

				const clusterThrottler1 = new TestThrottler(maxThrottlerLimit);
				const clusterThrottler2 = new TestThrottler(maxThrottlerLimit);
				const clusterThrottlers = new Map<string, TestThrottler>();
				clusterThrottlers.set(Constants.createSummaryThrottleIdPrefix, clusterThrottler1);
				clusterThrottlers.set(Constants.getSummaryThrottleIdPrefix, clusterThrottler2);

				const documentManager = new TestDocumentManager();
				sinon.stub(documentManager, "readStaticProperties").returns(undefined);
				const startupCheck = new StartupCheck();

				app = historianApp.create(
					defaultProvider,
					defaultTenantService,
					undefined,
					tenantThrottlers,
					clusterThrottlers,
					documentManager,
					startupCheck,
					defaultCache,
				);
				superTest = request(app);
			});

			afterEach(() => {
				getRefStub.restore();
				getRefsStub.restore();
				createRefStub.restore();
				updateRefStub.restore();
				deleteRefStub.restore();
			});

			describe("/git/refs", () => {
				it("/:ignored?/:tenantId/git/refs", async () => {
					await assertCorrelationId(`/repos/${tenantId}/git/refs`);
				});
				it("/:ignored?/:tenantId/git/refs/*", async () => {
					await assertCorrelationId(`/repos/${tenantId}/git/refs/*`);
				});
				it("/:ignored?/:tenantId/git/refs post", async () => {
					await assertCorrelationId(`/repos/${tenantId}/git/refs`, "post");
				});
				it("/:ignored?/:tenantId/git/refs/* patch", async () => {
					await assertCorrelationId(`/repos/${tenantId}/git/refs/*`, "patch");
				});
				it("/:ignored?/:tenantId/git/refs/* delete", async () => {
					await assertCorrelationId(`/repos/${tenantId}/git/refs/*`, "delete");
				});
			});
		});

		describe("verify tags endpoints pass and store correlation id and add in response header", () => {
			let getTagStub: any;
			let createTagStub: any;

			beforeEach(() => {
				getTagStub = sinon.stub(RestGitService.prototype, "getTag").returns(
					Promise.resolve({
						tag: "testTag",
						sha,
						url: testUrl,
						message: "testMessage",
						tagger: { name: "test", email: "test@domain.com", date: "now" },
						object: {
							type: "testType",
							sha,
							url: testUrl,
						},
					}),
				);
				createTagStub = sinon.stub(RestGitService.prototype, "createTag").returns(
					Promise.resolve({
						tag: "testTag",
						sha,
						url: testUrl,
						message: "testMessage",
						tagger: { name: "test", email: "test@domain.com", date: "now" },
						object: {
							type: "testType",
							sha,
							url: testUrl,
						},
					}),
				);

				const tenantThrottler1 = new TestThrottler(limit);
				const tenantThrottler2 = new TestThrottler(limit);
				const tenantThrottler3 = new TestThrottler(limit);
				const tenantThrottlers = new Map<string, TestThrottler>();
				tenantThrottlers.set(Constants.generalRestCallThrottleIdPrefix, tenantThrottler1);
				tenantThrottlers.set(Constants.createSummaryThrottleIdPrefix, tenantThrottler2);
				tenantThrottlers.set(Constants.getSummaryThrottleIdPrefix, tenantThrottler3);

				const clusterThrottler1 = new TestThrottler(maxThrottlerLimit);
				const clusterThrottler2 = new TestThrottler(maxThrottlerLimit);
				const clusterThrottlers = new Map<string, TestThrottler>();
				clusterThrottlers.set(Constants.createSummaryThrottleIdPrefix, clusterThrottler1);
				clusterThrottlers.set(Constants.getSummaryThrottleIdPrefix, clusterThrottler2);

				const documentManager = new TestDocumentManager();
				sinon.stub(documentManager, "readStaticProperties").returns(undefined);
				const startupCheck = new StartupCheck();

				app = historianApp.create(
					defaultProvider,
					defaultTenantService,
					undefined,
					tenantThrottlers,
					clusterThrottlers,
					documentManager,
					startupCheck,
					defaultCache,
				);
				superTest = request(app);
			});

			afterEach(() => {
				getTagStub.restore();
				createTagStub.restore();
			});

			describe("/git/tags", () => {
				it("/:ignored?/:tenantId/git/tags", async () => {
					await assertCorrelationId(`/repos/${tenantId}/git/tags`, "post");
				});
				it("/:ignored?/:tenantId/git/tags/*", async () => {
					await assertCorrelationId(`/repos/${tenantId}/git/tags/*`);
				});
			});
		});

		describe("verify trees endpoints pass and store correlation id and add in response header", () => {
			let getTreeStub: any;
			let createTreeStub: any;

			beforeEach(() => {
				getTreeStub = sinon.stub(RestGitService.prototype, "getTree").returns(
					Promise.resolve({
						sha,
						url: testUrl,
						tree: [],
					}),
				);
				createTreeStub = sinon.stub(RestGitService.prototype, "createTree").returns(
					Promise.resolve({
						sha,
						url: testUrl,
						tree: [],
					}),
				);

				const tenantThrottler1 = new TestThrottler(limit);
				const tenantThrottler2 = new TestThrottler(limit);
				const tenantThrottler3 = new TestThrottler(limit);
				const tenantThrottlers = new Map<string, TestThrottler>();
				tenantThrottlers.set(Constants.generalRestCallThrottleIdPrefix, tenantThrottler1);
				tenantThrottlers.set(Constants.createSummaryThrottleIdPrefix, tenantThrottler2);
				tenantThrottlers.set(Constants.getSummaryThrottleIdPrefix, tenantThrottler3);

				const clusterThrottler1 = new TestThrottler(maxThrottlerLimit);
				const clusterThrottler2 = new TestThrottler(maxThrottlerLimit);
				const clusterThrottlers = new Map<string, TestThrottler>();
				clusterThrottlers.set(Constants.createSummaryThrottleIdPrefix, clusterThrottler1);
				clusterThrottlers.set(Constants.getSummaryThrottleIdPrefix, clusterThrottler2);

				const documentManager = new TestDocumentManager();
				sinon.stub(documentManager, "readStaticProperties").returns(undefined);
				const startupCheck = new StartupCheck();

				app = historianApp.create(
					defaultProvider,
					defaultTenantService,
					undefined,
					tenantThrottlers,
					clusterThrottlers,
					documentManager,
					startupCheck,
					defaultCache,
				);
				superTest = request(app);
			});

			afterEach(() => {
				getTreeStub.restore();
				createTreeStub.restore();
			});

			describe("/git/trees", () => {
				it("/:ignored?/:tenantId/git/trees", async () => {
					await assertCorrelationId(`/repos/${tenantId}/git/trees`, "post");
				});
				it("/:ignored?/:tenantId/git/tags/:sha", async () => {
					await assertCorrelationId(`/repos/${tenantId}/git/trees/${sha}`);
				});
			});
		});

		describe("verify contents endpoints pass and store correlation id and add in response header", () => {
			let getContentStub: any;

			beforeEach(() => {
				getContentStub = sinon.stub(RestGitService.prototype, "getContent").returns(
					Promise.resolve({
						sha,
						url: testUrl,
						tree: [],
					}),
				);

				const tenantThrottler1 = new TestThrottler(limit);
				const tenantThrottler2 = new TestThrottler(limit);
				const tenantThrottler3 = new TestThrottler(limit);
				const tenantThrottlers = new Map<string, TestThrottler>();
				tenantThrottlers.set(Constants.generalRestCallThrottleIdPrefix, tenantThrottler1);
				tenantThrottlers.set(Constants.createSummaryThrottleIdPrefix, tenantThrottler2);
				tenantThrottlers.set(Constants.getSummaryThrottleIdPrefix, tenantThrottler3);

				const clusterThrottler1 = new TestThrottler(maxThrottlerLimit);
				const clusterThrottler2 = new TestThrottler(maxThrottlerLimit);
				const clusterThrottlers = new Map<string, TestThrottler>();
				clusterThrottlers.set(Constants.createSummaryThrottleIdPrefix, clusterThrottler1);
				clusterThrottlers.set(Constants.getSummaryThrottleIdPrefix, clusterThrottler2);

				const documentManager = new TestDocumentManager();
				sinon.stub(documentManager, "readStaticProperties").returns(undefined);
				const startupCheck = new StartupCheck();

				app = historianApp.create(
					defaultProvider,
					defaultTenantService,
					undefined,
					tenantThrottlers,
					clusterThrottlers,
					documentManager,
					startupCheck,
					defaultCache,
				);
				superTest = request(app);
			});

			afterEach(() => {
				getContentStub.restore();
			});

			describe("/repo/contents", () => {
				it("/:ignored?/:tenantId/contents/*", async () => {
					await assertCorrelationId(`/repos/${tenantId}/contents/*`);
				});
			});
		});

		describe("verify trees endpoints pass and store correlation id and add in response header", () => {
			let getHeaderStub: any;
			let getTreeStub: any;

			beforeEach(() => {
				getHeaderStub = sinon.stub(RestGitService.prototype, "getHeader").returns(
					Promise.resolve({
						tree: { sha, url: testUrl, tree: [] },
						blobs: [],
					}),
				);
				getTreeStub = sinon.stub(RestGitService.prototype, "getFullTree").returns(
					Promise.resolve({
						sha,
						url: testUrl,
						tree: [],
					}),
				);

				const tenantThrottler1 = new TestThrottler(limit);
				const tenantThrottler2 = new TestThrottler(limit);
				const tenantThrottler3 = new TestThrottler(limit);
				const tenantThrottlers = new Map<string, TestThrottler>();
				tenantThrottlers.set(Constants.generalRestCallThrottleIdPrefix, tenantThrottler1);
				tenantThrottlers.set(Constants.createSummaryThrottleIdPrefix, tenantThrottler2);
				tenantThrottlers.set(Constants.getSummaryThrottleIdPrefix, tenantThrottler3);

				const clusterThrottler1 = new TestThrottler(maxThrottlerLimit);
				const clusterThrottler2 = new TestThrottler(maxThrottlerLimit);
				const clusterThrottlers = new Map<string, TestThrottler>();
				clusterThrottlers.set(Constants.createSummaryThrottleIdPrefix, clusterThrottler1);
				clusterThrottlers.set(Constants.getSummaryThrottleIdPrefix, clusterThrottler2);

				const documentManager = new TestDocumentManager();
				sinon.stub(documentManager, "readStaticProperties").returns(undefined);
				const startupCheck = new StartupCheck();

				app = historianApp.create(
					defaultProvider,
					defaultTenantService,
					undefined,
					tenantThrottlers,
					clusterThrottlers,
					documentManager,
					startupCheck,
					defaultCache,
				);
				superTest = request(app);
			});

			afterEach(() => {
				getHeaderStub.restore();
				getTreeStub.restore();
			});

			describe("/repo/headers", () => {
				it("/:ignored?/:tenantId/headers/:sha", async () => {
					await assertCorrelationId(`/repos/${tenantId}/headers/${sha}`);
				});
				it("/:ignored?/:tenantId/tree/:sha", async () => {
					await assertCorrelationId(`/repos/${tenantId}/tree/${sha}`);
				});
			});
		});
	});
});

describe("summary ownership routes", () => {
	const sandbox = sinon.createSandbox();
	const authorization = getAuthorizationTokenFromCredentials({
		user: tenantId,
		password: generateToken(tenantId, documentId, tenantKey, [
			ScopeType.DocRead,
			ScopeType.DocWrite,
			ScopeType.SummaryWrite,
		]),
	});
	const activeDocument = {
		version: "1.0",
		createTime: Date.now(),
		documentId,
		tenantId,
		session: {
			ordererUrl: "http://orderer",
			deltaStreamUrl: "http://delta",
			historianUrl: "http://historian",
			isSessionAlive: false,
			isSessionActive: false,
		},
		scribe: "",
		deli: "",
		storageName: "document-storage",
		isEphemeralContainer: false,
	};
	let documentManager: TestDocumentManager;
	let cache: TestCache;
	let readStaticProperties: sinon.SinonStub;
	let storageNameRetrieverGet: sinon.SinonStub;
	let superTest: request.SuperTest<request.Test>;

	beforeEach(() => {
		configureGlobalTelemetryContext();
		documentManager = new TestDocumentManager();
		cache = new TestCache();
		readStaticProperties = sandbox
			.stub(documentManager, "readStaticProperties")
			.resolves(activeDocument);
		storageNameRetrieverGet = sandbox.stub().resolves("legacy-storage");
		const throttlers = new Map<string, TestThrottler>([
			[Constants.generalRestCallThrottleIdPrefix, new TestThrottler(1000)],
			[Constants.createSummaryThrottleIdPrefix, new TestThrottler(1000)],
			[Constants.getSummaryThrottleIdPrefix, new TestThrottler(1000)],
		]);
		const clusterThrottlers = new Map<string, TestThrottler>([
			[Constants.createSummaryThrottleIdPrefix, new TestThrottler(1000)],
			[Constants.getSummaryThrottleIdPrefix, new TestThrottler(1000)],
		]);
		superTest = request(
			historianApp.create(
				defaultProvider,
				defaultTenantService,
				{ get: storageNameRetrieverGet },
				throttlers,
				clusterThrottlers,
				documentManager,
				new StartupCheck(),
				cache,
				undefined,
				undefined,
				24 * 60 * 60,
			),
		);
	});

	afterEach(() => sandbox.restore());

	it("denies attacker tenant latest and SHA before cache or GitRest", async () => {
		const readDocument = sandbox.stub(documentManager, "readDocument").resolves({
			...activeDocument,
			tenantId: "victim-tenant",
		});
		const cacheGet = sandbox.spy(cache, "get");
		const getSummary = sandbox.stub(RestGitService.prototype, "getSummary");
		const getTenant = sandbox.spy(defaultTenantService, "getTenant");

		await superTest
			.get(`/repos/${tenantId}/git/summaries/latest`)
			.set("Authorization", authorization)
			.expect(404);
		await superTest
			.get(`/repos/${tenantId}/git/summaries/${sha}`)
			.set("Authorization", authorization)
			.expect(404);

		sinon.assert.calledTwice(readDocument);
		sinon.assert.notCalled(cacheGet);
		sinon.assert.notCalled(getSummary);
		sinon.assert.notCalled(getTenant);
	});

	it("allows same-tenant latest and SHA after fresh validation", async () => {
		const readDocument = sandbox.stub(documentManager, "readDocument").resolves(activeDocument);
		const info = sandbox.spy(Lumberjack, "info");
		const getSummary = sandbox.stub(RestGitService.prototype, "getSummary").resolves({
			id: sha,
			trees: [],
			blobs: [],
		});

		await superTest
			.get(`/repos/${tenantId}/git/summaries/latest`)
			.set("Authorization", authorization)
			.set("x-correlation-id", "summary-ownership-correlation")
			.expect(200);
		await superTest
			.get(`/repos/${tenantId}/git/summaries/${sha}`)
			.set("Authorization", authorization)
			.set("x-correlation-id", "summary-ownership-correlation")
			.expect(200);

		assert.deepStrictEqual(getSummary.firstCall.args, ["latest", true]);
		assert.deepStrictEqual(getSummary.secondCall.args, [sha, true]);
		assert.ok(readDocument.firstCall.calledBefore(getSummary.firstCall));
		assert.ok(readDocument.secondCall.calledBefore(getSummary.secondCall));
		sinon.assert.calledWithMatch(
			info,
			"HistorianSummaryDocumentOwnershipValidation",
			sinon.match({
				correlationId: "summary-ownership-correlation",
				tenantId,
				documentId,
				operation: "get",
				routeType: "latest",
				outcome: "allowed",
			}),
		);
		sinon.assert.calledWithMatch(
			info,
			"HistorianSummaryDocumentOwnershipValidation",
			sinon.match({
				correlationId: "summary-ownership-correlation",
				tenantId,
				documentId,
				operation: "get",
				routeType: "sha",
				outcome: "allowed",
			}),
		);
	});

	it("preserves legacy storage routing after fresh validation", async () => {
		const readDocument = sandbox.stub(documentManager, "readDocument").resolves(activeDocument);
		const getSummary = sandbox.stub(RestGitService.prototype, "getSummary").resolves({
			id: sha,
			trees: [],
			blobs: [],
		});

		await superTest
			.get(`/repos/${tenantId}/git/summaries/latest`)
			.set("Authorization", authorization)
			.expect(200);

		sinon.assert.calledOnceWithExactly(readDocument, tenantId, documentId);
		sinon.assert.calledOnceWithExactly(readStaticProperties, tenantId, documentId);
		sinon.assert.calledOnceWithExactly(storageNameRetrieverGet, tenantId, documentId);
		assert.ok(readDocument.calledBefore(readStaticProperties));
		assert.ok(readStaticProperties.calledBefore(getSummary));
	});

	it("cannot serve cached latest after scheduled deletion", async () => {
		await cache.set(`${tenantId}:${documentId}:summary:container`, {
			id: "cached-victim-summary",
			trees: [],
			blobs: [],
		});
		sandbox.stub(documentManager, "readDocument").resolves({
			...activeDocument,
			scheduledDeletionTime: "2026-07-31T18:00:00.000Z",
		});
		const getSummary = sandbox.stub(RestGitService.prototype, "getSummary");

		await superTest
			.get(`/repos/${tenantId}/git/summaries/latest`)
			.set("Authorization", authorization)
			.expect(404);

		sinon.assert.notCalled(getSummary);
	});

	it("requires ownership before hard or soft DELETE reaches cache invalidation or GitRest", async () => {
		const readDocument = sandbox.stub(documentManager, "readDocument").resolves(null);
		const cacheDelete = sandbox.spy(cache, "delete");
		const deleteSummary = sandbox.stub(RestGitService.prototype, "deleteSummary");

		await superTest
			.delete(`/repos/${tenantId}/git/summaries`)
			.set("Authorization", authorization)
			.set("Soft-Delete", "false")
			.expect(404);
		await superTest
			.delete(`/repos/${tenantId}/git/summaries`)
			.set("Authorization", authorization)
			.set("Soft-Delete", "true")
			.expect(404);

		sinon.assert.calledTwice(readDocument);
		sinon.assert.notCalled(cacheDelete);
		sinon.assert.notCalled(deleteSummary);
	});

	it("requires ownership for non-initial POST and ignores caller routing metadata", async () => {
		sandbox.stub(documentManager, "readDocument").resolves(null);
		const createSummary = sandbox.stub(RestGitService.prototype, "createSummary");

		await superTest
			.post(`/repos/${tenantId}/git/summaries`)
			.query({ initial: "false" })
			.set("Authorization", authorization)
			.set("StorageName", "attacker-storage")
			.set(Constants.IsEphemeralContainer, "true")
			.send({ type: "container", trees: [], blobs: [] })
			.expect(404);

		sinon.assert.notCalled(createSummary);
	});

	it("requires ownership for POST when initial is omitted", async () => {
		sandbox.stub(documentManager, "readDocument").resolves(null);
		const createSummary = sandbox.stub(RestGitService.prototype, "createSummary");

		await superTest
			.post(`/repos/${tenantId}/git/summaries`)
			.set("Authorization", authorization)
			.send({ type: "container", trees: [], blobs: [] })
			.expect(404);

		sinon.assert.notCalled(createSummary);
	});

	it("permits initial upload only after a fresh missing-document result", async () => {
		const events: string[] = [];
		const readDocument = sandbox.stub(documentManager, "readDocument").callsFake(async () => {
			events.push("readDocument");
			return null;
		});
		const info = sandbox.spy(Lumberjack, "info");
		const createSummary = sandbox
			.stub(RestGitService.prototype, "createSummary")
			.callsFake(async () => {
				events.push("createSummary");
				return { id: sha };
			});

		await superTest
			.post(`/repos/${tenantId}/git/summaries`)
			.query({ initial: "true" })
			.set("Authorization", authorization)
			.set("x-correlation-id", "initial-exemption-correlation")
			.set("StorageName", "initial-storage")
			.set(Constants.IsEphemeralContainer, "true")
			.send({ type: "container", trees: [], blobs: [] })
			.expect(201);

		sinon.assert.calledOnceWithExactly(readDocument, tenantId, documentId);
		sinon.assert.calledOnce(createSummary);
		assert.deepStrictEqual(events, ["readDocument", "createSummary"]);
		sinon.assert.calledWithMatch(
			info,
			"HistorianInitialSummaryUploadExemption",
			sinon.match({
				correlationId: "initial-exemption-correlation",
				tenantId,
				documentId,
				operation: "post",
				routeType: "notApplicable",
				outcome: "exempted",
			}),
		);
	});

	it("allows a normal summary after initial creation while denying a cross-tenant document", async () => {
		let document: IDocument | null = null;
		const readDocument = sandbox
			.stub(documentManager, "readDocument")
			.callsFake(async () => document);
		const createSummary = sandbox
			.stub(RestGitService.prototype, "createSummary")
			.resolves({ id: sha });

		await superTest
			.post(`/repos/${tenantId}/git/summaries`)
			.query({ initial: "true" })
			.set("Authorization", authorization)
			.send({ type: "container", trees: [], blobs: [] })
			.expect(201);

		document = { ...activeDocument };
		// MongoDB persists an explicitly undefined optional field as null.
		Object.assign(document, { storageName: null });
		await superTest
			.post(`/repos/${tenantId}/git/summaries`)
			.set("Authorization", authorization)
			.send({ type: "container", trees: [], blobs: [] })
			.expect(201);

		document = { ...document, tenantId: "victim-tenant" };
		await superTest
			.post(`/repos/${tenantId}/git/summaries`)
			.set("Authorization", authorization)
			.send({ type: "container", trees: [], blobs: [] })
			.expect(404);

		sinon.assert.callCount(readDocument, 3);
		sinon.assert.calledTwice(createSummary);
	});

	it("rejects a non-string storage name from Alfred", async () => {
		const document = { ...activeDocument };
		Object.assign(document, { storageName: 123 });
		sandbox.stub(documentManager, "readDocument").resolves(document);
		const createSummary = sandbox.stub(RestGitService.prototype, "createSummary");
		const logError = sandbox.spy(Lumberjack, "error");

		const response = await superTest
			.post(`/repos/${tenantId}/git/summaries`)
			.set("Authorization", authorization)
			.send({ type: "container", trees: [], blobs: [] })
			.expect(502);

		assert.strictEqual(response.body, "Invalid document response from Alfred.");
		sinon.assert.notCalled(createSummary);
		sinon.assert.calledWithMatch(
			logError,
			"HistorianSummaryDocumentOwnershipValidation",
			sinon.match({ operation: "post", outcome: "dependencyError" }),
		);
	});

	for (const testCase of [
		{ name: "active", document: activeDocument },
		{
			name: "scheduled-for-deletion",
			document: {
				...activeDocument,
				scheduledDeletionTime: "2026-07-31T18:00:00.000Z",
			},
		},
	]) {
		it(`rejects initial replay for an ${testCase.name} document before storage`, async () => {
			const readDocument = sandbox
				.stub(documentManager, "readDocument")
				.resolves(testCase.document);
			const createSummary = sandbox.stub(RestGitService.prototype, "createSummary");
			const getTenant = sandbox.spy(defaultTenantService, "getTenant");

			await superTest
				.post(`/repos/${tenantId}/git/summaries`)
				.query({ initial: "true" })
				.set("Authorization", authorization)
				.set("StorageName", "initial-storage")
				.send({ type: "container", trees: [], blobs: [] })
				.expect(404);

			sinon.assert.calledOnceWithExactly(readDocument, tenantId, documentId);
			sinon.assert.notCalled(createSummary);
			sinon.assert.notCalled(getTenant);
		});
	}

	it("fails initial upload closed when Alfred is unavailable", async () => {
		const clock = sandbox.useFakeTimers({ toFake: ["setTimeout"] });
		const readDocument = sandbox
			.stub(documentManager, "readDocument")
			.rejects(new NetworkError(503, "Alfred unavailable", true, false));
		const createSummary = sandbox.stub(RestGitService.prototype, "createSummary");
		const waitForCallCount = async (expectedCallCount: number): Promise<void> => {
			while (readDocument.callCount < expectedCallCount) {
				await new Promise<void>((resolve) => {
					setImmediate(resolve);
				});
			}
		};

		const responsePromise = superTest
			.post(`/repos/${tenantId}/git/summaries`)
			.query({ initial: "true" })
			.set("Authorization", authorization)
			.send({ type: "container", trees: [], blobs: [] })
			.expect(503)
			.then();
		await waitForCallCount(1);
		await clock.tickAsync(1000);
		await waitForCallCount(2);
		await clock.tickAsync(2000);
		await waitForCallCount(3);
		await clock.tickAsync(4000);
		await waitForCallCount(4);
		await clock.tickAsync(8000);
		await responsePromise;

		sinon.assert.notCalled(createSummary);
	});

	it("creates no positive attacker mappings after ownership denial", async () => {
		sandbox.stub(documentManager, "readDocument").resolves({
			...activeDocument,
			tenantId: "victim-tenant",
		});
		const cacheSet = sandbox.spy(cache, "set");

		await superTest
			.get(`/repos/${tenantId}/git/summaries/latest`)
			.set("Authorization", authorization)
			.expect(404);

		sinon.assert.notCalled(cacheSet);
	});

	it("fails closed when Alfred is unavailable", async () => {
		const clock = sandbox.useFakeTimers({ toFake: ["setTimeout"] });
		const readDocument = sandbox
			.stub(documentManager, "readDocument")
			.rejects(new NetworkError(503, "Alfred unavailable", true, false));
		const getSummary = sandbox.stub(RestGitService.prototype, "getSummary");
		const waitForCallCount = async (expectedCallCount: number): Promise<void> => {
			while (readDocument.callCount < expectedCallCount) {
				await new Promise<void>((resolve) => {
					setImmediate(resolve);
				});
			}
		};

		const responsePromise = superTest
			.get(`/repos/${tenantId}/git/summaries/latest`)
			.set("Authorization", authorization)
			.expect(503)
			.then();
		await waitForCallCount(1);
		await clock.tickAsync(1000);
		await waitForCallCount(2);
		await clock.tickAsync(2000);
		await waitForCallCount(3);
		await clock.tickAsync(4000);
		await waitForCallCount(4);
		await clock.tickAsync(8000);
		await responsePromise;

		sinon.assert.notCalled(getSummary);
	});

	it("validates ownership before GET, POST, and DELETE service calls", async () => {
		const events: string[] = [];
		sandbox.stub(documentManager, "readDocument").callsFake(async () => {
			events.push("readDocument");
			return activeDocument;
		});
		sandbox.stub(RestGitService.prototype, "getSummary").callsFake(async () => {
			events.push("getSummary");
			return { id: sha, trees: [], blobs: [] };
		});
		sandbox.stub(RestGitService.prototype, "createSummary").callsFake(async () => {
			events.push("createSummary");
			return { id: sha };
		});
		sandbox.stub(RestGitService.prototype, "deleteSummary").callsFake(async () => {
			events.push("deleteSummary");
			return true;
		});

		await superTest
			.get(`/repos/${tenantId}/git/summaries/${sha}`)
			.set("Authorization", authorization)
			.expect(200);
		await superTest
			.post(`/repos/${tenantId}/git/summaries`)
			.set("Authorization", authorization)
			.send({ type: "container", trees: [], blobs: [] })
			.expect(201);
		await superTest
			.delete(`/repos/${tenantId}/git/summaries`)
			.set("Authorization", authorization)
			.set("Soft-Delete", "true")
			.expect(200);

		assert.deepStrictEqual(events, [
			"readDocument",
			"getSummary",
			"readDocument",
			"createSummary",
			"readDocument",
			"deleteSummary",
		]);
	});
});

describe("createRouteContext", () => {
	const testMaxTokenLifetimeSec = 999;
	let testProvider: nconf.Provider;
	let throttlers: Map<string, TestThrottler>;

	beforeEach(() => {
		testProvider = new nconf.Provider({}).defaults({
			maxTokenLifetimeSec: testMaxTokenLifetimeSec,
		});
		throttlers = new Map<string, TestThrottler>();
		throttlers.set(Constants.generalRestCallThrottleIdPrefix, new TestThrottler(10));
	});

	it("returns a truthy router", () => {
		const ctx = createRouteContext(testProvider, throttlers);
		assert.strictEqual(typeof ctx.router, "function");
		assert.ok(typeof ctx.router.get === "function");
	});

	it("returns the configured maxTokenLifetimeSec", () => {
		const ctx = createRouteContext(testProvider, throttlers);
		assert.strictEqual(ctx.maxTokenLifetimeSec, testMaxTokenLifetimeSec);
	});

	it("tenantThrottleOptions.throttleIdSuffix equals Constants.historianRestThrottleIdSuffix", () => {
		const ctx = createRouteContext(testProvider, throttlers);
		assert.strictEqual(
			ctx.tenantThrottleOptions.throttleIdSuffix,
			Constants.historianRestThrottleIdSuffix,
		);
	});

	it("tenantThrottleOptions.throttleIdPrefix returns req.params.tenantId", () => {
		const ctx = createRouteContext(testProvider, throttlers);
		const mockReq = { params: { tenantId: "myTenant" } } as any;
		assert.strictEqual(
			typeof ctx.tenantThrottleOptions.throttleIdPrefix === "function"
				? ctx.tenantThrottleOptions.throttleIdPrefix(mockReq)
				: undefined,
			"myTenant",
		);
	});

	it("restTenantGeneralThrottler is the throttler from the map", () => {
		const throttler = new TestThrottler(10);
		const localThrottlers = new Map<string, TestThrottler>();
		localThrottlers.set(Constants.generalRestCallThrottleIdPrefix, throttler);
		const ctx = createRouteContext(testProvider, localThrottlers);
		assert.strictEqual(ctx.restTenantGeneralThrottler, throttler);
	});

	it("restTenantGeneralThrottler is undefined when key is absent from map", () => {
		const emptyThrottlers = new Map<string, TestThrottler>();
		const ctx = createRouteContext(testProvider, emptyThrottlers);
		assert.strictEqual(ctx.restTenantGeneralThrottler, undefined);
	});

	it("maxTokenLifetimeSec is undefined when config key is absent", () => {
		const providerWithoutKey = new nconf.Provider({}).defaults({});
		const ctx = createRouteContext(providerWithoutKey, throttlers);
		assert.strictEqual(ctx.maxTokenLifetimeSec, undefined);
	});
});
