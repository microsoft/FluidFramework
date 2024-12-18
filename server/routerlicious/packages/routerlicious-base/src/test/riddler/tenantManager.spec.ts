import { TenantManager, type ITenantDocument } from "../../riddler/tenantManager";
import { ITenantRepository } from "../../riddler/mongoTenantRepository";
import {
	ISecretManager,
	ICache,
	EncryptionKeyVersion,
	type ITenantPrivateKeys,
} from "@fluidframework/server-services-core";
import { ITenantKeyGenerator, TenantKeyGenerator } from "@fluidframework/server-services-utils";
import { TestCache } from "@fluidframework/server-test-utils";
import sinon from "sinon";
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

class TestTenantRepository implements ITenantRepository {
	find(query: any, sort: any, limit?: number, skip?: number): Promise<ITenantDocument[]> {
		throw new Error("Method not implemented.");
	}
	findOne(query: any, options?: any): Promise<ITenantDocument | null> {
		throw new Error("Method not implemented.");
	}
	update(filter: any, set: any, addToSet: any, options?: any): Promise<void> {
		throw new Error("Method not implemented.");
	}
	insertOne(value: ITenantDocument): Promise<any> {
		throw new Error("Method not implemented.");
	}
	deleteOne(filter: any): Promise<any> {
		throw new Error("Method not implemented.");
	}
}

describe("TenantManager", () => {
	let tenantManager: TenantManager;
	let tenantRepository: ITenantRepository;
	let secretManager: ISecretManager = new TestSecretManager();
	let cache: ICache;
	let tenantKeyGenerator: ITenantKeyGenerator = new TenantKeyGenerator();
	let sandbox: sinon.SinonSandbox;

	beforeEach(() => {
		sandbox = sinon.createSandbox();
		tenantRepository = new TestTenantRepository();
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
		sandbox.restore();
	});

	describe("returnPrivateKeysInOrder", () => {
		it("Should return the secondary key as key1 when the primary key is being used and is within 1 hour of rotation", async () => {
			const privateTenantKeys: ITenantPrivateKeys = {
				key: "abcd",
				secondaryKey: "efgh",
				keyNextRotationTime: Math.round(new Date().getTime() / 1000),
				secondaryKeyNextRotationTime: Math.round(new Date().getTime() / 1000) + 86400,
			};
			const expectedKeys = { key1: "efgh", key2: "abcd" };
			sandbox.stub(cache, "get").resolves("primary");
			const orderedKeys = await tenantManager["returnPrivateKeysInOrder"](
				"1234",
				privateTenantKeys,
				{},
			);
			assert.strictEqual(orderedKeys.key1, expectedKeys.key1);
			assert.strictEqual(orderedKeys.key2, expectedKeys.key2);
		});

		it("Should return the primary key as key1 when the secondary key is being used and is within 1 hour of rotation", async () => {
			const privateTenantKeys: ITenantPrivateKeys = {
				key: "abcd",
				secondaryKey: "efgh",
				keyNextRotationTime: Math.round(new Date().getTime() / 1000) + 86400,
				secondaryKeyNextRotationTime: Math.round(new Date().getTime() / 1000),
			};
			const expectedKeys = { key1: "abcd", key2: "efgh" };
			sandbox.stub(cache, "get").resolves("secondary");
			const orderedKeys = await tenantManager["returnPrivateKeysInOrder"](
				"1234",
				privateTenantKeys,
				{},
			);
			assert.strictEqual(orderedKeys.key1, expectedKeys.key1);
			assert.strictEqual(orderedKeys.key2, expectedKeys.key2);
		});

		it("Should return the default keys when the cache does not have any data on key being used", async () => {
			const privateTenantKeys: ITenantPrivateKeys = {
				key: "abcd",
				secondaryKey: "efgh",
				keyNextRotationTime: Math.round(new Date().getTime() / 1000) + 86400,
				secondaryKeyNextRotationTime: Math.round(new Date().getTime() / 1000),
			};
			const expectedKeys = { key1: "abcd", key2: "efgh" };
			sandbox.stub(cache, "get").resolves(null);
			const orderedKeys = await tenantManager["returnPrivateKeysInOrder"](
				"1234",
				privateTenantKeys,
				{},
			);
			assert.strictEqual(orderedKeys.key1, expectedKeys.key1);
			assert.strictEqual(orderedKeys.key2, expectedKeys.key2);
		});

		it("Should return the key name in the cache as key1 in case no keys are close to rotation", async () => {
			const privateTenantKeys: ITenantPrivateKeys = {
				key: "abcd",
				secondaryKey: "efgh",
				keyNextRotationTime: Math.round(new Date().getTime() / 1000) + 86400,
				secondaryKeyNextRotationTime: Math.round(new Date().getTime() / 1000) + 86400,
			};
			let expectedKeys = { key1: "abcd", key2: "efgh" };
			const cacheStub = sandbox.stub(cache, "get").resolves("primary");
			let orderedKeys = await tenantManager["returnPrivateKeysInOrder"](
				"1234",
				privateTenantKeys,
				{},
			);
			assert.strictEqual(orderedKeys.key1, expectedKeys.key1);
			assert.strictEqual(orderedKeys.key2, expectedKeys.key2);

			// Restore the stub and test with secondary key
			cacheStub.restore();
			expectedKeys = { key1: "efgh", key2: "abcd" };
			sandbox.stub(cache, "get").resolves("secondary");
			orderedKeys = await tenantManager["returnPrivateKeysInOrder"](
				"1234",
				privateTenantKeys,
				{},
			);
			assert.strictEqual(orderedKeys.key1, expectedKeys.key1);
			assert.strictEqual(orderedKeys.key2, expectedKeys.key2);
		});
	});
});
