/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Unit and integration coverage for the point-in-time load entry point.
 *
 * Input-validation tests use tripwire dependencies to prove malformed targets fail before loading
 * begins. Telemetry tests use a locally generated Fluid snapshot to exercise successful loading,
 * snapshot-boundary validation, and failure reporting without requiring service credentials.
 */

import { strict as assert } from "node:assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import type { ICodeDetailsLoader } from "@fluidframework/container-definitions/internal";
import {
	FluidErrorTypes,
	LogLevel,
	type IErrorBase,
} from "@fluidframework/core-interfaces/internal";
import type {
	IDocumentService,
	IDocumentServiceFactory,
	IResolvedUrl,
	ISnapshot,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import {
	createGenericNetworkError,
	NonRetryableError,
} from "@fluidframework/driver-utils/internal";
import { GenericError, MockLogger } from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import { loadContainerToSequenceNumber } from "../loadContainerToSequenceNumber.js";
import { Loader } from "../loader.js";
import { getDetachedContainerStateFromSerializedContainer } from "../utils.js";

import { failProxy } from "./failProxy.js";
import {
	createTestCodeLoaderProxy,
	createTestDocumentServiceFactoryProxy,
} from "./testProxies.js";

/** A resolver that fails the test if the load gets far enough to resolve the request. */
const tripwireUrlResolver = {
	resolve: async () => assert.fail("urlResolver must not be used for a malformed target"),
	getAbsoluteUrl: async () =>
		assert.fail("urlResolver must not be used for a malformed target"),
} as unknown as IUrlResolver;

/**
 * A factory that fails the test if it is inspected. Note it is deliberately *not* point-in-time
 * capable: reaching it would raise a different `UsageError`, so the assertions below also prove the
 * target check runs before the capability check.
 */
const tripwireDocumentServiceFactory = {
	createDocumentService: async () =>
		assert.fail("documentServiceFactory must not be used for a malformed target"),
	createContainer: async () =>
		assert.fail("documentServiceFactory must not be used for a malformed target"),
} as unknown as IDocumentServiceFactory;

const tripwireCodeLoader = {
	load: async () => assert.fail("codeLoader must not be used for a malformed target"),
} as unknown as ICodeDetailsLoader;

describe("loadContainerToSequenceNumber", () => {
	describe("target sequence number validation", () => {
		const loadTo = async (
			loadToSequenceNumber: number,
			logger?: MockLogger,
		): Promise<unknown> =>
			loadContainerToSequenceNumber({
				codeLoader: tripwireCodeLoader,
				urlResolver: tripwireUrlResolver,
				documentServiceFactory: tripwireDocumentServiceFactory,
				request: { url: "https://example.com/point-in-time-validation" },
				loadToSequenceNumber,
				...(logger === undefined ? {} : { logger }),
			});

		const malformedTargets: [name: string, target: number][] = [
			["negative", -1],
			["negative non-integer", -1.5],
			["non-integer", 1.5],
			["NaN", Number.NaN],
			["Infinity", Number.POSITIVE_INFINITY],
			["-Infinity", Number.NEGATIVE_INFINITY],
		];

		for (const [name, target] of malformedTargets) {
			it(`rejects a ${name} target with a UsageError`, async () => {
				await assert.rejects(
					loadTo(target),
					(error: IErrorBase) =>
						error.errorType === FluidErrorTypes.usageError &&
						/non-negative integer/i.test(error.message),
					`a ${name} target (${target}) should be rejected up front`,
				);
			});
		}

		it("accepts a well-formed target (fails later, on the capability check)", async () => {
			const logger = new MockLogger(LogLevel.essential);
			// 0 is the boundary value: valid, so validation must fall through to the point-in-time
			// capability check. This pins the boundary and proves the guard rejects only malformed
			// targets rather than everything.
			await assert.rejects(
				loadTo(0, logger),
				(error: IErrorBase) =>
					error.errorType === FluidErrorTypes.usageError &&
					/does not support point-in-time loading/i.test(error.message),
				"a valid target should pass validation and reach the capability check",
			);
			assert.deepEqual(
				logger.events,
				[],
				"capability misuse is not a materialization attempt",
			);
		});
	});

	describe("telemetry", () => {
		const resolvedUrl: IResolvedUrl = {
			id: "version-mark-test",
			endpoints: {},
			tokens: {},
			type: "fluid",
			url: `https://localhost/tenant/${uuid()}`,
		};

		const urlResolver: IUrlResolver = {
			resolve: async () => resolvedUrl,
			getAbsoluteUrl: async () => resolvedUrl.url,
		};

		function makeCapableFactory(
			createPointInTimeDocumentService: () => Promise<IDocumentService>,
		): IDocumentServiceFactory {
			return {
				createDocumentService: async () =>
					assert.fail("the adapter should use the capability"),
				createContainer: async () =>
					assert.fail("point-in-time loading cannot create a container"),
				createPointInTimeDocumentService,
			} as unknown as IDocumentServiceFactory;
		}

		async function createSnapshot(sequenceNumber: number): Promise<ISnapshot> {
			const loader = new Loader({
				codeLoader: createTestCodeLoaderProxy(),
				documentServiceFactory: createTestDocumentServiceFactoryProxy(resolvedUrl),
				urlResolver: failProxy(),
			});
			const detached = await loader.createDetachedContainer({ package: "none" });
			const state = getDetachedContainerStateFromSerializedContainer(detached.serialize());
			detached.dispose();
			assert(
				state.baseSnapshot !== undefined,
				"detached state should contain a base snapshot",
			);
			const snapshotTree = { ...state.baseSnapshot, id: "version-mark-snapshot" };
			const protocolAttributesBlobId = snapshotTree.trees[".protocol"]?.blobs.attributes;
			assert(
				protocolAttributesBlobId !== undefined,
				"detached snapshot should contain protocol attributes",
			);
			const blobContents = new Map(
				Object.entries(state.snapshotBlobs).map(([id, content]) => [
					id,
					stringToBuffer(content, "utf8"),
				]),
			);
			const protocolAttributes = JSON.parse(
				bufferToString(
					blobContents.get(protocolAttributesBlobId) ?? new ArrayBuffer(0),
					"utf8",
				),
			) as { sequenceNumber: number; minimumSequenceNumber: number };
			blobContents.set(
				protocolAttributesBlobId,
				stringToBuffer(
					JSON.stringify({
						...protocolAttributes,
						sequenceNumber,
						minimumSequenceNumber: Math.min(
							protocolAttributes.minimumSequenceNumber,
							sequenceNumber,
						),
					}),
					"utf8",
				),
			);
			return {
				snapshotTree,
				blobContents,
				ops: [],
				sequenceNumber,
				latestSequenceNumber: sequenceNumber,
				snapshotFormatV: 1,
			};
		}

		function makeSnapshotService(snapshot: ISnapshot): IDocumentService {
			const storage = {
				getSnapshot: async () => snapshot,
				getVersions: async () => [
					{ id: snapshot.snapshotTree.id, treeId: snapshot.snapshotTree.id },
				],
				getSnapshotTree: async () => snapshot.snapshotTree,
				readBlob: async (id: string) => {
					const blob = snapshot.blobContents.get(id);
					assert(blob !== undefined, `snapshot blob ${id} should exist`);
					return blob;
				},
			};
			return {
				policies: { storageOnly: true, supportGetSnapshotApi: true },
				resolvedUrl,
				connectToStorage: async () => storage,
				dispose: () => {},
				on() {
					return this;
				},
				off() {
					return this;
				},
			} as unknown as IDocumentService;
		}

		const loadWithFactoryFailure = async (
			error: Error & IErrorBase,
			logger: MockLogger,
			loadToSequenceNumber = 42,
			signal?: AbortSignal,
		): Promise<unknown> =>
			loadContainerToSequenceNumber({
				codeLoader: tripwireCodeLoader,
				urlResolver,
				documentServiceFactory: makeCapableFactory(async () => {
					throw error;
				}),
				request: { url: resolvedUrl.url },
				loadToSequenceNumber,
				logger,
				...(signal === undefined ? {} : { signal }),
			});

		it("reports a successful sequence-zero load through an essential-only logger", async () => {
			const service = makeSnapshotService(await createSnapshot(0));
			const logger = new MockLogger(LogLevel.essential);

			const container = await loadContainerToSequenceNumber({
				codeLoader: createTestCodeLoaderProxy({
					runtimeWithout_setConnectionStatus: true,
				}),
				urlResolver,
				documentServiceFactory: makeCapableFactory(async () => service),
				request: { url: resolvedUrl.url },
				loadToSequenceNumber: 0,
				logger,
			});
			assert.equal(container.closed, false);
			logger.assertMatchNone([{ category: "error" }], undefined, false, false);

			const terminalEvent = logger.events.find(
				(event) => event.eventName === "fluid:telemetry:VersionMarkPointInTimeLoadSucceeded",
			);
			assert(Number.isInteger(terminalEvent?.duration));
			logger.assertMatch([
				{
					eventName: "fluid:telemetry:VersionMarkPointInTimeLoadSucceeded",
					category: "performance",
					targetSequenceNumber: 0,
					baseSnapshotSequenceNumber: 0,
					finalSequenceNumber: 0,
					replayedOpCount: 0,
				},
			]);
			container.dispose();
		});

		it("classifies a snapshot newer than the target", async () => {
			const logger = new MockLogger(LogLevel.essential);

			await assert.rejects(
				loadContainerToSequenceNumber({
					codeLoader: createTestCodeLoaderProxy(),
					urlResolver,
					documentServiceFactory: makeCapableFactory(async () =>
						makeSnapshotService(await createSnapshot(50)),
					),
					request: { url: resolvedUrl.url },
					loadToSequenceNumber: 42,
					logger,
				}),
				/Most recent snapshot is newer/,
			);

			logger.assertMatch([
				{
					eventName: "fluid:telemetry:VersionMarkPointInTimeLoadFailed",
					category: "error",
					targetSequenceNumber: 42,
					availabilityOutcome: "targetOlderThanSnapshot",
					baseSnapshotSequenceNumber: 50,
					errorType: FluidErrorTypes.genericError,
					error: "VersionMarkPointInTimeLoadFailed",
					stack: undefined,
				},
			]);
		});

		async function assertMissingOpsTerminalEvent(
			error: Error & IErrorBase,
			expectedErrorType: string,
			assertErrorPropertiesExcluded = false,
		): Promise<void> {
			const logger = new MockLogger(LogLevel.essential);

			await assert.rejects(
				loadWithFactoryFailure(error, logger),
				(candidate: IErrorBase) => candidate === error,
			);

			logger.assertMatch([
				{
					eventName: "fluid:telemetry:VersionMarkPointInTimeLoadFailed",
					category: "error",
					targetSequenceNumber: 42,
					availabilityOutcome: "missingOps",
					baseSnapshotSequenceNumber: undefined,
					errorType: expectedErrorType,
					...(assertErrorPropertiesExcluded
						? {
								error: "VersionMarkPointInTimeLoadFailed",
								stack: undefined,
								driverVersion: undefined,
								versionLabel: undefined,
							}
						: {}),
				},
			]);
		}

		it("propagates missingOps for cannotCatchUp without copying error payloads", async () => {
			await assertMissingOpsTerminalEvent(
				new NonRetryableError("missing ops", "cannotCatchUp", {
					driverVersion: "test-driver",
					versionLabel: "high-cardinality-version-label",
					versionMarkAvailabilityOutcome: "missingOps",
				}),
				"cannotCatchUp",
				true,
			);
		});

		it("propagates missingOps for the bounded-replay genericNetworkError", async () => {
			await assertMissingOpsTerminalEvent(
				createGenericNetworkError(
					"Failed to retrieve ops from storage (Too Many Retries)",
					{ canRetry: false },
					{
						driverVersion: "test-driver",
						versionLabel: "high-cardinality-version-label",
						versionMarkAvailabilityOutcome: "missingOps",
					},
				),
				"genericNetworkError",
			);
		});

		it("does not classify an ordinary network failure as missing ops", async () => {
			const logger = new MockLogger(LogLevel.essential);
			const error = createGenericNetworkError(
				"Failed to contact the storage service",
				{ canRetry: false },
				{ driverVersion: "test-driver" },
			);

			await assert.rejects(
				loadWithFactoryFailure(error, logger),
				(candidate: IErrorBase) => candidate === error,
			);

			logger.assertMatch([
				{
					eventName: "fluid:telemetry:VersionMarkPointInTimeLoadFailed",
					category: "error",
					targetSequenceNumber: 42,
					availabilityOutcome: undefined,
					baseSnapshotSequenceNumber: undefined,
					errorType: "genericNetworkError",
				},
			]);
		});

		it("propagates a known base snapshot on a missing-ops replay failure", async () => {
			const logger = new MockLogger(LogLevel.essential);
			const error = new NonRetryableError("missing ops", "cannotCatchUp", {
				driverVersion: "test-driver",
				versionMarkAvailabilityOutcome: "missingOps",
				versionMarkBaseSnapshotSequenceNumber: 10,
			});

			await assert.rejects(
				loadWithFactoryFailure(error, logger, 12),
				(candidate: IErrorBase) => candidate.errorType === "cannotCatchUp",
			);

			logger.assertMatch([
				{
					eventName: "fluid:telemetry:VersionMarkPointInTimeLoadFailed",
					category: "error",
					targetSequenceNumber: 12,
					availabilityOutcome: "missingOps",
					baseSnapshotSequenceNumber: 10,
					errorType: "cannotCatchUp",
				},
			]);
		});

		it("does not classify an unrelated failure as cancellation when the signal is aborted", async () => {
			const logger = new MockLogger(LogLevel.essential);
			const abortController = new AbortController();
			abortController.abort();
			const error = new GenericError("factory failed");

			await assert.rejects(
				loadWithFactoryFailure(error, logger, 42, abortController.signal),
				(candidate: IErrorBase) => candidate === error,
			);

			logger.assertMatch([
				{
					eventName: "fluid:telemetry:VersionMarkPointInTimeLoadFailed",
					category: "error",
					targetSequenceNumber: 42,
					availabilityOutcome: undefined,
					errorType: FluidErrorTypes.genericError,
					error: "VersionMarkPointInTimeLoadFailed",
					stack: undefined,
				},
			]);
		});
	});
});
