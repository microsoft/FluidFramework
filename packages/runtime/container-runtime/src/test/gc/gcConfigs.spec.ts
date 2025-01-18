/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { IErrorBase } from "@fluidframework/core-interfaces";
import { Timer } from "@fluidframework/core-utils/internal";
import {
	IGarbageCollectionData,
	IGarbageCollectionDetailsBase,
} from "@fluidframework/runtime-definitions/internal";
import {
	MockLogger,
	MonitoringContext,
	createChildLogger,
	mixinMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";
import { SinonFakeTimers, useFakeTimers } from "sinon";

import {
	// eslint-disable-next-line import/no-deprecated
	GCNodeType,
	GarbageCollector,
	// eslint-disable-next-line import/no-deprecated
	IGCMetadata,
	// eslint-disable-next-line import/no-deprecated
	IGCMetadata_Deprecated,
	IGCRuntimeOptions,
	IGarbageCollectionRuntime,
	IGarbageCollectionState,
	IGarbageCollector,
	IGarbageCollectorConfigs,
	IGarbageCollectorCreateParams,
	defaultInactiveTimeoutMs,
	defaultSessionExpiryDurationMs,
	defaultSweepGracePeriodMs,
	gcGenerationOptionName,
	gcTestModeKey,
	gcVersionUpgradeToV4Key,
	// eslint-disable-next-line import/no-deprecated
	nextGCVersion,
	oneDayMs,
	runSessionExpiryKey,
	// eslint-disable-next-line import/no-deprecated
	stableGCVersion,
	disableThrowOnTombstoneLoadKey,
} from "../../gc/index.js";
import { ContainerRuntimeGCMessage } from "../../messageTypes.js";
import { pkgVersion } from "../../packageVersion.js";
// eslint-disable-next-line import/no-deprecated
import { IContainerRuntimeMetadata } from "../../summary/index.js";

import { createTestConfigProvider } from "./gcUnitTestHelpers.js";

type GcWithPrivates = IGarbageCollector & {
	readonly configs: IGarbageCollectorConfigs;
	readonly sessionExpiryTimer: Omit<Timer, "defaultTimeout"> & { defaultTimeout: number };
};

describe("Garbage Collection configurations", () => {
	const testPkgPath = ["testPkg"];
	const configProvider = createTestConfigProvider();

	let mockLogger: MockLogger;
	let mc: MonitoringContext<MockLogger>;
	let clock: SinonFakeTimers;
	// The default GC data returned by `getGCData` on which GC is run. Update this to update the referenced graph.
	let defaultGCData: IGarbageCollectionData = { gcNodes: {} };

	const customSessionExpiryDurationMs = defaultSessionExpiryDurationMs + 1;
	const testOverrideInactiveTimeoutKey =
		"Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs";
	const testOverrideTombstoneTimeoutKey =
		"Fluid.GarbageCollection.TestOverride.TombstoneTimeoutMs";
	const testOverrideSessionExpiryMsKey =
		"Fluid.GarbageCollection.TestOverride.SessionExpiryMs";

	let gc: GcWithPrivates | undefined;

	const createGcWithPrivateMembers = (
		// eslint-disable-next-line import/no-deprecated
		gcMetadata?: IGCMetadata,
		gcOptions?: IGCRuntimeOptions,
		// eslint-disable-next-line import/no-deprecated
		isSummarizerClient?: boolean,
	): GcWithPrivates => {
		// eslint-disable-next-line import/no-deprecated
		const metadata: IContainerRuntimeMetadata | undefined = gcMetadata && {
			summaryFormatVersion: 1,
			message: undefined,
			...gcMetadata,
		};
		return createGarbageCollector(
			{ metadata, gcOptions },
			undefined /* gcBlobsMap */,
			undefined /* closeFn */,
			// eslint-disable-next-line import/no-deprecated
			isSummarizerClient,
		) as GcWithPrivates;
	};

	function createGarbageCollector(
		createParams: Partial<IGarbageCollectorCreateParams> = {},
		gcBlobsMap: Map<
			string,
			IGarbageCollectionState | IGarbageCollectionDetailsBase | string[]
		> = new Map(),
		closeFn: (error?: ICriticalContainerError) => void = () => {},
		// eslint-disable-next-line import/no-deprecated
		isSummarizerClient: boolean = true,
	) {
		const getNodeType = (nodePath: string) => {
			if (nodePath.split("/").length !== 2) {
				// eslint-disable-next-line import/no-deprecated
				return GCNodeType.Other;
			}
			// eslint-disable-next-line import/no-deprecated
			return GCNodeType.DataStore;
		};

		// The runtime to be passed to the garbage collector.
		const gcRuntime: IGarbageCollectionRuntime = {
			getGCData: async (fullGC?: boolean) => defaultGCData,
			updateUsedRoutes: (usedRoutes: string[]) => {
				return { totalNodeCount: 0, unusedNodeCount: 0 };
			},
			deleteSweepReadyNodes: (sweepReadyRoutes: string[]): string[] => {
				return [];
			},
			updateTombstonedRoutes: (tombstoneRoutes: string[]) => {},
			getNodeType,
			getCurrentReferenceTimestampMs: () => Date.now(),
			closeFn,
		};

		return GarbageCollector.create({
			...createParams,
			runtime: gcRuntime,
			gcOptions: createParams.gcOptions ?? {},
			baseSnapshot: createParams.baseSnapshot,
			baseLogger: createChildLogger({ logger: mc.logger }),
			existing: createParams.metadata !== undefined /* existing */,
			metadata: createParams.metadata,
			createContainerMetadata: {
				createContainerRuntimeVersion: pkgVersion,
				createContainerTimestamp: Date.now(),
			},
			// eslint-disable-next-line import/no-deprecated
			isSummarizerClient,
			readAndParseBlob: async <T>(id: string) => gcBlobsMap.get(id) as T,
			getNodePackagePath: async (nodeId: string) => testPkgPath,
			getLastSummaryTimestampMs: () => Date.now(),
			submitMessage: (message: ContainerRuntimeGCMessage) => {},
		});
	}

	before(() => {
		clock = useFakeTimers();
	});

	beforeEach(() => {
		gc = undefined;
		mockLogger = new MockLogger();
		// To ensure inactive timeout is less than tombstone timeout.
		configProvider.set(testOverrideInactiveTimeoutKey, 1);
		mc = mixinMonitoringContext(mockLogger, configProvider);
	});

	afterEach(() => {
		clock.reset();
		configProvider.clear();
		defaultGCData = { gcNodes: {} };
		gc?.dispose();
	});

	after(() => {
		clock.restore();
	});

	describe("Existing container", () => {
		it("No metadata", () => {
			gc = createGcWithPrivateMembers({});
			assert(!gc.configs.gcAllowed, "gcAllowed incorrect");
			assert.equal(gc.configs.sweepEnabled, false, "sweepEnabled incorrect");
			assert(
				gc.configs.sessionExpiryTimeoutMs === undefined,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert(gc.configs.tombstoneTimeoutMs === undefined, "tombstoneTimeoutMs incorrect");
			assert.equal(gc.configs.gcVersionInBaseSnapshot, 0, "gcVersionInBaseSnapshot incorrect");
		});
		it("gcFeature 0", () => {
			gc = createGcWithPrivateMembers({ gcFeature: 0 });
			assert(!gc.configs.gcAllowed, "gcAllowed incorrect");
			assert.equal(gc.configs.gcVersionInBaseSnapshot, 0, "gcVersionInBaseSnapshot incorrect");
		});
		it("gcFeature 0, Sweep allowed but disabled", () => {
			gc = createGcWithPrivateMembers(
				{ gcFeature: 0, gcFeatureMatrix: { gcGeneration: 0 } },
				{ [gcGenerationOptionName]: 0, enableGCSweep: true },
			);
			assert(!gc.configs.gcAllowed, "gcAllowed incorrect");
			assert(gc.configs.sweepAllowed, "sweepAllowed incorrect");
			assert(!gc.configs.sweepEnabled, "sweepEnabled incorrect");
			assert.equal(gc.configs.gcVersionInBaseSnapshot, 0, "gcVersionInBaseSnapshot incorrect");
		});
		it("gcFeature 1", () => {
			gc = createGcWithPrivateMembers({ gcFeature: 1 });
			assert(gc.configs.gcAllowed, "gcAllowed incorrect");
			assert.equal(gc.configs.gcVersionInBaseSnapshot, 1, "gcVersionInBaseSnapshot incorrect");
		});
		it("sweepEnabled value ignored", () => {
			gc = createGcWithPrivateMembers(
				{ sweepEnabled: true },
				{ [gcGenerationOptionName]: 1 }, // No persisted value, so sweep should not be allowed
			);
			assert(!gc.configs.sweepEnabled, "sweepEnabled incorrect");
		});
		it("sessionExpiryTimeoutMs set (tombstoneTimeoutMs unset)", () => {
			gc = createGcWithPrivateMembers({
				sessionExpiryTimeoutMs: customSessionExpiryDurationMs,
			});
			assert.equal(
				gc.configs.sessionExpiryTimeoutMs,
				customSessionExpiryDurationMs,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert.equal(
				gc.configs.tombstoneTimeoutMs,
				customSessionExpiryDurationMs + 6 * oneDayMs,
				"tombstoneTimeoutMs incorrect",
			);
		});
		it("tombstoneTimeoutMs set", () => {
			gc = createGcWithPrivateMembers({ tombstoneTimeoutMs: 123 });
			assert.equal(gc.configs.tombstoneTimeoutMs, 123, "tombstoneTimeoutMs incorrect");
		});
		it("Metadata Roundtrip", () => {
			// eslint-disable-next-line import/no-deprecated
			const inputMetadata: IGCMetadata = {
				sweepEnabled: true, // ignored
				gcFeature: 1,
				sessionExpiryTimeoutMs: customSessionExpiryDurationMs,
				tombstoneTimeoutMs: 123,
				gcFeatureMatrix: { gcGeneration: 1 },
			};
			gc = createGcWithPrivateMembers(inputMetadata, {
				[gcGenerationOptionName]: 2, // 2 should not replace already-persisted value of 1
			});
			const outputMetadata = gc.getMetadata();
			// eslint-disable-next-line import/no-deprecated
			const expectedOutputMetadata: IGCMetadata = {
				...inputMetadata,
				sweepEnabled: false, // Hardcoded, not used
				// eslint-disable-next-line import/no-deprecated
				gcFeature: stableGCVersion,
			};
			assert.deepEqual(
				outputMetadata,
				expectedOutputMetadata,
				"getMetadata returned different metadata than loaded from",
			);
		});
		it("Metadata Roundtrip - old file with tombstoneGeneration", () => {
			// eslint-disable-next-line import/no-deprecated
			const inputMetadata: IGCMetadata = {
				sweepEnabled: true, // ignored
				gcFeature: 1,
				sessionExpiryTimeoutMs: customSessionExpiryDurationMs,
				tombstoneTimeoutMs: 123,
				gcFeatureMatrix: { tombstoneGeneration: 1 }, // legacy file before gcGeneration
			};
			gc = createGcWithPrivateMembers(inputMetadata, {
				[gcGenerationOptionName]: 2, // Will not be persisted - legacy file will only ever be stamped with tombstoneGeneration
			});
			const outputMetadata = gc.getMetadata();
			// eslint-disable-next-line import/no-deprecated
			const expectedOutputMetadata: IGCMetadata = {
				...inputMetadata,
				sweepEnabled: false, // Hardcoded, not used
				// eslint-disable-next-line import/no-deprecated
				gcFeature: stableGCVersion,
			};
			assert.deepEqual(
				outputMetadata,
				expectedOutputMetadata,
				"getMetadata returned different metadata than loaded from",
			);
		});
		it("Metadata Roundtrip transition to gcGeneration from tombstoneGeneration", () => {
			// eslint-disable-next-line import/no-deprecated
			const inputMetadata: IGCMetadata = {
				sweepEnabled: true, // ignored
				gcFeature: 1,
				sessionExpiryTimeoutMs: customSessionExpiryDurationMs,
				tombstoneTimeoutMs: 123,
				gcFeatureMatrix: { gcGeneration: 1 },
			};
			// An app may write both Generation options to ease the transition. Only gcGeneration will be persisted
			// (and previous to the change introducing gcGeneration, only tombstoneGeneration would have been persisted).
			gc = createGcWithPrivateMembers(inputMetadata, {
				[gcGenerationOptionName]: 1,
				gcTombstoneGeneration: 1, // Legacy - will not be persisted but is ok to pass in
			});
			const outputMetadata = gc.getMetadata();
			// eslint-disable-next-line import/no-deprecated
			const expectedOutputMetadata: IGCMetadata = {
				...inputMetadata,
				sweepEnabled: false, // Hardcoded, not used
				// eslint-disable-next-line import/no-deprecated
				gcFeature: stableGCVersion,
			};
			assert.deepEqual(
				outputMetadata,
				expectedOutputMetadata,
				"getMetadata returned different metadata than loaded from",
			);
		});
		it("Metadata Roundtrip with GC version upgrade to v4 enabled", () => {
			configProvider.set(gcVersionUpgradeToV4Key, true);
			// eslint-disable-next-line import/no-deprecated
			const inputMetadata: IGCMetadata = {
				sweepEnabled: true, // ignored
				gcFeature: 1,
				sessionExpiryTimeoutMs: customSessionExpiryDurationMs,
				tombstoneTimeoutMs: 123,
				gcFeatureMatrix: { gcGeneration: 1 },
			};
			gc = createGcWithPrivateMembers(inputMetadata);
			const outputMetadata = gc.getMetadata();
			// eslint-disable-next-line import/no-deprecated
			const expectedOutputMetadata: IGCMetadata = {
				...inputMetadata,
				sweepEnabled: false, // Hardcoded, not used
				// eslint-disable-next-line import/no-deprecated
				gcFeature: nextGCVersion,
			};
			assert.deepEqual(
				outputMetadata,
				expectedOutputMetadata,
				"getMetadata returned different metadata than loaded from",
			);
		});
		it("Metadata Roundtrip with GC version upgrade to v4 disabled", () => {
			configProvider.set(gcVersionUpgradeToV4Key, false);
			// eslint-disable-next-line import/no-deprecated
			const inputMetadata: IGCMetadata = {
				sweepEnabled: true, // ignored
				gcFeature: 1,
				sessionExpiryTimeoutMs: customSessionExpiryDurationMs,
				tombstoneTimeoutMs: 123,
				gcFeatureMatrix: { gcGeneration: 1 },
			};
			gc = createGcWithPrivateMembers(inputMetadata);
			const outputMetadata = gc.getMetadata();
			// eslint-disable-next-line import/no-deprecated
			const expectedOutputMetadata: IGCMetadata = {
				...inputMetadata,
				sweepEnabled: false, // Hardcoded, not used
				// eslint-disable-next-line import/no-deprecated
				gcFeature: stableGCVersion,
			};
			assert.deepEqual(
				outputMetadata,
				expectedOutputMetadata,
				"getMetadata returned different metadata than loaded from",
			);
		});
	});

	describe("New Container", () => {
		it("No options", () => {
			gc = createGcWithPrivateMembers(undefined /* metadata */, {});
			assert(gc.configs.gcAllowed, "gcAllowed incorrect");
			assert.equal(gc.configs.sweepEnabled, false, "sweepEnabled incorrect");
			assert(
				gc.configs.sessionExpiryTimeoutMs !== undefined,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert(gc.configs.tombstoneTimeoutMs !== undefined, "tombstoneTimeoutMs incorrect");
			assert.equal(
				gc.configs.gcVersionInEffect,
				// eslint-disable-next-line import/no-deprecated
				stableGCVersion,
				"gcVersionInEffect incorrect",
			);
		});
		it("Sweep allowed via gcGeneration", () => {
			gc = createGcWithPrivateMembers(undefined /* metadata */, {
				[gcGenerationOptionName]: 1,
			});
			assert(gc.configs.gcAllowed, "gcAllowed incorrect");
			assert(gc.configs.sweepAllowed, "sweepAllowed incorrect");
			assert(gc.configs.tombstoneTimeoutMs !== undefined, "tombstoneTimeoutMs incorrect");
			assert(
				gc.configs.sessionExpiryTimeoutMs !== undefined,
				"sessionExpiryTimeoutMs incorrect",
			);
		});
		it("Sweep allowed but disabled with sessionExpiry off", () => {
			configProvider.set(runSessionExpiryKey, false);
			gc = createGcWithPrivateMembers(undefined /* metadata */, {
				[gcGenerationOptionName]: 1,
			});
			assert(gc.configs.gcAllowed, "gcAllowed incorrect");
			assert(
				gc.configs.sessionExpiryTimeoutMs === undefined,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert(gc.configs.tombstoneTimeoutMs === undefined, "tombstoneTimeoutMs incorrect");
			assert(gc.configs.sweepAllowed, "sweepAllowed incorrect");
			assert(!gc.configs.sweepEnabled, "sweepEnabled incorrect");
		});
		it("TestOverride.TombstoneTimeoutMs set, sessionExpiry on", () => {
			configProvider.set(testOverrideTombstoneTimeoutKey, 123);
			gc = createGcWithPrivateMembers(undefined /* metadata */, {});
			assert(
				gc.configs.sessionExpiryTimeoutMs === defaultSessionExpiryDurationMs,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert(gc.configs.tombstoneTimeoutMs === 123, "tombstoneTimeoutMs incorrect");
			assert(gc.configs.sweepAllowed, "sweepAllowed incorrect");
			assert(!gc.configs.sweepEnabled, "sweepEnabled incorrect");
		});
		it("TestOverride.TombstoneTimeoutMs set, sessionExpiry off", () => {
			configProvider.set(testOverrideTombstoneTimeoutKey, 123);
			configProvider.set(runSessionExpiryKey, false);
			gc = createGcWithPrivateMembers(undefined /* metadata */, {});
			assert(
				gc.configs.sessionExpiryTimeoutMs === undefined,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert(gc.configs.tombstoneTimeoutMs === 123, "tombstoneTimeoutMs incorrect");
			assert(gc.configs.sweepAllowed, "sweepAllowed incorrect");
			assert(!gc.configs.sweepEnabled, "sweepEnabled incorrect");
		});
		it("Metadata Roundtrip", () => {
			// eslint-disable-next-line import/no-deprecated
			const expectedMetadata: IGCMetadata = {
				sweepEnabled: false, // hardcoded, not used
				// eslint-disable-next-line import/no-deprecated
				gcFeature: stableGCVersion,
				sessionExpiryTimeoutMs: defaultSessionExpiryDurationMs,
				tombstoneTimeoutMs: defaultSessionExpiryDurationMs + 6 * oneDayMs,
				gcFeatureMatrix: { gcGeneration: 2 },
			};
			gc = createGcWithPrivateMembers(undefined /* metadata */, {
				[gcGenerationOptionName]: 2,
			});
			const outputMetadata = gc.getMetadata();
			assert.deepEqual(
				outputMetadata,
				expectedMetadata,
				"getMetadata returned different metadata than expected",
			);
		});
		it("Metadata Roundtrip with GC version upgrade to v4 enabled", () => {
			configProvider.set(gcVersionUpgradeToV4Key, true);
			// eslint-disable-next-line import/no-deprecated
			const expectedMetadata: IGCMetadata = {
				sweepEnabled: false, // hardcoded, not used
				// eslint-disable-next-line import/no-deprecated
				gcFeature: nextGCVersion,
				sessionExpiryTimeoutMs: defaultSessionExpiryDurationMs,
				tombstoneTimeoutMs: defaultSessionExpiryDurationMs + 6 * oneDayMs,
				gcFeatureMatrix: undefined,
			};
			gc = createGcWithPrivateMembers(undefined /* metadata */, {});
			const outputMetadata = gc.getMetadata();
			assert.deepEqual(
				outputMetadata,
				expectedMetadata,
				"getMetadata returned different metadata than expected",
			);
		});
		it("Metadata Roundtrip transition to gcGeneration from tombstoneGeneration", () => {
			// eslint-disable-next-line import/no-deprecated
			const expectedMetadata: IGCMetadata = {
				sweepEnabled: false, // hardcoded, not used
				// eslint-disable-next-line import/no-deprecated
				gcFeature: stableGCVersion,
				sessionExpiryTimeoutMs: defaultSessionExpiryDurationMs,
				tombstoneTimeoutMs: defaultSessionExpiryDurationMs + 6 * oneDayMs,
				gcFeatureMatrix: {
					gcGeneration: 2,
					// tombstoneGeneration will not be persisted
				},
			};
			// An app may write both Generation options to ease the transition. Only gcGeneration will be persisted
			// (and previous to the change introducing gcGeneration, only tombstoneGeneration would have been persisted).
			gc = createGcWithPrivateMembers(undefined /* metadata */, {
				[gcGenerationOptionName]: 2,
				gcTombstoneGeneration: 2, // Legacy - will not be persisted but is ok to pass in
			});
			const outputMetadata = gc.getMetadata();
			assert.deepEqual(
				outputMetadata,
				expectedMetadata,
				"getMetadata returned different metadata than expected",
			);
		});
	});

	describe("Session Expiry and Tombstone Timeout", () => {
		beforeEach(() => {
			configProvider.set("Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs", 1); // To ensure it's less than tombstone timeout
		});

		// Config sources for Session Expiry:
		// 1. defaultSessionExpiryDurationMs in code
		// 2. IGCRuntimeOptions.sessionExpiryTimeoutMs
		// eslint-disable-next-line import/no-deprecated
		// 3. IGCMetadata.sessionExpiryTimeoutMs
		// 4. "Fluid.GarbageCollection.TestOverride.SessionExpiryMs" setting
		// Config sources for Tombstone Timeout:
		// eslint-disable-next-line import/no-deprecated
		// 1. IGCMetadata.tombstoneTimeoutMs
		// eslint-disable-next-line import/no-deprecated
		// 2. IGCMetadata_Deprecated.sweepTimeoutMs (backfill from before two-stage sweep)
		// 3. Computed from Session Expiry, fixed upper bound for Snapshot Expiry and a fixed buffer (on create, or to backfill existing)
		// 4. "Fluid.GarbageCollection.TestOverride.TombstoneTimeoutMs" setting (only applicable on create)

		it("defaultSessionExpiryDurationMs", () => {
			gc = createGcWithPrivateMembers();
			assert.equal(
				gc.configs.sessionExpiryTimeoutMs,
				defaultSessionExpiryDurationMs,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert.equal(
				gc.sessionExpiryTimer.defaultTimeout,
				defaultSessionExpiryDurationMs,
				"sessionExpiryTimer incorrect",
			);
			assert.equal(
				gc.configs.tombstoneTimeoutMs,
				defaultSessionExpiryDurationMs + 6 * oneDayMs,
				"tombstoneTimeoutMs incorrect",
			);
		});
		it("defaultSessionExpiryDurationMs, TestOverride.TombstoneTimeoutMs set", () => {
			configProvider.set(testOverrideTombstoneTimeoutKey, 7890);
			gc = createGcWithPrivateMembers();
			assert.equal(
				gc.configs.sessionExpiryTimeoutMs,
				defaultSessionExpiryDurationMs,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert.equal(
				gc.sessionExpiryTimer.defaultTimeout,
				defaultSessionExpiryDurationMs,
				"sessionExpiryTimer incorrect",
			);
			assert.equal(gc.configs.tombstoneTimeoutMs, 7890, "tombstoneTimeoutMs incorrect");
		});
		it("IGCRuntimeOptions.sessionExpiryTimeoutMs", () => {
			gc = createGcWithPrivateMembers(undefined /* metadata */, {
				sessionExpiryTimeoutMs: 123,
			});
			assert.equal(gc.configs.sessionExpiryTimeoutMs, 123, "sessionExpiryTimeoutMs incorrect");
			assert.equal(gc.sessionExpiryTimer.defaultTimeout, 123, "sessionExpiryTimer incorrect");
			assert.equal(
				gc.configs.tombstoneTimeoutMs,
				123 + 6 * oneDayMs,
				"tombstoneTimeoutMs incorrect",
			);
		});
		// eslint-disable-next-line import/no-deprecated
		it("IGCMetadata.sessionExpiryTimeoutMs, backfill tombstoneTimeoutMs", () => {
			configProvider.set(testOverrideTombstoneTimeoutKey, 1337); // Should be ignored
			gc = createGcWithPrivateMembers({ sessionExpiryTimeoutMs: 456 } /* metadata */);
			assert.equal(gc.configs.sessionExpiryTimeoutMs, 456, "sessionExpiryTimeoutMs incorrect");
			assert.equal(gc.sessionExpiryTimer.defaultTimeout, 456, "sessionExpiryTimer incorrect");
			assert.equal(
				gc.configs.tombstoneTimeoutMs,
				456 + 6 * oneDayMs,
				"tombstoneTimeoutMs incorrect",
			);
		});
		// eslint-disable-next-line import/no-deprecated
		it("IGCMetadata.sessionExpiryTimeoutMs and IGCMetadata.tombstoneTimeoutMs", () => {
			configProvider.set(testOverrideTombstoneTimeoutKey, 1337); // Should be ignored
			gc = createGcWithPrivateMembers(
				{ sessionExpiryTimeoutMs: 456, tombstoneTimeoutMs: 789 } /* metadata */,
			);
			assert.equal(gc.configs.sessionExpiryTimeoutMs, 456, "sessionExpiryTimeoutMs incorrect");
			assert.equal(gc.sessionExpiryTimer.defaultTimeout, 456, "sessionExpiryTimer incorrect");
			assert.equal(gc.configs.tombstoneTimeoutMs, 789, "tombstoneTimeoutMs incorrect");
		});
		// eslint-disable-next-line import/no-deprecated
		it("IGCMetadata.tombstoneTimeoutMs only", () => {
			configProvider.set(testOverrideTombstoneTimeoutKey, 1337); // Should be ignored
			// This could happen if you used TestOverride.TombstoneTimeoutMs but had SessionExpiry disabled, then loaded that container.
			gc = createGcWithPrivateMembers({ tombstoneTimeoutMs: 789 } /* metadata */);
			assert.equal(
				gc.configs.sessionExpiryTimeoutMs,
				undefined,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert.equal(gc.sessionExpiryTimer, undefined, "sessionExpiryTimer incorrect");
			assert.equal(gc.configs.tombstoneTimeoutMs, 789, "tombstoneTimeoutMs incorrect");
		});
		// eslint-disable-next-line import/no-deprecated
		it("IGCMetadata.tombstoneTimeoutMs - backfill from sweepTimeoutMs", () => {
			configProvider.set(testOverrideTombstoneTimeoutKey, 1337); // Should be ignored
			// eslint-disable-next-line import/no-deprecated
			const metadata: IGCMetadata & IGCMetadata_Deprecated = {
				sweepTimeoutMs: 789, // Snapshot was generated by code built before the rename
			};
			gc = createGcWithPrivateMembers(metadata);
			assert.equal(
				gc.configs.sessionExpiryTimeoutMs,
				undefined,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert.equal(gc.sessionExpiryTimer, undefined, "sessionExpiryTimer incorrect");
			assert.equal(gc.configs.tombstoneTimeoutMs, 789, "tombstoneTimeoutMs incorrect");
		});
		it("RunSessionExpiry setting turned off", () => {
			configProvider.set(runSessionExpiryKey, false);
			configProvider.set(testOverrideSessionExpiryMsKey, 123); // This override should be ignored
			gc = createGcWithPrivateMembers();
			assert.equal(
				gc.configs.sessionExpiryTimeoutMs,
				undefined,
				"sessionExpiryTimeoutMs should be undefined if runSessionExpiryKey setting is false",
			);
			assert.equal(
				gc.sessionExpiryTimer,
				undefined,
				"sessionExpiryTimer should be undefined if it's disabled",
			);
			assert.equal(gc.configs.tombstoneTimeoutMs, undefined, "tombstoneTimeoutMs incorrect");
		});
		it("RunSessionExpiry setting turned off, TestOverride.TombstoneTimeoutMs set", () => {
			configProvider.set(runSessionExpiryKey, false);
			configProvider.set(testOverrideTombstoneTimeoutKey, 7890);
			configProvider.set(testOverrideSessionExpiryMsKey, 123); // This override should be ignored
			gc = createGcWithPrivateMembers();
			assert.equal(
				gc.configs.sessionExpiryTimeoutMs,
				undefined,
				"sessionExpiryTimeoutMs should be undefined if runSessionExpiryKey setting is false",
			);
			assert.equal(
				gc.sessionExpiryTimer,
				undefined,
				"sessionExpiryTimer should be undefined if it's disabled",
			);
			assert.equal(gc.configs.tombstoneTimeoutMs, 7890, "tombstoneTimeoutMs incorrect");
		});

		function testSessionExpiryMsOverride() {
			const expectedTombstoneTimeoutMs = defaultSessionExpiryDurationMs + 6 * oneDayMs;
			assert(!!gc, "PRECONDITION: gc must be set before calling this helper");
			assert.equal(
				gc.configs.sessionExpiryTimeoutMs,
				defaultSessionExpiryDurationMs,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert.equal(
				gc.sessionExpiryTimer.defaultTimeout,
				789,
				"sessionExpiry used for timer should be the override value",
			);
			assert.equal(
				gc.configs.tombstoneTimeoutMs,
				expectedTombstoneTimeoutMs,
				"tombstoneTimeoutMs incorrect",
			);

			// eslint-disable-next-line import/no-deprecated
			const expectedMetadata: IGCMetadata = {
				sweepEnabled: false,
				// eslint-disable-next-line import/no-deprecated
				gcFeature: stableGCVersion,
				sessionExpiryTimeoutMs: defaultSessionExpiryDurationMs,
				tombstoneTimeoutMs: expectedTombstoneTimeoutMs,
				gcFeatureMatrix: undefined,
			};
			const outputMetadata = gc.getMetadata();
			assert.deepEqual(
				outputMetadata,
				expectedMetadata,
				"getMetadata returned different metadata than expected",
			);
		}
		it("TestOverride.SessionExpiryMs setting applied to timeout but not written to file - New Container", () => {
			configProvider.set(testOverrideSessionExpiryMsKey, 789);
			gc = createGcWithPrivateMembers();
			testSessionExpiryMsOverride();
		});
		it("TestOverride.SessionExpiryMs setting applied to timeout but not written to file - Existing Container", () => {
			configProvider.set(testOverrideSessionExpiryMsKey, 789);
			gc = createGcWithPrivateMembers(
				{
					sessionExpiryTimeoutMs: defaultSessionExpiryDurationMs,
					gcFeature: 1,
				} /* metadata */,
			);
			testSessionExpiryMsOverride();
		});
	});

	describe("Session Behavior (e.g. 'shouldRun' fields)", () => {
		beforeEach(() => {
			configProvider.set("Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs", 1); // To ensure it's less than tombstone timeout
		});

		describe("shouldRunGC", () => {
			it("shouldRunGC should be true when gcVersionInEffect is newer than gcVersionInBaseSnapshot", () => {
				// eslint-disable-next-line import/no-deprecated
				const gcVersionInBaseSnapshot = stableGCVersion - 1;
				gc = createGcWithPrivateMembers({ gcFeature: gcVersionInBaseSnapshot });
				assert.equal(gc.configs.gcAllowed, true, "PRECONDITION: gcAllowed set incorrectly");
				assert.equal(
					gc.configs.gcVersionInBaseSnapshot,
					gcVersionInBaseSnapshot,
					"gcVersionInBaseSnapshot set incorrectly",
				);
			});
			it("shouldRunGC should be true when gcVersionInEffect is older than gcVersionInBaseSnapshot", () => {
				// eslint-disable-next-line import/no-deprecated
				const gcVersionInBaseSnapshot = nextGCVersion + 1;
				gc = createGcWithPrivateMembers({ gcFeature: gcVersionInBaseSnapshot });
				assert.equal(gc.configs.gcAllowed, true, "PRECONDITION: gcAllowed set incorrectly");
				assert.equal(
					gc.configs.gcVersionInBaseSnapshot,
					gcVersionInBaseSnapshot,
					"gcVersionInBaseSnapshot set incorrectly",
				);
			});
		});
		describe("sweepEnabled", () => {
			const testCases: {
				gcAllowed_doc: boolean;
				sweepEnabled_doc: boolean;
				sweepEnabled_session: boolean;
				expectedSweepEnabled: boolean;
			}[] = [
				{
					gcAllowed_doc: false, // Veto
					sweepEnabled_doc: true,
					sweepEnabled_session: true,
					expectedSweepEnabled: false,
				},
				{
					gcAllowed_doc: true,
					sweepEnabled_doc: false, // Veto
					sweepEnabled_session: true,
					expectedSweepEnabled: false,
				},
				{
					gcAllowed_doc: true,
					sweepEnabled_doc: true,
					sweepEnabled_session: false, // Veto
					expectedSweepEnabled: false,
				},
				{
					gcAllowed_doc: true,
					sweepEnabled_doc: true,
					sweepEnabled_session: true,
					expectedSweepEnabled: true,
				},
			];
			testCases.forEach((testCase, index) => {
				it(`Test Case ${JSON.stringify(testCase)}`, () => {
					gc = createGcWithPrivateMembers(
						{
							// eslint-disable-next-line import/no-deprecated
							gcFeature: testCase.gcAllowed_doc ? stableGCVersion : 0,
							gcFeatureMatrix: { gcGeneration: 1 },
							sessionExpiryTimeoutMs: defaultSessionExpiryDurationMs,
						} /* metadata */,
						{
							enableGCSweep: testCase.sweepEnabled_session ? true : undefined,
							[gcGenerationOptionName]: testCase.sweepEnabled_doc ? 1 : 2,
						} /* gcOptions */,
					);
					assert.equal(
						gc.configs.gcAllowed,
						testCase.gcAllowed_doc,
						"PRECONDITION: gcAllowed set incorrectly",
					);
					assert.equal(
						gc.configs.sweepEnabled,
						testCase.expectedSweepEnabled,
						`sweepEnabled not set as expected`,
					);
				});
			});
		});
		describe("inactiveTimeoutMs", () => {
			beforeEach(() => {
				// Remove setting added in outer describe block
				configProvider.set(
					"Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs",
					undefined,
				);
			});
			const testCases: {
				testOverride?: number;
				option?: number;
				expectedResult: number;
			}[] = [
				{ testOverride: 123, option: 456, expectedResult: 123 },
				{ option: 456, expectedResult: 456 },
				{ expectedResult: defaultInactiveTimeoutMs },
			];
			testCases.forEach((testCase) => {
				it(`Test Case ${JSON.stringify(testCase)}`, () => {
					configProvider.set(
						"Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs",
						testCase.testOverride,
					);
					gc = createGcWithPrivateMembers(undefined /* metadata */, {
						inactiveTimeoutMs: testCase.option,
					});
					assert.equal(
						gc.configs.inactiveTimeoutMs,
						testCase.expectedResult,
						"inactiveTimeoutMs not set as expected",
					);
				});
			});
			it("inactiveTimeout must not be greater than tombstoneTimeout", () => {
				configProvider.set(
					"Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs",
					Number.MAX_VALUE,
				);
				assert.throws(
					() => {
						gc = createGcWithPrivateMembers();
					},
					(e: IErrorBase) => e.errorType === "usageError",
					"inactiveTimeout must not be greater than tombstoneTimeout",
				);
			});
		});
		describe("sweepGracePeriodMs", () => {
			const testCases: {
				option: number | undefined;
				expectedResult: number;
			}[] = [
				{ option: 123, expectedResult: 123 },
				{ option: 0, expectedResult: 0 },
				{ option: undefined, expectedResult: defaultSweepGracePeriodMs },
			];
			testCases.forEach((testCase) => {
				it(`Test Case ${JSON.stringify(testCase)}`, () => {
					gc = createGcWithPrivateMembers(
						{} /* metadata */,
						{
							sweepGracePeriodMs: testCase.option,
						},
					);
					assert.equal(gc.configs.sweepGracePeriodMs, testCase.expectedResult);
				});
			});
			it("sweepGracePeriodMs must be non-negative", () => {
				assert.throws(
					() => {
						gc = createGcWithPrivateMembers(
							{} /* metadata */,
							{
								sweepGracePeriodMs: -1,
							},
						);
					},
					(e: IErrorBase) => e.errorType === "usageError",
					"sweepGracePeriodMs must be non-negative",
				);
			});
		});
		describe("testMode", () => {
			const testCases: {
				setting?: boolean;
				option?: boolean;
				expectedResult: boolean;
			}[] = [
				{ setting: true, option: false, expectedResult: true },
				{ setting: false, option: true, expectedResult: false },
				{ option: true, expectedResult: true },
				{ expectedResult: false },
			];
			testCases.forEach((testCase) => {
				it(`Test Case ${JSON.stringify(testCase)}`, () => {
					configProvider.set(gcTestModeKey, testCase.setting);
					gc = createGcWithPrivateMembers(undefined /* metadata */, {
						runGCInTestMode: testCase.option,
					});
					assert.equal(
						gc.configs.testMode,
						testCase.expectedResult,
						"testMode not set as expected",
					);
				});
			});
		});
	});

	describe("throwOnTombstoneLoad (using new container)", () => {
		beforeEach(() => {
			configProvider.set(testOverrideSessionExpiryMsKey, defaultSessionExpiryDurationMs); // Required for sweep to be enabled
		});
		it("Old 'enable' option false (ignored)", () => {
			const gcThrowOnTombstoneLoadOptionName_old = "gcThrowOnTombstoneLoad";
			gc = createGcWithPrivateMembers(
				undefined /* metadata */,
				{ enableGCSweep: true, [gcThrowOnTombstoneLoadOptionName_old]: false },
				// eslint-disable-next-line import/no-deprecated
				false /* isSummarizerClient */,
			);
			assert.equal(gc.configs.throwOnTombstoneLoad, true, "throwOnTombstoneLoad incorrect");
		});
		it("throwOnTombstoneLoad disabled via override", () => {
			configProvider.set(disableThrowOnTombstoneLoadKey, true);
			gc = createGcWithPrivateMembers(
				undefined /* metadata */,
				{ enableGCSweep: true },
				// eslint-disable-next-line import/no-deprecated
				false /* isSummarizerClient */,
			);
			assert.equal(gc.configs.throwOnTombstoneLoad, false, "throwOnTombstoneLoad incorrect");
		});
		it("throwOnTombstoneLoad cannot be enabled via override if sweep is disabled", () => {
			configProvider.set(disableThrowOnTombstoneLoadKey, false);
			gc = createGcWithPrivateMembers(
				undefined /* metadata */,
				{ enableGCSweep: undefined },
				// eslint-disable-next-line import/no-deprecated
				false /* isSummarizerClient */,
			);
			assert.equal(gc.configs.throwOnTombstoneLoad, false, "throwOnTombstoneLoad incorrect");
		});
	});
});
