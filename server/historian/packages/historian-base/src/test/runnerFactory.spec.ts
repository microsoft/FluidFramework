/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import * as services from "@fluidframework/server-services";
import type { IDocumentManager } from "@fluidframework/server-services-core";
import { TestRedisClientConnectionManager } from "@fluidframework/server-test-utils";
import * as nconf from "nconf";

import type { IHistorianResourcesCustomizations } from "../customizations";
import { HistorianResourcesFactory } from "../runnerFactory";
import { TestDocumentManager } from "./utils";

const throttleConfig = {
	maxPerMs: 1000,
	maxBurst: 1000,
	minCooldownIntervalInMs: 1000,
};

function createConfig(): nconf.Provider {
	return new nconf.Provider({}).defaults({
		alfred: "http://alfred",
		maxTokenLifetimeSec: 3600,
		redis: {},
		redisForThrottling: {},
		restGitService: {
			disableGitCache: true,
			ephemeralDocumentTTLSec: 86400,
		},
		riddler: "http://riddler",
		storage: {
			perDocEnabled: false,
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
	});
});
