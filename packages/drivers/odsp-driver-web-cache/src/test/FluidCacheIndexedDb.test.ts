import { openDB } from "idb";
import {
    getFluidCacheIndexedDbInstance,
    oldVersionNameMapping,
    FluidDriverCacheDBName,
    FluidDriverObjectStoreName,
    CurrentCacheVersion,
} from "../FluidCacheIndexedDb";
import { FluidCacheErrorEvent } from "../fluidCacheTelemetry";
require("fake-indexeddb/auto");

class MockLogger {
    NamespaceLogger = this;
    send = jest.fn();
}

const versions = Object.keys(oldVersionNameMapping);

// Dynamically get the test cases for successful upgrades to run though all old versions
const getUpgradeTestCases = (versions: string[]): any[] => {
    const testCases: any[] = [];
    versions.map((value: string) => {
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
        // The indexeddb mock uses setImmediate which doesn't work with Jest 27+. We map it to setTimeout until this issue is resolved: https://github.com/dumbmatter/fakeIndexedDB/issues/64
        (global.setImmediate as any) = global.setTimeout;
        // Reset the indexed db before each test so that it starts off in an empty state
        const FDBFactory = require("fake-indexeddb/lib/FDBFactory");
        (window.indexedDB as any) = new FDBFactory();
    });

    it.each(upgradeTestCases)("%s", async (_, { oldVersionNumber }) => {
        // Arrange
        // Create a database with the old version number
        const oldDb = await openDB(FluidDriverCacheDBName, oldVersionNumber, {
            upgrade: (db) => {
                // Create the old object to simulate what state we would be in
                db.createObjectStore(oldVersionNameMapping[oldVersionNumber]!);
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
        const oldDb = await openDB(
            FluidDriverCacheDBName,
            CurrentCacheVersion - 1
        );
        oldDb.close(); // Close so the upgrade won't be blocked

        const logger = new MockLogger();
        const sendSpy = jest.spyOn(logger, "send");

        // Act
        // Now attempt to get the FluidCache instance, which will run the upgrade function
        const db = await getFluidCacheIndexedDbInstance(logger);

        // Assert
        // We catch the error and send it to the logger
        expect(sendSpy).toBeCalledTimes(1);
        expect(sendSpy.mock.calls[0][0].eventName).toEqual(
            FluidCacheErrorEvent.FluidCacheDeleteOldDbError
        );

        // The cache was still created as expected
        expect(db.objectStoreNames).toEqual([FluidDriverObjectStoreName]);
        expect(db.name).toEqual(FluidDriverCacheDBName);
        expect(db.version).toEqual(CurrentCacheVersion);
    });
});
