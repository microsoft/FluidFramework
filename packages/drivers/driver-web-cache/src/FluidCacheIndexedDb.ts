/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { openDB, DBSchema, DeleteDBCallbacks, IDBPDatabase, deleteDB } from "idb";
import { ICacheEntry } from "@fluidframework/odsp-driver-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { createChildLogger } from "@fluidframework/telemetry-utils";
import { FluidCacheErrorEvent } from "./fluidCacheTelemetry.js";

// The name of the database that we use for caching Fluid info.
export const FluidDriverCacheDBName = "fluidDriverCache";

// The name of the object store within the indexed db instance that the driver will use to cache Fluid content.
export const FluidDriverObjectStoreName = "driverStorage.V3";

export const CurrentCacheVersion = 3;

// Note that V1 and V2 were misspelled as "diver", and we need to keep using the misspelling here.
export const oldVersionNameMapping: Partial<{ [key: number]: string }> = {
	1: "diverStorage",
	2: "diverStorage.V2",
};

export function getKeyForCacheEntry(entry: ICacheEntry) {
	return `${entry.file.docId}_${entry.type}_${entry.key}`;
}

export function getFluidCacheIndexedDbInstance(
	logger?: ITelemetryBaseLogger,
): Promise<IDBPDatabase<FluidCacheDBSchema>> {
	return new Promise((resolve, reject) => {
		openDB<FluidCacheDBSchema>(FluidDriverCacheDBName, CurrentCacheVersion, {
			upgrade: (db, oldVersion) => {
				try {
					// We changed the format of the object store, so we must
					// delete the old stores to create a new one in V3
					const cacheToDelete = oldVersionNameMapping[oldVersion];
					if (cacheToDelete) {
						// We don't include the old object stores in the schema, so we need to
						// use a typecast here to prevent IDB from complaining
						db.deleteObjectStore(cacheToDelete as any);
					}
				} catch (error: any) {
					// Catch any error done when attempting to delete the older version.
					// If the object does not exist db will throw.
					// We can now assume that the old version is no longer there regardless.
					createChildLogger({ logger }).sendErrorEvent(
						{
							eventName: FluidCacheErrorEvent.FluidCacheDeleteOldDbError,
						},
						error,
					);
				}

				const cacheObjectStore = db.createObjectStore(FluidDriverObjectStoreName);
				cacheObjectStore.createIndex("createdTimeMs", "createdTimeMs");
				cacheObjectStore.createIndex("lastAccessTimeMs", "lastAccessTimeMs");
				cacheObjectStore.createIndex("partitionKey", "partitionKey");
				cacheObjectStore.createIndex("fileId", "fileId");
			},
			blocked: () => {
				reject(
					new Error(
						"Could not open DB since it is blocked by an older client that has the DB open",
					),
				);
			},
		}).then(resolve, reject);
	});
}

/**
 * Deletes the indexed DB instance.
 *
 * @remarks Warning this can throw an error in Firefox incognito, where accessing storage is prohibited.
 * @alpha
 */
export function deleteFluidCacheIndexDbInstance(
	deleteDBCallbacks?: DeleteDBCallbacks,
): Promise<void> {
	return deleteDB(FluidDriverCacheDBName, deleteDBCallbacks);
}

/**
 * Schema for the object store used to cache driver information
 */
export interface FluidCacheDBSchema extends DBSchema {
	[FluidDriverObjectStoreName]: {
		/**
		 * A unique identifier for an item in the cache. It is a combination of file, type, and cacheItemId
		 */
		key: string;

		value: {
			/**
			 * The identifier of the file associated with the cache entry
			 */
			fileId: string;

			/**
			 * Describes the type of content being cached, such as snapshot
			 */
			type: string;

			/**
			 * Files may have multiple cached items associated with them,
			 * this property uniquely identifies a specific cache entry for a file.
			 * This is not globally unique, but rather a unique id for this file
			 */
			cacheItemId: string;

			/*
			 * Opaque object that the driver asks us to store in a cache for performance reasons
			 */
			cachedObject: any;

			/**
			 * A string to specify what partition of the cache you wish to use (e.g. a user id).
			 * Null can be used to explicity indicate no partitioning.
			 */
			// eslint-disable-next-line @rushstack/no-new-null
			partitionKey: string | null;

			/**
			 * The time when the cache entry was put into the cache
			 */
			createdTimeMs: number;

			/**
			 * The last time the cache entry was used.
			 * This is initially set to the time the cache entry was created Measured as ms since unix epoch.
			 * With the recent change, this won't be updated on read as it will not be used anywhere. Only keeping
			 * so as to not upgrade the schema version.
			 */
			lastAccessTimeMs: number;
		};

		indexes: {
			createdTimeMs: number;
			partitionKey: string;
			lastAccessTimeMs: number;
			fileId: string;
		};
	};
}
