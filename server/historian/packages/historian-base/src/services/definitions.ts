/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITenantConfig, ITenantCustomData } from "@fluidframework/server-services-core";

/**
 * Interface for a git object cache
 */
export interface ICache {
	/**
	 * Retrieves the cached entry for the given key. Or null if it doesn't exist.
	 */
	get<T>(key: string): Promise<T | null>;

	/**
	 * Sets a cache value
	 */
	set<T>(key: string, value: T): Promise<void>;

	/**
	 * Deletes a cache key/value pair. Returns true if the key was deleted, and false if it does not exist.
	 */
	delete(key: string): Promise<boolean>;
}

export interface ITenantService {
	/**
	 * Retrieves the storage provider details for the given tenant.
	 * If the provided token is invalid will return a broken promise.
	 */
	getTenant(
		tenantId: string,
		token: string,
		includeDisabledTenant: boolean,
	): Promise<ITenantConfig>;

	/**
	 * Removes any existing cache for the given tenant and token.
	 */
	deleteFromCache(tenantId: string, token: string): Promise<boolean>;
}

/**
 * Credentials used to access a storage provider
 */
export interface ICredentials {
	user: string;

	password: string;
}

export interface IStorage {
	// URL to the storage provider
	url: string;

	// Direct access URL to the storage provider
	direct: string;

	// Storage provider owner
	owner: string;

	// Storage provider repository
	repository: string;

	// Access credentials to the storage provider
	credentials: ICredentials;
}

export interface ITenant {
	id: string;

	storage: IStorage;
}

/**
 * An extension of ITenantCustomData.
 * It is important to include all fields when updating tenant custom data.
 */
export interface ITenantCustomDataExternal extends ITenantCustomData {
	externalStorageData?: IExternalStorage;
	storageName?: string;
}

export interface IExternalStorage {
	storageType: string;
	accessInfo: IOauthAccessInfo | IConnectionString;
}

export interface IConnectionString {
	connectionString: string;
}

export interface IOauthAccessInfo {
	accessToken: string;
	refreshToken: string;
	expiresAt: string;
}

/**
 * Retrieves a subset of information from a Tenant's {@link ITenantCustomData}.
 * The retrieved information is passed to the underlying storage service (e.g. Gitrest)
 * in the "Simplified-Custom-Data" header.
 */
export interface ISimplifiedCustomDataRetriever {
	get(customData: ITenantCustomData): string;
}
