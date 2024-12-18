/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TenantManager, type ITenantDocument } from "../../riddler/tenantManager";
import { ITenantRepository } from "../../riddler/mongoTenantRepository";
import {
	ISecretManager,
	ICache,
	EncryptionKeyVersion,
	type ITenantPrivateKeys,
	type ITenantKeys,
} from "@fluidframework/server-services-core";
import { TestCache } from "@fluidframework/server-test-utils";
import sinon from "sinon";
import {
	type ITenantKeyGenerator,
	TenantKeyGenerator,
} from "@fluidframework/server-services-utils";
import assert from "assert";
import { NetworkError } from "@fluidframework/server-services-client";

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

function isITenantKeys(obj: any): obj is ITenantKeys {
	return (
		typeof obj === "object" &&
		obj !== null &&
		typeof obj.key1 === "string" &&
		typeof obj.key2 === "string"
	);
}

function isITenantPrivateKeys(obj: any): obj is ITenantPrivateKeys {
	return (
		typeof obj === "object" &&
		obj !== null &&
		typeof obj.key === "string" &&
		typeof obj.secondaryKey === "string" &&
		typeof obj.keyNextRotationTime === "number" &&
		typeof obj.secondaryKeyNextRotationTime === "number"
	);
}

const tenantWithoutKeyless: ITenantDocument = {
	_id: "cordflasher-dolphin",
	orderer: {
		type: "kafka",
		url: "http://localhost:3003",
	},
	storage: {
		historianUrl: "http://localhost:3001",
		internalHistorianUrl: "http://historian:3000",
		url: "http://gitrest:3000",
		owner: "fluid",
		repository: "fluid",
		credentials: {
			user: "user1",
			password: "password1",
		},
	},
	customData: {
		encryptionKeyVersion: "2022",
	},
	disabled: false,
	key: "abcd",
	secondaryKey: "efgh",
};

const tenantWithKeyless: ITenantDocument = {
	_id: "cordflasher-dolphin",
	orderer: {
		type: "kafka",
		url: "http://localhost:3003",
	},
	storage: {
		historianUrl: "http://localhost:3001",
		internalHistorianUrl: "http://historian:3000",
		url: "http://gitrest:3000",
		owner: "fluid",
		repository: "fluid",
		credentials: {
			user: "user1",
			password: "password1",
		},
	},
	customData: {
		encryptionKeyVersion: "2022",
	},
	disabled: false,
	key: "abcd",
	secondaryKey: "efgh",
	privateKeys: {
		key: "key1",
		secondaryKey: "key2",
		keyNextRotationTime: Math.round(new Date().getTime() / 1000) + 86400,
		secondaryKeyNextRotationTime: Math.round(new Date().getTime() / 1000) + 86400,
	},
};

describe("TenantManager", () => {
	let tenantManager: TenantManager;
	let tenantRepository: ITenantRepository;
	let secretManager: ISecretManager;
	let cache: ICache;
	let tenantKeyGenerator: ITenantKeyGenerator;
	let sandbox: sinon.SinonSandbox;

	beforeEach(() => {
		sandbox = sinon.createSandbox();
		tenantRepository = new TestTenantRepository();
		cache = new TestCache();
		secretManager = new TestSecretManager();
		tenantKeyGenerator = new TenantKeyGenerator();

		tenantManager = new TenantManager(
			tenantRepository,
			"baseOrdererUrl",
			"defaultHistorianUrl",
			"defaultInternalHistorianUrl",
			secretManager,
			0,
			0,
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

	describe("decryptCachedKeys", () => {
		it("Should decrypt ITenantKeys when decryptPrivateKeys is false", () => {
			const keys: ITenantKeys = { key1: "abcd", key2: "efgh" };
			const decryptedKeys = tenantManager["decryptCachedKeys"](JSON.stringify(keys), false);
			assert(isITenantKeys(decryptedKeys));
			assert.strictEqual(decryptedKeys.key1, keys.key1);
			assert.strictEqual(decryptedKeys.key2, keys.key2);
		});

		it("Should decrypt ITenantPrivateKeys when decryptPrivateKeys is true", () => {
			const keys: ITenantPrivateKeys = {
				key: "abcd",
				secondaryKey: "efgh",
				keyNextRotationTime: Math.round(new Date().getTime() / 1000) + 86400,
				secondaryKeyNextRotationTime: Math.round(new Date().getTime() / 1000),
			};
			const decryptedKeys = tenantManager["decryptCachedKeys"](JSON.stringify(keys), true);
			assert(isITenantPrivateKeys(decryptedKeys));
			assert.strictEqual(decryptedKeys.key, keys.key);
			assert.strictEqual(decryptedKeys.secondaryKey, keys.secondaryKey);
		});
	});

	describe("getTenantKeys", () => {
		it("Should return the public shared keys when the tenant does not have private keys", async () => {
			sandbox.stub(tenantRepository, "findOne").resolves(tenantWithoutKeyless);
			const expectedKeys = { key1: "abcd", key2: "efgh" };
			const keys = await tenantManager.getTenantKeys("cordflasher-dolphin");
			assert.strictEqual(keys.key1, expectedKeys.key1);
			assert.strictEqual(keys.key2, expectedKeys.key2);
		});

		it("Should throw a 404 the tenant does not have private keys and private keys are requested", async () => {
			sandbox.stub(tenantRepository, "findOne").resolves(tenantWithoutKeyless);
			const keysP = tenantManager.getTenantKeys("cordflasher-dolphin", false, false, true);
			await assert.rejects(keysP, (err) => {
				assert(err instanceof NetworkError);
				assert.strictEqual(err.code, 404);
				assert.strictEqual(
					err.message,
					`Private keys are missing for tenant id cordflasher-dolphin`,
				);
				return true;
			});
		});

		it("Should return the private keys when the tenant has private keys and getPrivateKeys is true", async () => {
			sandbox.stub(tenantRepository, "findOne").resolves(tenantWithKeyless);
			const expectedKeys = { key1: "key1", key2: "key2" };
			const keys = await tenantManager.getTenantKeys(
				"cordflasher-dolphin",
				false,
				false,
				true,
			);
			assert.strictEqual(keys.key1, expectedKeys.key1);
			assert.strictEqual(keys.key2, expectedKeys.key2);
		});

		it("Should return the shared keys when the tenant has private keys and getPrivateKeys is false", async () => {
			sandbox.stub(tenantRepository, "findOne").resolves(tenantWithKeyless);
			const expectedKeys = { key1: "abcd", key2: "efgh" };
			const keys = await tenantManager.getTenantKeys("cordflasher-dolphin");
			assert.strictEqual(keys.key1, expectedKeys.key1);
			assert.strictEqual(keys.key2, expectedKeys.key2);
		});
	});
});
