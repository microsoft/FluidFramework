import { TenantManager } from "../../riddler/tenantManager";
import { ITenantRepository } from "../../riddler/mongoTenantRepository";
import { ISecretManager, ICache, EncryptionKeyVersion, type ITenantPrivateKeys } from "@fluidframework/server-services-core";
import { ITenantKeyGenerator, TenantKeyGenerator } from "@fluidframework/server-services-utils";
import { TestCache } from "@fluidframework/server-test-utils";
import Sinon from "sinon";
// import { NetworkError } from "@fluidframework/server-services-client";
// import * as jwt from "jsonwebtoken";
import assert from "assert";

class TestSecretManager implements ISecretManager {
	constructor() {}

	public getLatestKeyVersion(): EncryptionKeyVersion {
		return EncryptionKeyVersion.key2022;
	}

	public decryptSecret(encryptedSecret: string): string {
		return encryptedSecret;
	}

	public encryptSecret(secret: string): string {
		return secret;
	}
}

describe("TenantManager", () => {
	let tenantManager: TenantManager;
	let tenantRepository: ITenantRepository;
	let secretManager: ISecretManager = new TestSecretManager();
	let cache: ICache;
	let tenantKeyGenerator: ITenantKeyGenerator = new TenantKeyGenerator();

	beforeEach(() => {
		tenantRepository = {
			insertOne: Sinon.stub(),
			update: Sinon.stub(),
			findOne: Sinon.stub(),
			deleteOne: Sinon.stub(),
			find: Sinon.stub(),
		} as unknown as ITenantRepository;
		cache = new TestCache();

		tenantManager = new TenantManager(
			tenantRepository,
			"baseOrdererUrl",
			"defaultHistorianUrl",
			"defaultInternalHistorianUrl",
			secretManager,
			1000,
			1000,
			tenantKeyGenerator,
			cache,
		);
	});

	afterEach(() => {
		Sinon.restore();
	});

	describe("returnPrivateKeysInOrder", () => {
		it("Should return the secondary key as key1 when the primary key is being used and is within 1 hour of rotation", async () => {
			const privateTenantKeys: ITenantPrivateKeys = {
				key: "abcd",
				secondaryKey: "efgh",
				keyNextRotationTime: Math.round(new Date().getTime() / 1000),
				secondaryKeyNextRotationTime: Math.round(new Date().getTime() / 1000) + 86400,
			}
			const expectedKeys = { key1: "efgh", key2: "abcd" };
			Sinon.stub(cache, "get").resolves("primary");
			const orderedKeys = await tenantManager['returnPrivateKeysInOrder']("1234", privateTenantKeys, {});
			assert.strictEqual(orderedKeys.key1, expectedKeys.key1);
			assert.strictEqual(orderedKeys.key2, expectedKeys.key2);
		});

		it("Should return the primary key as key1 when the secondary key is being used and is within 1 hour of rotation", async () => {
			const privateTenantKeys: ITenantPrivateKeys = {
				key: "abcd",
				secondaryKey: "efgh",
				keyNextRotationTime: Math.round(new Date().getTime() / 1000) + 86400,
				secondaryKeyNextRotationTime: Math.round(new Date().getTime() / 1000),
			}
			const expectedKeys = { key1: "abcd", key2: "efgh" };
			Sinon.stub(cache, "get").resolves("secondary");
			const orderedKeys = await tenantManager['returnPrivateKeysInOrder']("1234", privateTenantKeys, {});
			assert.strictEqual(orderedKeys.key1, expectedKeys.key1);
			assert.strictEqual(orderedKeys.key2, expectedKeys.key2);
		});

		it("Should return the default keys when the cache does not have any data on key being used", async () => {
			const privateTenantKeys: ITenantPrivateKeys = {
				key: "abcd",
				secondaryKey: "efgh",
				keyNextRotationTime: Math.round(new Date().getTime() / 1000) + 86400,
				secondaryKeyNextRotationTime: Math.round(new Date().getTime() / 1000),
			}
			const expectedKeys = { key1: "abcd", key2: "efgh" };
			Sinon.stub(cache, "get").resolves(null);
			const orderedKeys = await tenantManager['returnPrivateKeysInOrder']("1234", privateTenantKeys, {});
			assert.strictEqual(orderedKeys.key1, expectedKeys.key1);
			assert.strictEqual(orderedKeys.key2, expectedKeys.key2);
		});

		it("Should return the key name in the cache as key1 in case no keys are close to rotation", async () => {
			const privateTenantKeys: ITenantPrivateKeys = {
				key: "abcd",
				secondaryKey: "efgh",
				keyNextRotationTime: Math.round(new Date().getTime() / 1000) + 86400,
				secondaryKeyNextRotationTime: Math.round(new Date().getTime() / 1000) + 86400,
			}
			let expectedKeys = { key1: "abcd", key2: "efgh" };
			Sinon.stub(cache, "get").resolves("primary");
			let orderedKeys = await tenantManager['returnPrivateKeysInOrder']("1234", privateTenantKeys, {});
			assert.strictEqual(orderedKeys.key1, expectedKeys.key1);
			assert.strictEqual(orderedKeys.key2, expectedKeys.key2);

			// Restore the stub and test with secondary key
			Sinon.restore();
			expectedKeys = { key1: "efgh", key2: "abcd" };
			Sinon.stub(cache, "get").resolves("secondary");
			orderedKeys = await tenantManager['returnPrivateKeysInOrder']("1234", privateTenantKeys, {});
			assert.strictEqual(orderedKeys.key1, expectedKeys.key1);
			assert.strictEqual(orderedKeys.key2, expectedKeys.key2);
		});
	});
});
