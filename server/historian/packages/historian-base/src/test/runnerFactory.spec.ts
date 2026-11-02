/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import * as services from "@fluidframework/server-services";
import type { IDocumentManager, IStorageNameRetriever } from "@fluidframework/server-services-core";
import { TestRedisClientConnectionManager } from "@fluidframework/server-test-utils";
import * as nconf from "nconf";
import sinon from "sinon";

import type { IHistorianResourcesCustomizations } from "../customizations";
import { HistorianResourcesFactory } from "../runnerFactory";
import type {
	IDocumentAccessAuthorizer,
	IDocumentAccessControlFactory,
	ISimplifiedCustomDataRetriever,
	ITrustedCreateContextResolver,
} from "../services";
import { TestDocumentManager } from "./utils";

const throttleConfig = {
	maxPerMs: 1000,
	maxBurst: 1000,
	minCooldownIntervalInMs: 1000,
};

function createConfig(
	options: {
		disableGitCache?: boolean;
		storagePerDocEnabled?: boolean;
	} = {},
): nconf.Provider {
	return new nconf.Provider({}).defaults({
		alfred: "http://alfred",
		maxTokenLifetimeSec: 3600,
		redis: {},
		redisForThrottling: {},
		restGitService: {
			disableGitCache: options.disableGitCache ?? true,
			ephemeralDocumentTTLSec: 86400,
		},
		riddler: "http://riddler",
		storage: {
			perDocEnabled: options.storagePerDocEnabled ?? false,
		},
		system: {
			httpServer: {},
		},
		throttling: {
			restCallsPerCluster: {
				createSummary: throttleConfig,
				getSummary: throttleConfig,
			},
			restCallsPerTenant: {
				createSummary: throttleConfig,
				generalRestCall: throttleConfig,
				getSummary: throttleConfig,
			},
		},
	});
}

function createCustomizations(
	documentManager?: IDocumentManager,
): IHistorianResourcesCustomizations {
	return {
		documentManager,
		redisClientConnectionManager: new TestRedisClientConnectionManager(),
		redisClientConnectionManagerForInvalidTokenCache: new TestRedisClientConnectionManager(),
		redisClientConnectionManagerForThrottling: new TestRedisClientConnectionManager(),
	};
}

describe("HistorianResourcesFactory", () => {
	describe(".create", () => {
		it("uses the injected document manager", async () => {
			const documentManager = new TestDocumentManager();
			const resources = await new HistorianResourcesFactory().create(
				createConfig(),
				createCustomizations(documentManager),
			);

			assert.strictEqual(resources.documentManager, documentManager);

			await resources.dispose();
		});

		it("constructs the Alfred-backed document manager by default", async () => {
			const resources = await new HistorianResourcesFactory().create(
				createConfig(),
				createCustomizations(),
			);

			assert.ok(resources.documentManager instanceof services.DocumentManager);

			await resources.dispose();
		});

		it("creates the document access customization from the initialized dependencies", async () => {
			const config = createConfig({
				disableGitCache: false,
				storagePerDocEnabled: true,
			});

			const documentManager = new TestDocumentManager();
			const storageNameRetriever: IStorageNameRetriever = {
				get: sinon.stub().resolves("storage"),
			};
			const simplifiedCustomDataRetriever: ISimplifiedCustomDataRetriever = {
				get: sinon.stub().returns("{}"),
			};
			const authorizer: IDocumentAccessAuthorizer = {
				authorize: sinon.stub().rejects(new Error("not called by resource creation")),
			};
			const trustedCreateContextResolver: ITrustedCreateContextResolver = {
				resolve: sinon.stub().rejects(new Error("not called by resource creation")),
			};
			const create = sinon.stub().returns({
				authorizer,
				trustedCreateContextResolver,
			});
			const documentAccessControlFactory: IDocumentAccessControlFactory = { create };

			const resources = await new HistorianResourcesFactory().create(config, {
				...createCustomizations(documentManager),
				storageNameRetriever,
				simplifiedCustomDataRetriever,
				documentAccessControlFactory,
			});

			sinon.assert.calledOnceWithMatch(create, {
				documentManager,
				storageNameRetriever,
				gitCache: resources.cache,
				simplifiedCustomDataRetriever,
			});
			assert.ok(create.firstCall.args[0].tenantManager instanceof services.TenantManager);
			assert.strictEqual(resources.documentAccessAuthorizer, authorizer);
			assert.strictEqual(
				resources.trustedCreateContextResolver,
				trustedCreateContextResolver,
			);

			await resources.dispose();
		});
	});
});
