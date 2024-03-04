/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { openDB } from "idb";
import {
	getFluidCacheIndexedDbInstance,
	oldVersionNameMapping,
	FluidDriverCacheDBName,
	FluidDriverObjectStoreName,
	CurrentCacheVersion,
} from "../FluidCacheIndexedDb.js";
import { FluidCacheErrorEvent } from "../fluidCacheTelemetry.js";

// eslint-disable-next-line import/no-unassigned-import, @typescript-eslint/no-require-imports, import/no-internal-modules
require("fake-indexeddb/auto");

class MockLogger {
	NamespaceLogger = this;
	send = jest.fn();
}

const versions = Object.keys(oldVersionNameMapping);

// Dynamically get the test cases for successful upgrades to run though all old versions
const getUpgradeTestCases = (versionsArray: string[]): any[] => {
	const testCases: any[] = [];
	versionsArray.map((value: string) => {
		testCases.push([
			`upgrades successfully without an error for version number ${value}`,
			{ oldVersionNumber: parseInt(value, 10 /* base10 */) },
		]);
	});
	return testCases;
};
const upgradeTestCases = getUpgradeTestCases(versions);

describe("getFluidCacheIndexedDbInstance", () => {
	beforeEach(() => {
		// Reset the indexed db before each test so that it starts off in an empty state
		// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, import/no-internal-modules
		const FDBFactory = require("fake-indexeddb/lib/FDBFactory");
		(window.indexedDB as any) = new FDBFactory();
	});

	// The jest types in the FF repo are old, so it doesn't have the each signature.
	// This typecast can be removed when the types are bumped.
	(it as any).each(upgradeTestCases)("%s", async (_, { oldVersionNumber }) => {
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
		const db = await getFluidCacheIndexedDbInstance();

		// Assert
		expect(db.objectStoreNames).toEqual([FluidDriverObjectStoreName]);
		expect(db.name).toEqual(FluidDriverCacheDBName);
		expect(db.version).toEqual(CurrentCacheVersion);
	});

	it("if error thrown in deletion of old database, is swallowed and logged", async () => {
		// Arrange
		// Create a database with the old version number, but DONT create the data store.
		// This will cause an error that we should catch in the upgrade function where we
		// delete the old data store.
		const oldDb = await openDB(FluidDriverCacheDBName, CurrentCacheVersion - 1);
		oldDb.close(); // Close so the upgrade won't be blocked

		const logger = new MockLogger();
		const sendSpy = jest.spyOn(logger, "send");

		// Act
		// Now attempt to get the FluidCache instance, which will run the upgrade function
		const db = await getFluidCacheIndexedDbInstance(logger);

		// Assert
		// We catch the error and send it to the logger
		expect(sendSpy.mock.calls).toHaveLength(1);
		expect(sendSpy.mock.calls[0][0].eventName).toEqual(
			FluidCacheErrorEvent.FluidCacheDeleteOldDbError,
		);

		// The cache was still created as expected
		expect(db.objectStoreNames).toEqual([FluidDriverObjectStoreName]);
		expect(db.name).toEqual(FluidDriverCacheDBName);
		expect(db.version).toEqual(CurrentCacheVersion);
	});
});
