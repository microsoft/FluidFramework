/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ScopeType } from "@fluidframework/protocol-definitions";
import {
	generateToken,
	getAuthorizationTokenFromCredentials,
} from "@fluidframework/server-services-client";
import { StartupCheck } from "@fluidframework/server-services-shared";
import { TestThrottler } from "@fluidframework/server-test-utils";
import express from "express";
import * as nconf from "nconf";
import * as sinon from "sinon";
import request from "supertest";

import * as historianApp from "../app";
import type {
	DocumentAccessOperation,
	IDocumentAccessAuthorizer,
	IDocumentAccessProof,
} from "../services";
import { RestGitService } from "../services";
import { Constants } from "../utils";
import { TestCache, TestDocumentManager, TestTenantService } from "./utils";

const tenantId = "tenant";
const documentId = "document";
const authorization = getAuthorizationTokenFromCredentials({
	user: tenantId,
	password: generateToken(tenantId, documentId, "tenant-key", [
		ScopeType.DocRead,
		ScopeType.DocWrite,
		ScopeType.SummaryWrite,
	]),
});

function createProof(operation: DocumentAccessOperation): IDocumentAccessProof {
	if (operation === "create") {
		return {
			tenantId,
			documentId,
			operation,
			source: "trusted-create",
			containerType: "durable",
			lifecycleVersion: "generation-1",
			state: "pending",
		};
	}
	return {
		tenantId,
		documentId,
		operation,
		source: "alfred-fallback",
		containerType: "durable",
		lifecycleVersion: "generation-1",
		state: "active",
	};
}

describe("document authorization routes", () => {
	const sandbox = sinon.createSandbox();
	let app: express.Application;
	let authorize: sinon.SinonStub;

	beforeEach(() => {
		const provider = new nconf.Provider({}).defaults({
			auth: {
				maxTokenLifetimeSec: 1_000_000,
				enableTokenExpiration: true,
			},
			ignoreEphemeralFlag: true,
			logger: {
				morganFormat: "json",
			},
		});
		const tenantThrottlers = new Map<string, TestThrottler>([
			[Constants.generalRestCallThrottleIdPrefix, new TestThrottler(1000)],
			[Constants.createSummaryThrottleIdPrefix, new TestThrottler(1000)],
			[Constants.getSummaryThrottleIdPrefix, new TestThrottler(1000)],
		]);
		const clusterThrottlers = new Map<string, TestThrottler>([
			[Constants.createSummaryThrottleIdPrefix, new TestThrottler(1000)],
			[Constants.getSummaryThrottleIdPrefix, new TestThrottler(1000)],
		]);
		authorize = sandbox
			.stub()
			.callsFake(async ({ operation }: { operation: DocumentAccessOperation }) =>
				createProof(operation),
			);
		const documentAccessAuthorizer: IDocumentAccessAuthorizer = { authorize };

		app = historianApp.create(
			provider,
			new TestTenantService(),
			undefined,
			tenantThrottlers,
			clusterThrottlers,
			new TestDocumentManager(),
			new StartupCheck(),
			new TestCache(),
			undefined,
			undefined,
			24 * 60 * 60,
			undefined,
			undefined,
			undefined,
			documentAccessAuthorizer,
		);
	});

	afterEach(() => sandbox.restore());

	for (const testCase of [
		{
			name: "create blob",
			method: "post",
			path: `/repos/${tenantId}/git/blobs`,
			operation: "write",
			serviceMethod: "createBlob",
			result: { url: "http://localhost/blob", sha: "blob-sha" },
		},
		{
			name: "get blob",
			method: "get",
			path: `/repos/${tenantId}/git/blobs/blob-sha`,
			operation: "read",
			serviceMethod: "getBlob",
			result: {
				content: "content",
				encoding: "utf-8",
				url: "http://localhost/blob",
				sha: "blob-sha",
				size: 7,
			},
		},
		{
			name: "create commit",
			method: "post",
			path: `/repos/${tenantId}/git/commits`,
			operation: "write",
			serviceMethod: "createCommit",
			result: { sha: "commit-sha", url: "http://localhost/commit" },
		},
		{
			name: "get commit",
			method: "get",
			path: `/repos/${tenantId}/git/commits/commit-sha`,
			operation: "read",
			serviceMethod: "getCommit",
			result: { sha: "commit-sha" },
		},
		{
			name: "list refs",
			method: "get",
			path: `/repos/${tenantId}/git/refs`,
			operation: "read",
			serviceMethod: "getRefs",
			result: [],
		},
		{
			name: "get ref",
			method: "get",
			path: `/repos/${tenantId}/git/refs/heads/main`,
			operation: "read",
			serviceMethod: "getRef",
			result: { ref: "refs/heads/main" },
		},
		{
			name: "create ref",
			method: "post",
			path: `/repos/${tenantId}/git/refs`,
			operation: "write",
			serviceMethod: "createRef",
			result: { ref: "refs/heads/main" },
		},
		{
			name: "update ref",
			method: "patch",
			path: `/repos/${tenantId}/git/refs/heads/main`,
			operation: "write",
			serviceMethod: "updateRef",
			result: { ref: "refs/heads/main" },
		},
		{
			name: "delete ref",
			method: "delete",
			path: `/repos/${tenantId}/git/refs/heads/main`,
			operation: "delete",
			serviceMethod: "deleteRef",
			result: undefined,
		},
		{
			name: "create tag",
			method: "post",
			path: `/repos/${tenantId}/git/tags`,
			operation: "write",
			serviceMethod: "createTag",
			result: { sha: "tag-sha" },
		},
		{
			name: "get tag",
			method: "get",
			path: `/repos/${tenantId}/git/tags/tag-sha`,
			operation: "read",
			serviceMethod: "getTag",
			result: { sha: "tag-sha" },
		},
		{
			name: "create tree",
			method: "post",
			path: `/repos/${tenantId}/git/trees`,
			operation: "write",
			serviceMethod: "createTree",
			result: { sha: "tree-sha" },
		},
		{
			name: "get tree",
			method: "get",
			path: `/repos/${tenantId}/git/trees/tree-sha`,
			operation: "read",
			serviceMethod: "getTree",
			result: { sha: "tree-sha", tree: [] },
		},
		{
			name: "list commits",
			method: "get",
			path: `/repos/${tenantId}/commits?sha=commit-sha`,
			operation: "read",
			serviceMethod: "getCommits",
			result: [],
		},
		{
			name: "get content",
			method: "get",
			path: `/repos/${tenantId}/contents/path?ref=main`,
			operation: "read",
			serviceMethod: "getContent",
			result: { path: "path" },
		},
		{
			name: "get header",
			method: "get",
			path: `/repos/${tenantId}/headers/commit-sha`,
			operation: "read",
			serviceMethod: "getHeader",
			result: {},
		},
		{
			name: "get full tree",
			method: "get",
			path: `/repos/${tenantId}/tree/tree-sha`,
			operation: "read",
			serviceMethod: "getFullTree",
			result: {},
		},
	] as const) {
		it(`${testCase.name} authorizes before Git service use`, async () => {
			const serviceCall = sandbox
				.stub(RestGitService.prototype, testCase.serviceMethod)
				.resolves(testCase.result as never);

			await request(app)
				[testCase.method](testCase.path)
				.set("Authorization", authorization)
				.send({});

			sinon.assert.calledOnceWithMatch(authorize, {
				tenantId,
				documentId,
				operation: testCase.operation,
			});
			assert.ok(authorize.calledBefore(serviceCall));
		});
	}
});
