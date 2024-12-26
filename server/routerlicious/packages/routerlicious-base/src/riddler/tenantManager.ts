/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	EncryptionKeyVersion,
	IEncryptedTenantKeys,
	IPlainTextAndEncryptedTenantKeys,
	ITenantConfig,
	ITenantCustomData,
	ITenantKeys,
	ITenantOrderer,
	ITenantStorage,
	ITenantPrivateKeys,
	KeyName,
	ISecretManager,
	ICache,
	type IEncryptedPrivateTenantKeys,
} from "@fluidframework/server-services-core";
import { isNetworkError, NetworkError } from "@fluidframework/server-services-client";
import { BaseTelemetryProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import {
	IApiCounters,
	InMemoryApiCounters,
	ITenantKeyGenerator,
	isKeylessFluidAccessClaimEnabled,
	generateToken,
} from "@fluidframework/server-services-utils";
import * as jwt from "jsonwebtoken";
import * as _ from "lodash";
import * as winston from "winston";
import { ITenantRepository } from "./mongoTenantRepository";
import type { IUser, ScopeType } from "@fluidframework/protocol-definitions";
import { v4 as uuid } from "uuid";

/**
 * Tenant details stored to the document database
 * @internal
 */
export interface ITenantDocument {
	// Database ID for the tenant. Id is only marked optional because the database will provide it
	// on initial insert
	_id: string;

	// API key for the given tenant
	key?: string;

	// second key for the given tenant
	secondaryKey?: string;

	// Storage provider details
	storage: ITenantStorage;

	// Orderer details
	orderer: ITenantOrderer;

	// Custom data for tenant extensibility
	customData: ITenantCustomData;

	// Whether the tenant is disabled
	disabled: boolean;

	// Timestamp of when this tenant will be hard deleted.
	// Only applicable if the tenant is disabled.
	scheduledDeletionTime?: string;

	// Optional private keys, used for keyless tenants
	privateKeys?: ITenantPrivateKeys;
}

enum FetchTenantKeyMetric {
	RetrieveFromCacheSucess = "retrieveFromCacheSuccess",
	NotFoundInCache = "notFoundInCache",
	RetrieveFromCacheError = "retrieveFromCacheError",
	SetKeyInCacheSuccess = "settingKeyInCacheSucceeded",
	SetKeyInCacheFailure = "settingKeyInCacheFailed",
}

enum StorageRequestMetric {
	// Cache requests
	CacheRequestStarted = "cacheRequestStarted",
	CacheRequestCompleted = "cacheRequestCompleted",
	// Database requests
	DatabaseRequestStarted = "databaseRequestStarted",
	DatabaseRequestCompleted = "databaseRequestCompleted",
	// errors
	CacheError = "cacheError",
	DatabaseError = "databaseError",
}

/**
 * @internal
 */
export class TenantManager {
	private readonly isCacheEnabled;
	private readonly fetchTenantKeyApiCounter: IApiCounters = new InMemoryApiCounters(
		Object.values(FetchTenantKeyMetric),
	);
	private readonly storageRequestApiCounter: IApiCounters = new InMemoryApiCounters(
		Object.values(StorageRequestMetric),
	);
	constructor(
		private readonly tenantRepository: ITenantRepository,
		private readonly baseOrdererUrl: string,
		private readonly defaultHistorianUrl: string,
		private readonly defaultInternalHistorianUrl: string,
		private readonly secretManager: ISecretManager,
		private readonly fetchTenantKeyMetricInterval: number,
		private readonly riddlerStorageRequestMetricInterval: number,
		private readonly tenantKeyGenerator: ITenantKeyGenerator,
		private readonly cache?: ICache,
	) {
		this.isCacheEnabled = this.cache ? true : false;
		if (fetchTenantKeyMetricInterval) {
			setInterval(() => {
				if (!this.fetchTenantKeyApiCounter.countersAreActive) {
					return;
				}
				Lumberjack.info(
					"Fetch tenant key api counters",
					this.fetchTenantKeyApiCounter.getCounters(),
				);
				this.fetchTenantKeyApiCounter.resetAllCounters();
			}, this.fetchTenantKeyMetricInterval);
		}

		if (riddlerStorageRequestMetricInterval) {
			setInterval(() => {
				if (!this.storageRequestApiCounter.countersAreActive) {
					return;
				}
				Lumberjack.info(
					"Riddler storage request api counters",
					this.storageRequestApiCounter.getCounters(),
				);
				this.storageRequestApiCounter.resetAllCounters();
			}, this.riddlerStorageRequestMetricInterval);
		}
	}

	private isTenantPrivateKeyAccessEnabled(tenant: ITenantDocument): boolean {
		return tenant.privateKeys ? true : false;
	}

	// Currently key and secondary are not optional, but this is to make sure we don't break anything if they are optional in the future
	private isTenantSharedKeyAccessEnabled(tenant: ITenantDocument): boolean {
		return tenant.key || tenant.secondaryKey ? true : false;
	}

	public async signToken(
		tenantId: string,
		documentId: string,
		scopes: ScopeType[],
		user?: IUser,
		lifetime: number = 60 * 60,
		ver: string = "1.0",
		jti: string = uuid(),
		includeDisabledTenant = false,
	): Promise<string> {
		const tenant = await this.getTenantDocument(tenantId, includeDisabledTenant);
		if (tenant === undefined) {
			Lumberjack.error(`No tenant found when signing token for tenant id ${tenantId}`, {
				[BaseTelemetryProperties.tenantId]: tenantId,
			});
			throw new NetworkError(404, "Tenant is disabled or does not exist.");
		}

		const isTenantPrivateKeyAccessEnabled = this.isTenantPrivateKeyAccessEnabled(tenant);
		let keys: ITenantKeys;
		// If the tenant is a keyless tenant, always use the private keys to sign the token
		if (isTenantPrivateKeyAccessEnabled) {
			// If the tenant is a keyless tenant, privateKeys will always be defined
			keys = await this.returnPrivateKeysInOrder(
				tenantId,
				tenant.privateKeys as ITenantPrivateKeys,
				{},
			);
		} else {
			keys = {
				key1: tenant.key as string,
				key2: tenant.secondaryKey ?? "",
			};
		}
		const token = generateToken(
			tenantId,
			documentId,
			keys.key1,
			scopes,
			user,
			lifetime,
			ver,
			jti,
			isTenantPrivateKeyAccessEnabled,
		);

		return token;
	}

	/**
	 * Validates a tenant's API token
	 */
	public async validateToken(
		tenantId: string,
		token: string,
		includeDisabledTenant = false,
		bypassCache = false,
	): Promise<void> {
		const isKeylessAccessValidation = isKeylessFluidAccessClaimEnabled(token);
		const tenantKeys = await this.getTenantKeys(
			tenantId,
			includeDisabledTenant,
			false,
			isKeylessAccessValidation,
		);
		const lumberProperties = {
			[BaseTelemetryProperties.tenantId]: tenantId,
			includeDisabledTenant,
		};

		// Try validating with Key 1
		try {
			await this.validateTokenWithKey(tenantKeys.key1, KeyName.key1, token);
			return;
		} catch (error) {
			if (isNetworkError(error)) {
				if (error.code === 403 && !tenantKeys.key2) {
					// Delete key from cache when there is a 403 error and no key2 to validate
					if (!bypassCache && this.isCacheEnabled) {
						Lumberjack.info(
							`Error with tenant key 1 token verification while key 2 is not present. Deleting key from cache.`,
							lumberProperties,
						);
						await this.deleteKeyFromCache(tenantId, isKeylessAccessValidation).catch(
							(err) => {
								Lumberjack.error(
									`Error deleting keys from the cache.`,
									lumberProperties,
									err,
								);
							},
						);
					}
					throw error;
				}
				if (error.code === 401 || !tenantKeys.key2) {
					// Trying key2 with an expired token won't help.
					// Also, if there is no key2, don't bother validating.
					throw error;
				}
			}
		}
		// If Key 1 validation fails, try with Key 2
		try {
			await this.validateTokenWithKey(tenantKeys.key2, KeyName.key2, token);
		} catch (error) {
			if (isNetworkError(error)) {
				if (error.code === 403) {
					// Delete key from cache on 403
					if (!bypassCache && this.isCacheEnabled) {
						// We tried reading from the cache and it failed
						Lumberjack.info(
							`Error with key 2 token validation. Deleting key from cache.`,
							lumberProperties,
						);
						await this.deleteKeyFromCache(tenantId, isKeylessAccessValidation).catch(
							(err) => {
								Lumberjack.error(
									`Error deleting keys from the cache.`,
									lumberProperties,
									err,
								);
							},
						);
						// Assume we used a cached key, and try again by bypassing cache.
						return this.validateToken(
							tenantId,
							token,
							includeDisabledTenant,
							true, // bypasses cache on retry
						);
					}
				}
				throw error;
			}
		}
	}

	/**
	 * Validates a given token with the tenantKey
	 */
	private async validateTokenWithKey(
		key: string,
		keyName: string,
		token: string,
	): Promise<boolean> {
		return new Promise<boolean>((resolve, reject) => {
			jwt.verify(token, key, (error) => {
				// token verified, return
				if (!error) {
					resolve(true);
					return;
				}
				// When `exp` claim exists in token claims, jsonwebtoken verifies token expiration.

				if (error instanceof jwt.TokenExpiredError) {
					reject(new NetworkError(401, `Token expired validated with ${keyName}.`));
				} else {
					reject(new NetworkError(403, `Invalid token validated with ${keyName}.`));
				}
			});
		});
	}

	/**
	 * Retrieves the details for the given tenant
	 */
	public async getTenant(
		tenantId: string,
		includeDisabledTenant = false,
	): Promise<ITenantConfig> {
		const tenant = await this.getTenantDocument(tenantId, includeDisabledTenant);
		if (!tenant) {
			winston.error("Tenant is disabled or does not exist.");
			Lumberjack.error("Tenant is disabled or does not exist.", {
				[BaseTelemetryProperties.tenantId]: tenantId,
			});
			throw new NetworkError(404, "Tenant is disabled or does not exist.");
		}

		const accessInfo = tenant.customData.externalStorageData?.accessInfo;
		if (accessInfo) {
			tenant.customData.externalStorageData.accessInfo = this.decryptAccessInfo(accessInfo);
		}

		return this.buildTenantConfig(tenant);
	}

	/**
	 * Retrieves the details for all tenants
	 */
	public async getAllTenants(includeDisabledTenant = false): Promise<ITenantConfig[]> {
		const tenants = await this.getAllTenantDocuments(includeDisabledTenant);

		return tenants.map((tenant) => this.buildTenantConfig(tenant));
	}

	private async createTenantKeys(
		tenantId: string,
		latestKeyVersion: EncryptionKeyVersion,
		createPrivateKeys = false,
	): Promise<IPlainTextAndEncryptedTenantKeys | ITenantPrivateKeys> {
		const tenantKey = this.tenantKeyGenerator.generateTenantKey();
		const encryptedTenantKey = this.secretManager.encryptSecret(tenantKey, latestKeyVersion);
		if (encryptedTenantKey == null) {
			winston.error("Private tenant key encryption failed.");
			Lumberjack.error("Private tenant key encryption failed.", {
				[BaseTelemetryProperties.tenantId]: tenantId,
			});
			throw new NetworkError(500, "Private tenant key encryption failed.");
		}

		const secondaryTenantKey = this.tenantKeyGenerator.generateTenantKey();
		const encryptedSecondaryTenantKey = this.secretManager.encryptSecret(
			secondaryTenantKey,
			latestKeyVersion,
		);
		if (encryptedSecondaryTenantKey == null) {
			winston.error("Private secondary tenant key encryption failed.");
			Lumberjack.error("Private secondary tenant key encryption failed.", {
				[BaseTelemetryProperties.tenantId]: tenantId,
			});
			throw new NetworkError(500, "Private secondary tenant key encryption failed.");
		}

		if (createPrivateKeys) {
			// Current time in seconds
			const now = Math.round(new Date().getTime() / 1000);
			// Initial key rotation time is 12 hours from now, secondary key is 24 hours from now
			const privateKeys: ITenantPrivateKeys = {
				key: encryptedTenantKey,
				keyNextRotationTime: now + (24 * 60 * 60) / 2, // 12 hours from now
				secondaryKey: encryptedSecondaryTenantKey,
				secondaryKeyNextRotationTime: now + 24 * 60 * 60, // 24 hours from now
			};
			// Set the key to use in the cache, this changes based on the rotation time
			await this.cache?.set(`${this.getRedisKeyPrefix(tenantId, true)}:keyToUse`, "primary");
			return privateKeys;
		}

		const tenantKeys: IPlainTextAndEncryptedTenantKeys = {
			key1: tenantKey,
			key2: secondaryTenantKey,
			encryptedTenantKey1: encryptedTenantKey,
			encryptedTenantKey2: encryptedSecondaryTenantKey,
		};

		return tenantKeys;
	}

	/**
	 * Creates a new tenant
	 */
	public async createTenant(
		tenantId: string,
		storage: ITenantStorage,
		orderer: ITenantOrderer,
		customData: ITenantCustomData,
		enableSharedKeyAccess = true,
		enablePrivateKeyAccess = false,
	): Promise<ITenantConfig & { key: string | undefined }> {
		const latestKeyVersion = this.secretManager.getLatestKeyVersion();
		if (!enableSharedKeyAccess && !enablePrivateKeyAccess) {
			Lumberjack.error(
				"Cannot create a tenant with both shared and private key access disabled",
				{
					[BaseTelemetryProperties.tenantId]: tenantId,
				},
			);
			throw new NetworkError(
				400,
				"Cannot create a tenant with both shared and private key access disabled",
			);
		}

		let tenantKeys: IPlainTextAndEncryptedTenantKeys | undefined;
		if (enableSharedKeyAccess) {
			tenantKeys = (await this.createTenantKeys(
				tenantId,
				latestKeyVersion,
			)) as IPlainTextAndEncryptedTenantKeys;
		}
		let privateKeys: ITenantPrivateKeys | undefined;
		if (enablePrivateKeyAccess) {
			privateKeys = (await this.createTenantKeys(
				tenantId,
				latestKeyVersion,
				true /* createPrivateKeys */,
			)) as ITenantPrivateKeys;
		}

		// New tenant keys will be encrypted with incoming key version.
		if (latestKeyVersion) {
			customData.encryptionKeyVersion = latestKeyVersion;
		}

		const id = await this.runWithDatabaseRequestCounter(async () =>
			this.tenantRepository.insertOne({
				_id: tenantId,
				key: tenantKeys?.encryptedTenantKey1,
				secondaryKey: tenantKeys?.encryptedTenantKey2,
				orderer,
				storage,
				customData,
				disabled: false,
				privateKeys,
			}),
		);

		const tenant = await this.getTenant(id);
		return _.extend(tenant, {
			key: tenantKeys?.key1,
			secondaryKey: tenantKeys?.key2,
		});
	}

	/**
	 * Updates the tenant configured storage provider
	 */
	public async updateStorage(tenantId: string, storage: ITenantStorage): Promise<ITenantStorage> {
		await this.runWithDatabaseRequestCounter(async () =>
			this.tenantRepository.update({ _id: tenantId }, { storage }, null),
		);

		const tenantDocument = await this.getTenantDocument(tenantId);

		if (tenantDocument === undefined) {
			Lumberjack.error("Could not find tenantId after updating storage.", {
				[BaseTelemetryProperties.tenantId]: tenantId,
			});
			throw new NetworkError(404, `Could not find updated tenant: ${tenantId}`);
		}

		return tenantDocument.storage;
	}

	private buildTenantConfig(tenantDocument: ITenantDocument): ITenantConfig {
		return {
			id: tenantDocument._id,
			orderer: tenantDocument.orderer,
			storage: tenantDocument.storage,
			customData: tenantDocument.customData,
			scheduledDeletionTime: tenantDocument.scheduledDeletionTime,
			enablePrivateKeyAccess: this.isTenantPrivateKeyAccessEnabled(tenantDocument),
			enableSharedKeyAccess: this.isTenantSharedKeyAccessEnabled(tenantDocument),
		};
	}

	public async updateKeyAccessPolicy(
		tenantId: string,
		enablePrivateKeyAccess: boolean,
		enableSharedKeyAccess: boolean,
	): Promise<ITenantConfig> {
		const latestKeyVersion = this.secretManager.getLatestKeyVersion();
		const tenantDocument = await this.getTenantDocument(tenantId);
		if (tenantDocument === undefined) {
			Lumberjack.error("Could not find tenantId.", {
				[BaseTelemetryProperties.tenantId]: tenantId,
			});
			throw new NetworkError(404, `Could not find tenant: ${tenantId}`);
		}

		let privateKeys: ITenantPrivateKeys | undefined;
		let sharedKeys: IPlainTextAndEncryptedTenantKeys | undefined;
		const updates: Partial<ITenantDocument> = {};
		const isTenantPrivateKeyAccessEnabled =
			this.isTenantPrivateKeyAccessEnabled(tenantDocument);
		const isTenantSharedKeyAccessEnabled = this.isTenantSharedKeyAccessEnabled(tenantDocument);
		if (enablePrivateKeyAccess) {
			// If the tenant is being converted to a keyless tenant, generate new private keys, otherwise update them to be undefined
			if (!isTenantPrivateKeyAccessEnabled) {
				privateKeys = (await this.createTenantKeys(
					tenantId,
					latestKeyVersion,
					true /* createPrivateKeys */,
				)) as ITenantPrivateKeys;
				updates.privateKeys = privateKeys;
			}
		} else {
			if (isTenantPrivateKeyAccessEnabled) {
				updates.privateKeys = undefined;
				await this.deleteKeyFromCache(tenantId, true /* deletePrivateKeys */);
			}
		}

		if (enableSharedKeyAccess) {
			if (!isTenantSharedKeyAccessEnabled) {
				sharedKeys = (await this.createTenantKeys(
					tenantId,
					latestKeyVersion,
				)) as IPlainTextAndEncryptedTenantKeys;
				updates.key = sharedKeys.encryptedTenantKey1;
				updates.secondaryKey = sharedKeys.encryptedTenantKey2;
			}
		} else {
			if (isTenantSharedKeyAccessEnabled) {
				updates.key = undefined;
				updates.secondaryKey = undefined;
				await this.deleteKeyFromCache(tenantId, false /* deleteSharedKeys */);
			}
		}

		// Only update the tenant in the DB if there are changes to be made
		if (Object.keys(updates).length > 0) {
			await this.runWithDatabaseRequestCounter(async () =>
				this.tenantRepository.update({ _id: tenantId }, updates, null),
			);
		} else {
			return this.buildTenantConfig(tenantDocument);
		}

		const updatedtenantDocument = await this.getTenantDocument(tenantId);
		if (updatedtenantDocument === undefined) {
			Lumberjack.error("Could not find tenantId after updating private key access policy.", {
				[BaseTelemetryProperties.tenantId]: tenantId,
			});
			throw new NetworkError(404, `Could not find updated tenant: ${tenantId}`);
		}
		return this.buildTenantConfig(updatedtenantDocument);
	}

	/**
	 * Updates the tenant configured orderer
	 */
	public async updateOrderer(tenantId: string, orderer: ITenantOrderer): Promise<ITenantOrderer> {
		await this.tenantRepository.update({ _id: tenantId }, { orderer }, null);

		const tenantDocument = await this.getTenantDocument(tenantId);

		if (tenantDocument === undefined) {
			Lumberjack.error("Could not find tenantId after updating orderer.", {
				[BaseTelemetryProperties.tenantId]: tenantId,
			});
			throw new NetworkError(404, `Could not find updated tenant: ${tenantId}`);
		}

		return tenantDocument.orderer;
	}

	/**
	 * Updates the tenant custom data object
	 */
	public async updateCustomData(
		tenantId: string,
		customData: ITenantCustomData,
	): Promise<ITenantCustomData> {
		const accessInfo = customData.externalStorageData?.accessInfo;
		if (accessInfo) {
			customData.externalStorageData.accessInfo = this.encryptAccessInfo(accessInfo);
		}
		await this.runWithDatabaseRequestCounter(async () =>
			this.tenantRepository.update({ _id: tenantId }, { customData }, null),
		);
		const tenantDocument = await this.getTenantDocument(tenantId, true);
		if (tenantDocument === undefined) {
			Lumberjack.error("Could not find tenantId after updating custom data.", {
				[BaseTelemetryProperties.tenantId]: tenantId,
			});
			throw new NetworkError(404, `Could not find updated tenant: ${tenantId}`);
		}
		if (tenantDocument.disabled === true) {
			Lumberjack.info("Updated custom data of a disabled tenant", {
				[BaseTelemetryProperties.tenantId]: tenantId,
			});
		}
		return tenantDocument.customData;
	}

	// This method returns the private keys in the order they should be used to validate/sign tokens
	private async returnPrivateKeysInOrder(
		tenantId: string,
		privateKeys: ITenantPrivateKeys,
		lumberProperties: any,
	): Promise<ITenantKeys> {
		const currKeyInUse = await this.cache?.get(
			`${this.getRedisKeyPrefix(tenantId, true)}:keyToUse`,
		);
		// If the key to use is not found in the cache, return the keys in the order they are stored in the database
		if (!currKeyInUse) {
			Lumberjack.error("Could not find the current key to use in cache", lumberProperties);
			await this.cache?.set(`${this.getRedisKeyPrefix(tenantId, true)}:keyToUse`, "primary");
			return {
				key1: privateKeys.key,
				key2: privateKeys.secondaryKey,
			};
		}
		const now = Math.round(new Date().getTime() / 1000);

		// Determine which key to use as "key1" based on rotation time
		// If the key being used as key1 is the primary key and it is due to be rotated in the next hour, use the secondary key as key1
		if (
			currKeyInUse === "primary" &&
			Math.abs(now - privateKeys.keyNextRotationTime) <= 60 * 60
		) {
			Lumberjack.info(
				`Primary private key is due to be rotated in the next hour for tenant id ${tenantId}, using the secondary key as key1`,
				lumberProperties,
			);
			await this.cache?.set(
				`${this.getRedisKeyPrefix(tenantId, true)}:keyToUse`,
				"secondary",
			);
			return {
				key1: privateKeys.secondaryKey,
				key2: privateKeys.key,
			};
		}

		// If the key being used as key1 is the secondary key and it is due to be rotated in the next hour, use the primary key as key1
		if (
			currKeyInUse === "secondary" &&
			Math.abs(now - privateKeys.secondaryKeyNextRotationTime) <= 60 * 60
		) {
			Lumberjack.info(
				`Secondary private key is due to be rotated in the next hour for tenant id ${tenantId}, using the primary key as key1`,
				lumberProperties,
			);
			await this.cache?.set(`${this.getRedisKeyPrefix(tenantId, true)}:keyToUse`, "primary");
			return {
				key1: privateKeys.key,
				key2: privateKeys.secondaryKey,
			};
		}

		// If none of the keys are due to be rotated in the next hour, use the key that is currently being used as key1
		Lumberjack.info(`Using the ${currKeyInUse} key to use as key1`, lumberProperties);
		const keys: ITenantKeys = {
			key1: currKeyInUse === "primary" ? privateKeys.key : privateKeys.secondaryKey,
			key2: currKeyInUse === "primary" ? privateKeys.secondaryKey : privateKeys.key,
		};
		return keys;
	}

	private async getTenantKeysHelper(
		tenantId: string,
		includeDisabledTenant = false,
		bypassCache = false,
		usePrivateKeys = false,
	): Promise<ITenantKeys> {
		const lumberProperties = {
			[BaseTelemetryProperties.tenantId]: tenantId,
			includeDisabledTenant,
			bypassCache,
			usePrivateKeys,
		};
		try {
			if (!bypassCache && this.isCacheEnabled) {
				// Read from cache first
				try {
					const cachedKey = await this.getKeyFromCache(tenantId, usePrivateKeys);
					if (cachedKey) {
						let tenantKeys = this.decryptCachedKeys(cachedKey, usePrivateKeys);
						// This is an edge case where the used encryption key is not valid.
						// If both decrypted tenant keys are null, it means it hits this case,
						// then we should read from database and set new values in cache.
						if (usePrivateKeys) {
							tenantKeys = tenantKeys as ITenantPrivateKeys;
							if (tenantKeys.key || tenantKeys.secondaryKey) {
								const privateKeysInOrder = await this.returnPrivateKeysInOrder(
									tenantId,
									tenantKeys,
									lumberProperties,
								);
								return privateKeysInOrder;
							}
						} else {
							tenantKeys = tenantKeys as ITenantKeys;
							if (tenantKeys.key1 || tenantKeys.key2) {
								return tenantKeys;
							}
						}
						Lumberjack.info(
							"Retrieved from cache but both decrypted tenant keys are null.",
							lumberProperties,
						);
					}
				} catch (error) {
					// Catch if there is an error reading from redis so we can continue to use the database
					Lumberjack.error(
						`Error getting tenant keys from cache. Falling back to database.`,
						{ [BaseTelemetryProperties.tenantId]: tenantId },
						error,
					);
				}
			}

			// Read from database if keys aren't found in the cache
			const tenantDocument = await this.getTenantDocument(tenantId, includeDisabledTenant);

			if (!tenantDocument) {
				winston.error(`No tenant found when retrieving keys for tenant id ${tenantId}`);
				Lumberjack.error(`No tenant found when retrieving keys for tenant id ${tenantId}`, {
					[BaseTelemetryProperties.tenantId]: tenantId,
				});
				throw new NetworkError(403, `Tenant, ${tenantId}, does not exist.`);
			}

			if (!this.isTenantSharedKeyAccessEnabled(tenantDocument) && !usePrivateKeys) {
				Lumberjack.error(`Shared keys are disabled for tenant id ${tenantId}`, {
					[BaseTelemetryProperties.tenantId]: tenantId,
				});
				throw new NetworkError(403, `Shared keys are disabled for tenant id ${tenantId}`);
			}

			if (usePrivateKeys && !tenantDocument.privateKeys) {
				Lumberjack.error(`Private keys are missing for tenant id ${tenantId}`, {
					[BaseTelemetryProperties.tenantId]: tenantId,
				});
				throw new NetworkError(404, `Private keys are missing for tenant id ${tenantId}`);
			}

			const encryptedTenantKey1 =
				usePrivateKeys && tenantDocument.privateKeys
					? tenantDocument.privateKeys.key
					: (tenantDocument.key as string);

			const encryptionKeyVersion = tenantDocument.customData?.encryptionKeyVersion;
			const tenantKey1 = this.secretManager.decryptSecret(
				encryptedTenantKey1,
				encryptionKeyVersion,
			);

			if (tenantKey1 == null) {
				winston.error("Tenant key1 decryption failed.");
				Lumberjack.error("Tenant key1 decryption failed.", lumberProperties);
				throw new NetworkError(500, "Tenant key1 decryption failed.");
			}

			const encryptedTenantKey2 =
				usePrivateKeys && tenantDocument.privateKeys
					? tenantDocument.privateKeys.secondaryKey
					: tenantDocument.secondaryKey ?? "";

			const tenantKey2 = encryptedTenantKey2
				? this.secretManager.decryptSecret(encryptedTenantKey2, encryptionKeyVersion)
				: "";

			// Tenant key 2 decryption returns null
			if (tenantKey2 == null) {
				winston.error("Tenant key2 decryption failed");
				Lumberjack.error("Tenant key2 decryption failed.", lumberProperties);
				throw new NetworkError(500, "Tenant key2 decryption failed.");
			}

			// If it looks like there is key2, but decrypted key == ""
			if (!encryptedTenantKey2 || tenantKey2 === "") {
				winston.info("Tenant key2 doesn't exist.");
				Lumberjack.info("Tenant key2 doesn't exist.", lumberProperties);
			}

			if (!bypassCache && this.isCacheEnabled) {
				const cacheKeys: IEncryptedTenantKeys | IEncryptedPrivateTenantKeys =
					usePrivateKeys && tenantDocument.privateKeys
						? {
								key: encryptedTenantKey1,
								keyNextRotationTime: tenantDocument.privateKeys.keyNextRotationTime,
								secondaryKey: encryptedTenantKey2,
								secondaryKeyNextRotationTime:
									tenantDocument.privateKeys.secondaryKeyNextRotationTime,
						  }
						: {
								key1: encryptedTenantKey1,
								key2: encryptedTenantKey2,
						  };
				if (encryptionKeyVersion) {
					cacheKeys.encryptionKeyVersion = encryptionKeyVersion;
				}
				await this.setKeyInCache(tenantId, cacheKeys, usePrivateKeys);
			}

			if (usePrivateKeys && tenantDocument.privateKeys) {
				// Return the decrypted private keys in the order they should be used to validate/sign tokens
				const privateTenantKeys: ITenantPrivateKeys = {
					key: tenantKey1,
					keyNextRotationTime: tenantDocument.privateKeys.keyNextRotationTime,
					secondaryKey: tenantKey2,
					secondaryKeyNextRotationTime:
						tenantDocument.privateKeys.secondaryKeyNextRotationTime,
				};
				const privateKeysInOrder = await this.returnPrivateKeysInOrder(
					tenantId,
					privateTenantKeys,
					lumberProperties,
				);
				return privateKeysInOrder;
			}
			return {
				key1: tenantKey1,
				key2: tenantKey2,
			};
		} catch (error) {
			Lumberjack.error(`Error getting tenant keys.`, lumberProperties, error);
			throw error;
		}
	}

	/**
	 * Retrieves the secret for the given tenant
	 */
	public async getTenantKeys(
		tenantId: string,
		includeDisabledTenant = false,
		bypassCache = false,
		usePrivateKeys = false,
	): Promise<ITenantKeys> {
		const keys = await this.getTenantKeysHelper(
			tenantId,
			includeDisabledTenant,
			bypassCache,
			usePrivateKeys,
		);
		return keys;
	}

	/**
	 * Generates a new key for a tenant
	 */
	public async refreshTenantKey(
		tenantId: string,
		keyName: string,
		refreshPrivateKey = false,
	): Promise<ITenantKeys> {
		if (keyName !== KeyName.key1 && keyName !== KeyName.key2) {
			throw new NetworkError(400, "Key name must be either key1 or key2.");
		}

		const tenantDocument = await this.getTenantDocument(tenantId, false);
		if (tenantDocument === undefined) {
			Lumberjack.error(`Could not find tenantId when refreshing tenant key.`, {
				[BaseTelemetryProperties.tenantId]: tenantId,
			});
			throw new NetworkError(404, `Could not find tenantId: ${tenantId}`);
		}

		if (!this.isTenantSharedKeyAccessEnabled(tenantDocument) && !refreshPrivateKey) {
			Lumberjack.error(`Shared keys are disabled for tenant id ${tenantId}`, {
				[BaseTelemetryProperties.tenantId]: tenantId,
			});
			throw new NetworkError(403, `Shared keys are disabled for tenant id ${tenantId}`);
		}

		const newTenantKey = this.tenantKeyGenerator.generateTenantKey();
		const encryptionKeyVersion = tenantDocument.customData?.encryptionKeyVersion;
		const encryptedNewTenantKey = this.secretManager.encryptSecret(
			newTenantKey,
			encryptionKeyVersion,
		);
		if (encryptedNewTenantKey == null) {
			winston.error("Tenant key encryption failed.");
			Lumberjack.error("Tenant key encryption failed.", {
				[BaseTelemetryProperties.tenantId]: tenantId,
			});
			throw new NetworkError(500, "Tenant key encryption failed.");
		}

		// Delete old key from the cache
		if (this.isCacheEnabled) {
			Lumberjack.info(`Deleting old key from cache`, {
				[BaseTelemetryProperties.tenantId]: tenantId,
			});
			await this.deleteKeyFromCache(tenantId, refreshPrivateKey);
		}

		if (refreshPrivateKey) {
			const newKeyNextRotationTime = Math.round(new Date().getTime() / 1000) + 24 * 60 * 60;
			const existingPrivateKeys = tenantDocument.privateKeys;
			if (!existingPrivateKeys) {
				Lumberjack.error(`Private keys are missing for tenant id ${tenantId}`, {
					[BaseTelemetryProperties.tenantId]: tenantId,
				});
				throw new NetworkError(404, `Private keys are missing for tenant id ${tenantId}`);
			}
			const privateKeys: ITenantPrivateKeys =
				keyName === KeyName.key2
					? {
							key: existingPrivateKeys.key,
							keyNextRotationTime: existingPrivateKeys.keyNextRotationTime,
							secondaryKey: encryptedNewTenantKey,
							secondaryKeyNextRotationTime: newKeyNextRotationTime,
					  }
					: {
							key: encryptedNewTenantKey,
							keyNextRotationTime: newKeyNextRotationTime,
							secondaryKey: existingPrivateKeys.secondaryKey,
							secondaryKeyNextRotationTime:
								existingPrivateKeys.secondaryKeyNextRotationTime,
					  };
			await this.runWithDatabaseRequestCounter(async () =>
				this.tenantRepository.update({ _id: tenantId }, { privateKeys }, null),
			);
			const cacheKeys: IEncryptedPrivateTenantKeys = {
				key: privateKeys.key,
				keyNextRotationTime: privateKeys.keyNextRotationTime,
				secondaryKey: privateKeys.secondaryKey,
				secondaryKeyNextRotationTime: privateKeys.secondaryKeyNextRotationTime,
			};
			if (encryptionKeyVersion) {
				cacheKeys.encryptionKeyVersion = encryptionKeyVersion;
			}
			await this.setKeyInCache(tenantId, cacheKeys, true /* setPrivateKeys */);
			// Do not return private keys, instead just update the DB and return empty keys
			return {
				key1: "",
				key2: "",
			};
		}

		const tenantKeys = await this.getUpdatedTenantKeys(
			tenantDocument.key as string,
			tenantDocument.secondaryKey as string,
			keyName,
			newTenantKey,
			tenantId,
			encryptionKeyVersion,
		);

		const updateKey =
			keyName === KeyName.key2
				? { secondaryKey: encryptedNewTenantKey }
				: { key: encryptedNewTenantKey };
		await this.runWithDatabaseRequestCounter(async () =>
			this.tenantRepository.update({ _id: tenantId }, updateKey, null),
		);

		return tenantKeys;
	}

	/**
	 * Gets updated 2 tenant keys after refresh.
	 */
	private async getUpdatedTenantKeys(
		key1: string,
		key2: string,
		keyName: string,
		newTenantKey: string,
		tenantId: string,
		encryptionKeyVersion?: EncryptionKeyVersion,
	): Promise<ITenantKeys> {
		const lumberProperties = { [BaseTelemetryProperties.tenantId]: tenantId };
		// if key2 is to be refreshed
		if (keyName === KeyName.key2) {
			const decryptedTenantKey1 = this.secretManager.decryptSecret(
				key1,
				encryptionKeyVersion,
			);
			if (decryptedTenantKey1 == null) {
				winston.error("Tenant key1 decryption failed.");
				Lumberjack.error("Tenant key1 decryption failed.", lumberProperties);
				throw new NetworkError(500, "Tenant key1 decryption failed.");
			}

			// Only create and set keys in cache if it is enabled
			if (this.isCacheEnabled) {
				const cacheKeys: IEncryptedTenantKeys = {
					key1,
					key2: this.secretManager.encryptSecret(newTenantKey, encryptionKeyVersion),
				};
				if (encryptionKeyVersion) {
					cacheKeys.encryptionKeyVersion = encryptionKeyVersion;
				}
				await this.setKeyInCache(tenantId, cacheKeys);
			}

			return {
				key1: decryptedTenantKey1,
				key2: newTenantKey,
			};
		}

		// below is if key1 is to be refreshed
		// if key2 doesn't exist, no need to decrypt
		if (!key2) {
			winston.info("Tenant key2 doesn't exist.");
			Lumberjack.info("Tenant key2 doesn't exist.", {
				[BaseTelemetryProperties.tenantId]: tenantId,
			});

			// Only create and set keys in cache if it is enabled
			if (this.isCacheEnabled) {
				const cacheKey1: IEncryptedTenantKeys = {
					key1: this.secretManager.encryptSecret(newTenantKey),
					key2: "",
				};
				if (encryptionKeyVersion) {
					cacheKey1.encryptionKeyVersion = encryptionKeyVersion;
				}
				await this.setKeyInCache(tenantId, cacheKey1);
				Lumberjack.info(`Added new key to cache.`, lumberProperties);
			}

			return {
				key1: newTenantKey,
				key2: "",
			};
		}

		// if key2 exists, refresh key1 and return
		const decryptedTenantKey2 = this.secretManager.decryptSecret(key2, encryptionKeyVersion);
		if (decryptedTenantKey2 == null) {
			winston.error("Tenant key2 decryption failed.");
			Lumberjack.error("Tenant key2 decryption failed.", {
				[BaseTelemetryProperties.tenantId]: tenantId,
			});
			throw new NetworkError(500, "Tenant key2 decryption failed.");
		}
		return {
			key1: newTenantKey,
			key2: decryptedTenantKey2,
		};
	}

	/**
	 * Attaches fields to older tenants to provide backwards compatibility.
	 * Will be removed at some point.
	 */
	private attachDefaultsToTenantDocument(tenantDocument: ITenantDocument): void {
		// Ordering information was historically not included with the tenant. In the case where it is empty
		// we default it to the kafka orderer at the base server URL.
		if (!tenantDocument.orderer) {
			tenantDocument.orderer = {
				type: "kafka",
				url: this.baseOrdererUrl,
			};
		}

		// Older tenants did not include the historian endpoint in their storage configuration since this
		// was always assumed to be a static value.
		if (tenantDocument.storage && !tenantDocument.storage.historianUrl) {
			tenantDocument.storage.historianUrl = this.defaultHistorianUrl;
			tenantDocument.storage.internalHistorianUrl = this.defaultInternalHistorianUrl;
		}

		// Older tenants do not include the custom data object. Setting it as an empty object
		// avoids errors down the line.
		if (!tenantDocument.customData) {
			tenantDocument.customData = {};
		}
	}

	/**
	 * Retrieves the raw database tenant document
	 */
	private async getTenantDocument(
		tenantId: string,
		includeDisabledTenant = false,
	): Promise<ITenantDocument | undefined> {
		const found = await this.runWithDatabaseRequestCounter(async () =>
			this.tenantRepository.findOne({ _id: tenantId }),
		);
		if (!found || (found.disabled && !includeDisabledTenant)) {
			return undefined;
		}

		this.attachDefaultsToTenantDocument(found);

		return found;
	}

	/**
	 * Retrieves all the raw database tenant documents
	 */
	private async getAllTenantDocuments(includeDisabledTenant = false): Promise<ITenantDocument[]> {
		const allFound: ITenantDocument[] = [];
		let batchOffsetId = "";
		const batchFetchSize = 2000;
		try {
			// eslint-disable-next-line no-constant-condition
			while (true) {
				// Avoid using findAll(), it will read all records from database and load in client side memory,
				// which will be a concern for timing, networkIO, and client memory in the future
				// Also we have a limit of 2000 records when using find() implicitly, we should use this mechanism to
				// work around it to get the full results.
				const tenantDocumentBatch = await this.getTenantDocumentsByBatch(
					batchOffsetId,
					batchFetchSize,
				);
				allFound.push(...tenantDocumentBatch);
				const batchSize = tenantDocumentBatch.length;
				if (batchSize < batchFetchSize) {
					// last batch, no need further.
					break;
				}
				batchOffsetId = tenantDocumentBatch[batchSize - 1]._id;
			}
		} catch (err) {
			Lumberjack.error(`Database failed to find all tenants.`, undefined, err);
			return Promise.reject(new Error("Failed to retrieve all tenants from Database."));
		}

		allFound.forEach((found) => {
			this.attachDefaultsToTenantDocument(found);
		});

		return includeDisabledTenant ? allFound : allFound.filter((found) => !found.disabled);
	}

	/**
	 * Retrieves raw database tenant documents by batch
	 */
	private async getTenantDocumentsByBatch(
		batchOffsetId: string,
		batchSize: number,
	): Promise<ITenantDocument[]> {
		const query = {
			_id: { $gt: batchOffsetId },
		};
		const sort = { _id: 1 };
		return this.tenantRepository.find(query, sort, batchSize);
	}

	/**
	 * Deletes a tenant
	 * @param tenantId - Id of the tenant to delete.
	 * @param scheduledDeletionTime - If present, indicates when to hard-delete the tenant.
	 * If no scheduledDeletionTime is provided the tenant is only soft-deleted.
	 */
	public async deleteTenant(tenantId: string, scheduledDeletionTime?: Date): Promise<void> {
		const softDelete = !scheduledDeletionTime || scheduledDeletionTime.getTime() > Date.now();
		if (softDelete) {
			const query = {
				_id: tenantId,
				disabled: false,
			};

			await this.runWithDatabaseRequestCounter(async () =>
				this.tenantRepository.update(
					query,
					{
						disabled: true,
						scheduledDeletionTime: scheduledDeletionTime?.toJSON(),
					},
					null,
				),
			);
		} else {
			await this.runWithDatabaseRequestCounter(async () =>
				this.tenantRepository.deleteOne({ _id: tenantId }),
			);
		}
		// invalidate cache
		await this.deleteKeyFromCache(tenantId);
		// invalidate private keys cache
		await this.deleteKeyFromCache(tenantId, true /* deletePrivateKeys */);
	}

	private encryptAccessInfo(accessInfo: any): string {
		const encryptedAccessInfo = this.secretManager.encryptSecret(JSON.stringify(accessInfo));
		return encryptedAccessInfo;
	}

	private decryptAccessInfo(encryptedAccessInfo: string): any {
		const accessInfo = JSON.parse(this.secretManager.decryptSecret(encryptedAccessInfo));
		return accessInfo;
	}

	private decryptCachedKeys(
		cachedKey: string,
		decryptPrivateKeys = false,
	): ITenantKeys | ITenantPrivateKeys {
		const keys = JSON.parse(cachedKey);
		const encryptionKeyVersion = keys.encryptionKeyVersion ?? undefined;
		if (decryptPrivateKeys) {
			const decryptedPrivateKeys: ITenantPrivateKeys = {
				key: this.secretManager.decryptSecret(keys.key, encryptionKeyVersion),
				keyNextRotationTime: keys.keyNextRotationTime,
				secondaryKey: this.secretManager.decryptSecret(
					keys.secondaryKey,
					encryptionKeyVersion,
				),
				secondaryKeyNextRotationTime: keys.secondaryKeyNextRotationTime,
			};
			return decryptedPrivateKeys;
		}
		return keys.key2 === ""
			? {
					key1: this.secretManager.decryptSecret(keys.key1, encryptionKeyVersion),
					key2: "",
			  }
			: {
					key1: this.secretManager.decryptSecret(keys.key1, encryptionKeyVersion),
					key2: this.secretManager.decryptSecret(keys.key2, encryptionKeyVersion),
			  };
	}

	private async runWithCacheRequestCounter<T>(api: () => Promise<T>) {
		this.storageRequestApiCounter.incrementCounter(StorageRequestMetric.CacheRequestStarted);
		try {
			const result = await api();
			this.storageRequestApiCounter.incrementCounter(
				StorageRequestMetric.CacheRequestCompleted,
			);
			return result;
		} catch (error) {
			this.storageRequestApiCounter.incrementCounter(StorageRequestMetric.CacheError);
			throw error;
		}
	}

	private async runWithDatabaseRequestCounter<T>(api: () => Promise<T>) {
		this.storageRequestApiCounter.incrementCounter(StorageRequestMetric.DatabaseRequestStarted);
		try {
			const result = await api();
			this.storageRequestApiCounter.incrementCounter(
				StorageRequestMetric.DatabaseRequestCompleted,
			);
			return result;
		} catch (error) {
			this.storageRequestApiCounter.incrementCounter(StorageRequestMetric.DatabaseError);
			throw error;
		}
	}

	private getRedisKeyPrefix(tenantId: string, arePrivateKeys = false): string {
		return arePrivateKeys ? `privateTenantKeys:${tenantId}` : `tenantKeys:${tenantId}`;
	}

	private async getKeyFromCache(
		tenantId: string,
		usePrivateKeys = false,
	): Promise<string | undefined> {
		try {
			const cachedKey = await this.runWithCacheRequestCounter(
				async () => this.cache?.get(this.getRedisKeyPrefix(tenantId, usePrivateKeys)),
			);

			if (cachedKey == null) {
				this.fetchTenantKeyApiCounter.incrementCounter(
					FetchTenantKeyMetric.NotFoundInCache,
				);
			} else {
				this.fetchTenantKeyApiCounter.incrementCounter(
					FetchTenantKeyMetric.RetrieveFromCacheSucess,
				);
			}
			return cachedKey ?? undefined;
		} catch (error) {
			Lumberjack.error(
				`Error trying to retreive tenant keys from the cache.`,
				{ [BaseTelemetryProperties.tenantId]: tenantId },
				error,
			);
			this.fetchTenantKeyApiCounter.incrementCounter(
				FetchTenantKeyMetric.RetrieveFromCacheError,
			);
			throw error;
		}
	}

	private async deleteKeyFromCache(
		tenantId: string,
		deletePrivateKeys = false,
	): Promise<boolean> {
		return this.runWithCacheRequestCounter(async () => {
			if (this.cache?.delete === undefined) {
				Lumberjack.warning("Cache delete method is not implemented.", {
					[BaseTelemetryProperties.tenantId]: tenantId,
				});
				return false;
			}
			return this.cache.delete(this.getRedisKeyPrefix(tenantId, deletePrivateKeys));
		});
	}

	private async setKeyInCache(
		tenantId: string,
		value: IEncryptedTenantKeys | IEncryptedPrivateTenantKeys,
		setPrivateTenantKeys = false,
	): Promise<boolean> {
		const lumberProperties = { [BaseTelemetryProperties.tenantId]: tenantId };
		try {
			await this.runWithCacheRequestCounter(
				async () =>
					this.cache?.set(
						this.getRedisKeyPrefix(tenantId, setPrivateTenantKeys),
						JSON.stringify(value),
					),
			);
			this.fetchTenantKeyApiCounter.incrementCounter(
				FetchTenantKeyMetric.SetKeyInCacheSuccess,
			);
			return true;
		} catch (error) {
			Lumberjack.error(`Setting tenant key in the cache failed`, lumberProperties, error);
			this.fetchTenantKeyApiCounter.incrementCounter(
				FetchTenantKeyMetric.SetKeyInCacheFailure,
			);
			return false;
		}
	}
}
