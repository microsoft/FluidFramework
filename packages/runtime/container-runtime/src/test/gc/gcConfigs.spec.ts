/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SinonFakeTimers, useFakeTimers } from "sinon";
import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { IErrorBase } from "@fluidframework/core-interfaces";
import {
	IGarbageCollectionData,
	IGarbageCollectionDetailsBase,
} from "@fluidframework/runtime-definitions";
import {
	MockLogger,
	ConfigTypes,
	MonitoringContext,
	mixinMonitoringContext,
	createChildLogger,
} from "@fluidframework/telemetry-utils";
import { Timer } from "@fluidframework/common-utils";
import {
	GarbageCollector,
	GCNodeType,
	GCSummaryStateTracker,
	IGarbageCollectionRuntime,
	IGarbageCollectionState,
	IGarbageCollector,
	IGarbageCollectorConfigs,
	IGarbageCollectorCreateParams,
	IGCMetadata,
	IGCRuntimeOptions,
	defaultSessionExpiryDurationMs,
	oneDayMs,
	runGCKey,
	runSweepKey,
	defaultInactiveTimeoutMs,
	gcTestModeKey,
	currentGCVersion,
	stableGCVersion,
	gcVersionUpgradeToV3Key,
	gcTombstoneGenerationOptionName,
	gcSweepGenerationOptionName,
	GCVersion,
	runSessionExpiryKey,
} from "../../gc";
import { IContainerRuntimeMetadata } from "../../summary";
import { pkgVersion } from "../../packageVersion";
import { configProvider } from "./gcUnitTestHelpers";

type GcWithPrivates = IGarbageCollector & {
	readonly configs: IGarbageCollectorConfigs;
	readonly summaryStateTracker: Omit<GCSummaryStateTracker, "latestSummaryGCVersion"> & {
		latestSummaryGCVersion: GCVersion;
	};
	readonly sessionExpiryTimer: Omit<Timer, "defaultTimeout"> & { defaultTimeout: number };
};

describe("Garbage Collection configurations", () => {
	const testPkgPath = ["testPkg"];

	let injectedSettings: Record<string, ConfigTypes> = {};
	let mockLogger: MockLogger;
	let mc: MonitoringContext<MockLogger>;
	let clock: SinonFakeTimers;
	// The default GC data returned by `getGCData` on which GC is run. Update this to update the referenced graph.
	let defaultGCData: IGarbageCollectionData = { gcNodes: {} };

	const customSessionExpiryDurationMs = defaultSessionExpiryDurationMs + 1;
	const testOverrideInactiveTimeoutKey = "Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs";
	const testOverrideSweepTimeoutKey = "Fluid.GarbageCollection.TestOverride.SweepTimeoutMs";
	const testOverrideSessionExpiryMsKey = "Fluid.GarbageCollection.TestOverride.SessionExpiryMs";

	let gc: GcWithPrivates | undefined;

	const createGcWithPrivateMembers = (
		gcMetadata?: IGCMetadata,
		gcOptions?: IGCRuntimeOptions,
	): GcWithPrivates => {
		const metadata: IContainerRuntimeMetadata | undefined = gcMetadata && {
			summaryFormatVersion: 1,
			message: undefined,
			...gcMetadata,
		};
		return createGarbageCollector({ metadata, gcOptions }) as GcWithPrivates;
	};

	function createGarbageCollector(
		createParams: Partial<IGarbageCollectorCreateParams> = {},
		gcBlobsMap: Map<
			string,
			IGarbageCollectionState | IGarbageCollectionDetailsBase | string[]
		> = new Map(),
		closeFn: (error?: ICriticalContainerError) => void = () => {},
		isSummarizerClient: boolean = true,
	) {
		const getNodeType = (nodePath: string) => {
			if (nodePath.split("/").length !== 2) {
				return GCNodeType.Other;
			}
			return GCNodeType.DataStore;
		};

		// The runtime to be passed to the garbage collector.
		const gcRuntime: IGarbageCollectionRuntime = {
			updateStateBeforeGC: async () => {},
			getGCData: async (fullGC?: boolean) => defaultGCData,
			updateUsedRoutes: (usedRoutes: string[]) => {
				return { totalNodeCount: 0, unusedNodeCount: 0 };
			},
			updateUnusedRoutes: (unusedRoutes: string[]) => {},
			deleteSweepReadyNodes: (sweepReadyRoutes: string[]): string[] => {
				return [];
			},
			updateTombstonedRoutes: (tombstoneRoutes: string[]) => {},
			getNodeType,
			getCurrentReferenceTimestampMs: () => Date.now(),
			closeFn,
			gcTombstoneEnforcementAllowed: true,
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
			isSummarizerClient,
			readAndParseBlob: async <T>(id: string) => gcBlobsMap.get(id) as T,
			getNodePackagePath: async (nodeId: string) => testPkgPath,
			getLastSummaryTimestampMs: () => Date.now(),
			activeConnection: () => true,
		});
	}

	before(() => {
		clock = useFakeTimers();
	});

	beforeEach(() => {
		gc = undefined;
		mockLogger = new MockLogger();
		mc = mixinMonitoringContext(mockLogger, configProvider(injectedSettings));
		// To ensure inactive timeout is less than sweep timeout.
		injectedSettings[testOverrideInactiveTimeoutKey] = 1;
	});

	afterEach(() => {
		clock.reset();
		injectedSettings = {};
		defaultGCData = { gcNodes: {} };
		gc?.dispose();
	});

	after(() => {
		clock.restore();
	});

	describe("Existing container", () => {
		it("No metadata", () => {
			gc = createGcWithPrivateMembers({});
			assert(!gc.configs.gcEnabled, "gcEnabled incorrect");
			assert(!gc.configs.sweepEnabled, "sweepEnabled incorrect");
			assert(
				gc.configs.sessionExpiryTimeoutMs === undefined,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert(gc.configs.sweepTimeoutMs === undefined, "sweepTimeoutMs incorrect");
			assert.equal(
				gc.summaryStateTracker.latestSummaryGCVersion,
				0,
				"latestSummaryGCVersion incorrect",
			);
		});
		it("gcFeature 0", () => {
			gc = createGcWithPrivateMembers({ gcFeature: 0 });
			assert(!gc.configs.gcEnabled, "gcEnabled incorrect");
			assert.equal(
				gc.summaryStateTracker.latestSummaryGCVersion,
				0,
				"latestSummaryGCVersion incorrect",
			);
		});
		it("gcFeature 0, Sweep enabled via sweepGeneration", () => {
			gc = createGcWithPrivateMembers(
				{ gcFeature: 0, gcFeatureMatrix: { sweepGeneration: 0 } },
				{ [gcSweepGenerationOptionName]: 0 },
			);
			assert(!gc.configs.gcEnabled, "gcEnabled incorrect");
			assert(gc.configs.sweepEnabled, "sweepEnabled incorrect");
			assert(!gc.configs.shouldRunSweep, "shouldRunSweep incorrect");
			assert.equal(
				gc.summaryStateTracker.latestSummaryGCVersion,
				0,
				"latestSummaryGCVersion incorrect",
			);
		});
		it("gcFeature 1", () => {
			gc = createGcWithPrivateMembers({ gcFeature: 1 });
			assert(gc.configs.gcEnabled, "gcEnabled incorrect");
			assert.equal(
				gc.summaryStateTracker.latestSummaryGCVersion,
				1,
				"latestSummaryGCVersion incorrect",
			);
		});
		it("sweepEnabled value ignored", () => {
			gc = createGcWithPrivateMembers({ sweepEnabled: true }); // no sweepGeneration option set
			assert(!gc.configs.sweepEnabled, "sweepEnabled incorrect");
		});
		it("sessionExpiryTimeoutMs set (sweepTimeoutMs unset)", () => {
			gc = createGcWithPrivateMembers({
				sessionExpiryTimeoutMs: customSessionExpiryDurationMs,
			});
			assert.equal(
				gc.configs.sessionExpiryTimeoutMs,
				customSessionExpiryDurationMs,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert.equal(
				gc.configs.sweepTimeoutMs,
				customSessionExpiryDurationMs + 6 * oneDayMs,
				"sweepTimeoutMs incorrect",
			);
		});
		it("sweepTimeoutMs set", () => {
			gc = createGcWithPrivateMembers({ sweepTimeoutMs: 123 });
			assert.equal(gc.configs.sweepTimeoutMs, 123, "sweepTimeoutMs incorrect");
		});
		it("Metadata Roundtrip", () => {
			const inputMetadata: IGCMetadata = {
				sweepEnabled: true, // ignored
				gcFeature: 1,
				sessionExpiryTimeoutMs: customSessionExpiryDurationMs,
				sweepTimeoutMs: 123,
				gcFeatureMatrix: { tombstoneGeneration: 1, sweepGeneration: 1 },
			};
			gc = createGcWithPrivateMembers(inputMetadata, {
				[gcTombstoneGenerationOptionName]: 2, // 2 should not be persisted
				[gcSweepGenerationOptionName]: 2, // 2 should not be persisted
			});
			const outputMetadata = gc.getMetadata();
			const expectedOutputMetadata: IGCMetadata = {
				...inputMetadata,
				sweepEnabled: false, // Hardcoded, not used
				gcFeature: stableGCVersion,
			};
			assert.deepEqual(
				outputMetadata,
				expectedOutputMetadata,
				"getMetadata returned different metadata than loaded from",
			);
		});
		it("Metadata Roundtrip with GC version upgrade to v3 enabled", () => {
			injectedSettings[gcVersionUpgradeToV3Key] = true;
			const inputMetadata: IGCMetadata = {
				sweepEnabled: true, // ignored
				gcFeature: 1,
				sessionExpiryTimeoutMs: customSessionExpiryDurationMs,
				sweepTimeoutMs: 123,
				gcFeatureMatrix: { tombstoneGeneration: 1, sweepGeneration: 1 },
			};
			gc = createGcWithPrivateMembers(inputMetadata);
			const outputMetadata = gc.getMetadata();
			const expectedOutputMetadata: IGCMetadata = {
				...inputMetadata,
				sweepEnabled: false, // Hardcoded, not used
				gcFeature: currentGCVersion,
			};
			assert.deepEqual(
				outputMetadata,
				expectedOutputMetadata,
				"getMetadata returned different metadata than loaded from",
			);
		});
		it("Metadata Roundtrip with GC version upgrade to v3 disabled", () => {
			injectedSettings[gcVersionUpgradeToV3Key] = false;
			const inputMetadata: IGCMetadata = {
				sweepEnabled: true, // ignored
				gcFeature: 1,
				sessionExpiryTimeoutMs: customSessionExpiryDurationMs,
				sweepTimeoutMs: 123,
				gcFeatureMatrix: { tombstoneGeneration: 1, sweepGeneration: 1 },
			};
			gc = createGcWithPrivateMembers(inputMetadata);
			const outputMetadata = gc.getMetadata();
			const expectedOutputMetadata: IGCMetadata = {
				...inputMetadata,
				sweepEnabled: false, // Hardcoded, not used
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
			assert(gc.configs.gcEnabled, "gcEnabled incorrect");
			assert(!gc.configs.sweepEnabled, "sweepEnabled incorrect");
			assert(
				gc.configs.sessionExpiryTimeoutMs !== undefined,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert(gc.configs.sweepTimeoutMs !== undefined, "sweepTimeoutMs incorrect");
			assert.equal(
				gc.summaryStateTracker.latestSummaryGCVersion,
				stableGCVersion,
				"latestSummaryGCVersion incorrect",
			);
		});
		it("gcAllowed true", () => {
			gc = createGcWithPrivateMembers(undefined /* metadata */, { gcAllowed: true });
			assert(gc.configs.gcEnabled, "gcEnabled incorrect");
		});
		it("gcAllowed false", () => {
			gc = createGcWithPrivateMembers(undefined /* metadata */, { gcAllowed: false });
			assert(!gc.configs.gcEnabled, "gcEnabled incorrect");
		});
		it("sweepAllowed ignored", () => {
			gc = createGcWithPrivateMembers(undefined /* metadata */, {
				gcAllowed: false,
				sweepAllowed: true, // ignored. Not even checked against gcAllowed.
				// no sweepGeneration option set
			});
			assert(!gc.configs.sweepEnabled, "sweepEnabled incorrect");
		});
		it("sweepGeneration specified, gcAllowed false", () => {
			assert.throws(
				() => {
					gc = createGcWithPrivateMembers(undefined /* metadata */, {
						gcAllowed: false,
						[gcSweepGenerationOptionName]: 1,
					});
				},
				(e: IErrorBase) => e.errorType === "usageError",
				"Should be unsupported",
			);
		});
		it("Sweep enabled via sweepGeneration, gcAllowed true", () => {
			gc = createGcWithPrivateMembers(undefined /* metadata */, {
				gcAllowed: true,
				[gcSweepGenerationOptionName]: 1,
			});
			assert(gc.configs.gcEnabled, "gcEnabled incorrect");
			assert(gc.configs.sweepEnabled, "sweepEnabled incorrect");
			assert(gc.configs.shouldRunSweep, "shouldRunSweep incorrect");
			assert(gc.configs.sweepTimeoutMs !== undefined, "sweepTimeoutMs incorrect");
			assert(
				gc.configs.sessionExpiryTimeoutMs !== undefined,
				"sessionExpiryTimeoutMs incorrect",
			);
		});
		it("Sweep disabled (no sweepGeneration), sessionExpiry on", () => {
			gc = createGcWithPrivateMembers(undefined /* metadata */, {});
			assert(!gc.configs.sweepEnabled, "sweepEnabled incorrect");
			assert(
				gc.configs.sessionExpiryTimeoutMs !== undefined,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert(gc.configs.sweepTimeoutMs !== undefined, "sweepTimeoutMs incorrect");
		});
		it("Sweep enabled via sweepGeneration, gcAllowed true, sessionExpiry off", () => {
			injectedSettings[runSessionExpiryKey] = false;
			gc = createGcWithPrivateMembers(undefined /* metadata */, {
				gcAllowed: true,
				[gcSweepGenerationOptionName]: 1,
			});
			assert(gc.configs.gcEnabled, "gcEnabled incorrect");
			assert(gc.configs.sweepEnabled, "sweepEnabled incorrect");
			assert(
				gc.configs.sessionExpiryTimeoutMs === undefined,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert(gc.configs.sweepTimeoutMs === undefined, "sweepTimeoutMs incorrect");
		});
		it("TestOverride.SweepTimeout set, Sweep disabled (no sweepGeneration), sessionExpiry on", () => {
			injectedSettings[testOverrideSweepTimeoutKey] = 123;
			gc = createGcWithPrivateMembers(undefined /* metadata */, {});
			assert(!gc.configs.sweepEnabled, "sweepEnabled incorrect");
			assert(
				gc.configs.sessionExpiryTimeoutMs === defaultSessionExpiryDurationMs,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert(gc.configs.sweepTimeoutMs === 123, "sweepTimeoutMs incorrect");
		});
		it("TestOverride.SweepTimeout set, Sweep disabled (no sweepGeneration), sessionExpiry off", () => {
			injectedSettings[testOverrideSweepTimeoutKey] = 123;
			injectedSettings[runSessionExpiryKey] = false;
			gc = createGcWithPrivateMembers(undefined /* metadata */, {});
			assert(!gc.configs.sweepEnabled, "sweepEnabled incorrect");
			assert(
				gc.configs.sessionExpiryTimeoutMs === undefined,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert(gc.configs.sweepTimeoutMs === 123, "sweepTimeoutMs incorrect");
		});
		it("Metadata Roundtrip", () => {
			const expectedMetadata: IGCMetadata = {
				sweepEnabled: false, // hardcoded, not used
				gcFeature: stableGCVersion,
				sessionExpiryTimeoutMs: defaultSessionExpiryDurationMs,
				sweepTimeoutMs: defaultSessionExpiryDurationMs + 6 * oneDayMs,
				gcFeatureMatrix: { tombstoneGeneration: 2, sweepGeneration: 2 },
			};
			gc = createGcWithPrivateMembers(undefined /* metadata */, {
				sweepAllowed: true, // ignored
				[gcTombstoneGenerationOptionName]: 2,
				[gcSweepGenerationOptionName]: 2,
			});
			const outputMetadata = gc.getMetadata();
			assert.deepEqual(
				outputMetadata,
				expectedMetadata,
				"getMetadata returned different metadata than expected",
			);
		});
		it("Metadata Roundtrip with GC version upgrade to v3 enabled", () => {
			injectedSettings[gcVersionUpgradeToV3Key] = true;
			const expectedMetadata: IGCMetadata = {
				sweepEnabled: false, // hardcoded, not used
				gcFeature: currentGCVersion,
				sessionExpiryTimeoutMs: defaultSessionExpiryDurationMs,
				sweepTimeoutMs: defaultSessionExpiryDurationMs + 6 * oneDayMs,
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
		it("Metadata Roundtrip with only sweepGeneration", () => {
			const expectedMetadata: IGCMetadata = {
				sweepEnabled: false, // hardcoded, not used
				gcFeature: stableGCVersion,
				sessionExpiryTimeoutMs: defaultSessionExpiryDurationMs,
				sweepTimeoutMs: defaultSessionExpiryDurationMs + 6 * oneDayMs,
				gcFeatureMatrix: { sweepGeneration: 2, tombstoneGeneration: undefined },
			};
			gc = createGcWithPrivateMembers(undefined /* metadata */, {
				sweepAllowed: true, // ignored
				[gcSweepGenerationOptionName]: 2,
			});
			const outputMetadata = gc.getMetadata();
			assert.deepEqual(
				outputMetadata,
				expectedMetadata,
				"getMetadata returned different metadata than expected",
			);
		});
	});

	describe("Session Expiry and Sweep Timeout", () => {
		beforeEach(() => {
			injectedSettings["Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs"] = 1; // To ensure it's less than sweep timeout
		});

		// Config sources for Session Expiry:
		// 1. defaultSessionExpiryDurationMs in code
		// 2. IGCRuntimeOptions.sessionExpiryTimeoutMs
		// 3. IGCMetadata.sessionExpiryTimeoutMs
		// 4. "Fluid.GarbageCollection.TestOverride.SessionExpiryMs" setting
		// Config sources for Sweep Timeout:
		// 1. IGCMetadata.sweepTimeoutMs
		// 2. Computed from Session Expiry, fixed upper bound for Snapshot Expiry and a fixed buffer (on create, or to backfill existing)
		// 3. "Fluid.GarbageCollection.TestOverride.SweepTimeoutMs" setting (only applicable on create)

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
				gc.configs.sweepTimeoutMs,
				defaultSessionExpiryDurationMs + 6 * oneDayMs,
				"sweepTimeoutMs incorrect",
			);
		});
		it("defaultSessionExpiryDurationMs, TestOverride.SweepTimeout set", () => {
			injectedSettings[testOverrideSweepTimeoutKey] = 7890;
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
			assert.equal(gc.configs.sweepTimeoutMs, 7890, "sweepTimeoutMs incorrect");
		});
		it("gcAllowed off, session expiry off", () => {
			gc = gc = createGcWithPrivateMembers(undefined /* metadata */, {
				gcAllowed: false,
			});
			assert.equal(
				gc.configs.sessionExpiryTimeoutMs,
				undefined,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert.equal(gc.sessionExpiryTimer, undefined, "sessionExpiryTimer incorrect");
			assert.equal(gc.configs.sweepTimeoutMs, undefined, "sweepTimeoutMs incorrect");
		});
		it("IGCRuntimeOptions.sessionExpiryTimeoutMs", () => {
			gc = createGcWithPrivateMembers(undefined /* metadata */, {
				sessionExpiryTimeoutMs: 123,
			});
			assert.equal(
				gc.configs.sessionExpiryTimeoutMs,
				123,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert.equal(gc.sessionExpiryTimer.defaultTimeout, 123, "sessionExpiryTimer incorrect");
			assert.equal(gc.configs.sweepTimeoutMs, 123 + 6 * oneDayMs, "sweepTimeoutMs incorrect");
		});
		it("IGCMetadata.sessionExpiryTimeoutMs, backfill sweepTimeoutMs", () => {
			injectedSettings[testOverrideSweepTimeoutKey] = 1337; // Should be ignored
			gc = createGcWithPrivateMembers({ sessionExpiryTimeoutMs: 456 } /* metadata */);
			assert.equal(
				gc.configs.sessionExpiryTimeoutMs,
				456,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert.equal(gc.sessionExpiryTimer.defaultTimeout, 456, "sessionExpiryTimer incorrect");
			assert.equal(gc.configs.sweepTimeoutMs, 456 + 6 * oneDayMs, "sweepTimeoutMs incorrect");
		});
		it("IGCMetadata.sessionExpiryTimeoutMs and IGCMetadata.sweepTimeoutMs", () => {
			injectedSettings[testOverrideSweepTimeoutKey] = 1337; // Should be ignored
			gc = createGcWithPrivateMembers(
				{ sessionExpiryTimeoutMs: 456, sweepTimeoutMs: 789 } /* metadata */,
			);
			assert.equal(
				gc.configs.sessionExpiryTimeoutMs,
				456,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert.equal(gc.sessionExpiryTimer.defaultTimeout, 456, "sessionExpiryTimer incorrect");
			assert.equal(gc.configs.sweepTimeoutMs, 789, "sweepTimeoutMs incorrect");
		});
		it("IGCMetadata.sweepTimeoutMs only", () => {
			injectedSettings[testOverrideSweepTimeoutKey] = 1337; // Should be ignored
			// This could happen if you used TestOverride.SweepTimeoutMs but had SessionExpiry disabled, then loaded that container.
			gc = createGcWithPrivateMembers({ sweepTimeoutMs: 789 } /* metadata */);
			assert.equal(
				gc.configs.sessionExpiryTimeoutMs,
				undefined,
				"sessionExpiryTimeoutMs incorrect",
			);
			assert.equal(gc.sessionExpiryTimer, undefined, "sessionExpiryTimer incorrect");
			assert.equal(gc.configs.sweepTimeoutMs, 789, "sweepTimeoutMs incorrect");
		});
		it("RunSessionExpiry setting turned off", () => {
			injectedSettings[runSessionExpiryKey] = false;
			injectedSettings[testOverrideSessionExpiryMsKey] = 1234; // This override should be ignored
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
			assert.equal(gc.configs.sweepTimeoutMs, undefined, "sweepTimeoutMs incorrect");
		});
		it("RunSessionExpiry setting turned off, TestOverride.SweepTimeout set", () => {
			injectedSettings[runSessionExpiryKey] = false;
			injectedSettings[testOverrideSweepTimeoutKey] = 7890;
			injectedSettings[testOverrideSessionExpiryMsKey] = 1234; // This override should be ignored
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
			assert.equal(gc.configs.sweepTimeoutMs, 7890, "sweepTimeoutMs incorrect");
		});

		function testSessionExpiryMsOverride() {
			const expectedSweepTimeoutMs = defaultSessionExpiryDurationMs + 6 * oneDayMs;
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
				gc.configs.sweepTimeoutMs,
				expectedSweepTimeoutMs,
				"sweepTimeoutMs incorrect",
			);

			const expectedMetadata: IGCMetadata = {
				sweepEnabled: false,
				gcFeature: stableGCVersion,
				sessionExpiryTimeoutMs: defaultSessionExpiryDurationMs,
				sweepTimeoutMs: expectedSweepTimeoutMs,
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
			injectedSettings[testOverrideSessionExpiryMsKey] = 789;
			gc = createGcWithPrivateMembers();
			testSessionExpiryMsOverride();
		});
		it("TestOverride.SessionExpiryMs setting applied to timeout but not written to file - Existing Container", () => {
			injectedSettings[testOverrideSessionExpiryMsKey] = 789;
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
			injectedSettings["Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs"] = 1; // To ensure it's less than sweep timeout
		});

		describe("shouldRunGC", () => {
			const testCases: {
				gcEnabled: boolean;
				disableGC?: boolean;
				runGC?: boolean;
				expectedResult: boolean;
			}[] = [
				{ gcEnabled: false, disableGC: true, runGC: true, expectedResult: true },
				{ gcEnabled: true, disableGC: false, runGC: false, expectedResult: false },
				{ gcEnabled: true, disableGC: true, expectedResult: false },
				{ gcEnabled: true, disableGC: false, expectedResult: true },
				{ gcEnabled: true, expectedResult: true },
				{ gcEnabled: false, expectedResult: false },
			];
			testCases.forEach((testCase) => {
				it(`Test Case ${JSON.stringify(testCase)}`, () => {
					injectedSettings[runGCKey] = testCase.runGC;
					gc = createGcWithPrivateMembers(undefined /* metadata */, {
						gcAllowed: testCase.gcEnabled,
						disableGC: testCase.disableGC,
					});
					assert.equal(
						gc.configs.gcEnabled,
						testCase.gcEnabled,
						"PRECONDITION: gcEnabled set incorrectly",
					);
					assert.equal(
						gc.configs.shouldRunGC,
						testCase.expectedResult,
						"shouldRunGC not set as expected",
					);
				});
			});

			it("shouldRunGC should be true when gcVersionInEffect is newer than gcVersionInBaseSnapshot", () => {
				const gcVersionInBaseSnapshot = stableGCVersion - 1;
				gc = createGcWithPrivateMembers({ gcFeature: gcVersionInBaseSnapshot });
				assert.equal(gc.configs.gcEnabled, true, "PRECONDITION: gcEnabled set incorrectly");
				assert.equal(gc.configs.shouldRunGC, true, "shouldRunGC should be true");
				assert.equal(
					gc.configs.gcVersionInBaseSnapshot,
					gcVersionInBaseSnapshot,
					"gcVersionInBaseSnapshot set incorrectly",
				);
			});

			it("shouldRunGC should be false when gcVersionInEffect is older than gcVersionInBaseSnapshot", () => {
				const gcVersionInBaseSnapshot = currentGCVersion + 1;
				gc = createGcWithPrivateMembers({ gcFeature: gcVersionInBaseSnapshot });
				assert.equal(gc.configs.gcEnabled, true, "PRECONDITION: gcEnabled set incorrectly");
				assert.equal(gc.configs.shouldRunGC, false, "shouldRunGC should be false");
				assert.equal(
					gc.configs.gcVersionInBaseSnapshot,
					gcVersionInBaseSnapshot,
					"gcVersionInBaseSnapshot set incorrectly",
				);
			});
		});
		describe("shouldRunSweep", () => {
			const testCases: {
				shouldRunGC: boolean;
				sweepEnabled: boolean;
				shouldRunSweep?: boolean;
				expectedShouldRunSweep: boolean;
			}[] = [
				{
					shouldRunGC: false,
					sweepEnabled: true,
					shouldRunSweep: true,
					expectedShouldRunSweep: false,
				},
				{
					shouldRunGC: true,
					sweepEnabled: true,
					shouldRunSweep: true,
					expectedShouldRunSweep: true,
				},
				{
					shouldRunGC: true,
					sweepEnabled: true,
					shouldRunSweep: false,
					expectedShouldRunSweep: false,
				},
				{
					shouldRunGC: true,
					sweepEnabled: false,
					shouldRunSweep: true,
					expectedShouldRunSweep: true,
				},
				{
					shouldRunGC: true,
					sweepEnabled: true,
					expectedShouldRunSweep: true,
				},
				{
					shouldRunGC: true,
					sweepEnabled: false,
					expectedShouldRunSweep: false,
				},
			];
			testCases.forEach((testCase, index) => {
				it(`Test Case ${JSON.stringify(testCase)}`, () => {
					injectedSettings[runGCKey] = testCase.shouldRunGC;
					injectedSettings[runSweepKey] = testCase.shouldRunSweep;
					gc = createGcWithPrivateMembers(
						undefined /* metadata */,
						{
							[gcSweepGenerationOptionName]: testCase.sweepEnabled ? 1 : undefined,
						} /* gcOptions */,
					);
					assert.equal(
						gc.configs.shouldRunGC,
						testCase.shouldRunGC,
						"PRECONDITION: shouldRunGC set incorrectly",
					);
					assert.equal(
						gc.configs.sweepEnabled,
						testCase.sweepEnabled,
						"PRECONDITION: sweepEnabled set incorrectly",
					);
					assert.equal(
						gc.configs.shouldRunSweep,
						testCase.expectedShouldRunSweep,
						`shouldRunSweep not set as expected`,
					);
				});
			});
		});
		describe("inactiveTimeoutMs", () => {
			beforeEach(() => {
				// Remove setting added in outer describe block
				injectedSettings["Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs"] =
					undefined;
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
					injectedSettings["Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs"] =
						testCase.testOverride;
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
			it("inactiveTimeout must not be greater than sweepTimeout", () => {
				injectedSettings["Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs"] =
					Number.MAX_VALUE;
				assert.throws(
					() => {
						gc = createGcWithPrivateMembers();
					},
					(e: IErrorBase) => e.errorType === "usageError",
					"inactiveTimeout must not be greater than sweepTimeout",
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
					injectedSettings[gcTestModeKey] = testCase.setting;
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
});
