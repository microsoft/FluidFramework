/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { openDB } from "idb";
import sinon from "sinon";

import {
	CurrentCacheVersion,
	FluidDriverCacheDBName,
	FluidDriverObjectStoreName,
	getFluidCacheIndexedDbInstance,
	oldVersionNameMapping,
} from "../FluidCacheIndexedDb.js";
import { FluidCacheErrorEvent } from "../fluidCacheTelemetry.js";

class MockLogger {
	public readonly NamespaceLogger = this;
	public readonly send = sinon.stub();
}

const versions = Object.keys(oldVersionNameMapping);

// Dynamically get the test cases for successful upgrades to run though all old versions
const getUpgradeTestCases = (
	versionsArray: string[],
): [string, { oldVersionNumber: number }][] =>
	versionsArray.map((value: string) => [
		`upgrades successfully without an error for version number ${value}`,
		{ oldVersionNumber: Number.parseInt(value, 10 /* base10 */) },
	]);

const upgradeTestCases = getUpgradeTestCases(versions);

describe("getFluidCacheIndexedDbInstance", () => {
	let db: Awaited<ReturnType<typeof getFluidCacheIndexedDbInstance>> | undefined;

	beforeEach(() => {
		// Reset the indexed db before each test so that it starts off in an empty state
		// eslint-disable-next-line @typescript-eslint/no-require-imports, import-x/no-internal-modules
		const FDBFactory = require("fake-indexeddb/lib/FDBFactory");
		(window.indexedDB as unknown) = new FDBFactory();
	});

	afterEach(() => {
		db?.close();
		db = undefined;
	});

	for (const [name, { oldVersionNumber }] of upgradeTestCases) {
		it(name, async () => {
			// Arrange
			// Create a database with the old version number
			const oldDb = await openDB(FluidDriverCacheDBName, oldVersionNumber, {
				upgrade: (dbToUpgrade) => {
					// Create the old object to simulate what state we would be in
					dbToUpgrade.createObjectStore(oldVersionNameMapping[oldVersionNumber]!);
				},
			});
			oldDb.close(); // Close so the upgrade won't be blocked

			// Act
			// Now attempt to get the FluidCache instance, which will run the upgrade function
			db = await getFluidCacheIndexedDbInstance();

			// Assert
			assert.deepEqual([...db.objectStoreNames], [FluidDriverObjectStoreName]);
			assert.strictEqual(db.name, FluidDriverCacheDBName);
			assert.strictEqual(db.version, CurrentCacheVersion);
		});
	}

	it("if error thrown in deletion of old database, is swallowed and logged", async () => {
		// Arrange
		// Create a database with the old version number, but DONT create the data store.
		// This will cause an error that we should catch in the upgrade function where we
		// delete the old data store.
		const oldDb = await openDB(FluidDriverCacheDBName, CurrentCacheVersion - 1);
		oldDb.close(); // Close so the upgrade won't be blocked

		const logger = new MockLogger();

		// Act
		// Now attempt to get the FluidCache instance, which will run the upgrade function
		db = await getFluidCacheIndexedDbInstance(logger);

		// Assert
		// We catch the error and send it to the logger
		assert.strictEqual(logger.send.callCount, 1);
		assert.strictEqual(
			logger.send.args[0][0].eventName,
			FluidCacheErrorEvent.FluidCacheDeleteOldDbError,
		);

		// The cache was still created as expected
		assert.deepEqual([...db.objectStoreNames], [FluidDriverObjectStoreName]);
		assert.strictEqual(db.name, FluidDriverCacheDBName);
		assert.strictEqual(db.version, CurrentCacheVersion);
	});
});
