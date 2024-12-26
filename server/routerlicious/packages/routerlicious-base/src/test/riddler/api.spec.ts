/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import * as crypto from "crypto";
import express from "express";
import request from "supertest";
import { TestDbFactory } from "@fluidframework/server-test-utils";
import {
	EncryptionKeyVersion,
	MongoManager,
	ISecretManager,
} from "@fluidframework/server-services-core";
import * as riddlerApp from "../../riddler/app";
import Sinon from "sinon";
import { ITenantDocument } from "../../riddler";
import { TenantKeyGenerator } from "@fluidframework/server-services-utils";
import { StartupCheck } from "@fluidframework/server-services-shared";

const documentsCollectionName = "testDocuments";
const deltasCollectionName = "testDeltas";
const rawDeltasCollectionName = "testRawDeltas";
const testTenantsCollectionName = "test-tenantAdmins";

class TestSecretManager implements ISecretManager {
	constructor(private readonly encryptionKey: string) {}

	public getLatestKeyVersion(): EncryptionKeyVersion {
		return EncryptionKeyVersion.key2022;
	}

	public decryptSecret(encryptedSecret: string): string {
		return `test-decrypted-secret with key ${this.encryptionKey}`;
	}

	public encryptSecret(secret: string): string {
		return `test-encrypted-secret with key ${this.encryptionKey}`;
	}
}

describe("Routerlicious", () => {
	describe("Riddler", () => {
		describe("API", async () => {
			const document = {
				_id: "doc-id",
				content: "Hello, World!",
			};
			const defaultDbFactory = new TestDbFactory({
				[documentsCollectionName]: [document],
				[deltasCollectionName]: [],
				[rawDeltasCollectionName]: [],
				[testTenantsCollectionName]: [],
			});
			const defaultMongoManager = new MongoManager(defaultDbFactory);
			const defaultDb = await defaultMongoManager.getDatabase();
			const defaultTenantsCollection =
				defaultDb.collection<ITenantDocument>(testTenantsCollectionName);
			const testTenantId = "test-tenant-id";

			let app: express.Application;
			let supertest: request.SuperTest<request.Test>;

			describe("CorrelationId", () => {
				const correlationIdHeaderName = "x-correlation-id";
				const testCorrelationId = "test-correlation-id";

				const assertCorrelationId = async (
					url: string,
					method: "get" | "post" | "put" | "patch" | "delete" = "get",
				): Promise<void> => {
					await supertest[method](url)
						.set(correlationIdHeaderName, testCorrelationId)
						.then((res) => {
							assert.strictEqual(
								res.header?.[correlationIdHeaderName],
								testCorrelationId,
							);
						});
				};

				beforeEach(() => {
					const testLoggerFormat = "test-logger-format";
					const testBaseOrdererUrl = "test-base-orderer-url";
					const testExtHistorianUrl = "test-ext-historian-url";
					const testIntHistorianUrl = "test-int-historian-url";
					const testSecretManager = new TestSecretManager(
						crypto.randomBytes(32).toString("base64"),
					);
					Sinon.useFakeTimers();
					const testFetchTenantKeyMetricIntervalMs = 60000;
					const testRiddlerStorageRequestMetricIntervalMs = 60000;
					const tenantKeyGenerator = new TenantKeyGenerator();
					const startupCheck = new StartupCheck();

					app = riddlerApp.create(
						defaultTenantsCollection,
						testLoggerFormat,
						testBaseOrdererUrl,
						testExtHistorianUrl,
						testIntHistorianUrl,
						testSecretManager,
						testFetchTenantKeyMetricIntervalMs,
						testRiddlerStorageRequestMetricIntervalMs,
						tenantKeyGenerator,
						startupCheck,
					);
					supertest = request(app);
				});

				afterEach(() => {
					Sinon.restore();
				});

				it("POST /tenants/:id/validate", async () => {
					await assertCorrelationId(`/api/tenants/${testTenantId}/validate`, "post");
				});
				it("GET /tenants/:id", async () => {
					await assertCorrelationId(`/api/tenants/${testTenantId}`);
				});
				it("GET /tenants", async () => {
					await assertCorrelationId("/api/tenants");
				});
				it("GET /tenants/:id/key", async () => {
					await assertCorrelationId(`/api/tenants/${testTenantId}/key`);
				});
				it("PUT /tenants/:id/storage", async () => {
					await assertCorrelationId(`/api/tenants/${testTenantId}/storage`, "put");
				});
				it("PUT /tenants/:id/orderer", async () => {
					await assertCorrelationId(`/api/tenants/${testTenantId}/orderer`, "put");
				});
				it("PUT /tenants/:id/customData", async () => {
					await assertCorrelationId(`/api/tenants/${testTenantId}/customData`, "put");
				});
				it("PUT /tenants/:id/privateKeyAccess", async () => {
					await assertCorrelationId(
						`/api/tenants/${testTenantId}/privateKeyAccess`,
						"put",
					);
				});
				it("PUT /tenants/:id/key", async () => {
					await assertCorrelationId(`/api/tenants/${testTenantId}/key`, "put");
				});
				it("POST /tenants/:id?", async () => {
					await assertCorrelationId(`/api/tenants/${testTenantId}`, "post");
				});
				it("DELETE /tenants/:id", async () => {
					await assertCorrelationId(`/api/tenants/${testTenantId}`, "delete");
				});
			});
		});
	});
});
