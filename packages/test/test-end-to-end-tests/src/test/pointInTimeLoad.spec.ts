/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { OdspTestDriver } from "@fluid-private/test-drivers";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import { loadContainerToSequenceNumber } from "@fluidframework/container-loader/internal";
import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type {
	IDocumentDeltaStorageService,
	IDocumentService,
	IDocumentServiceFactory,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import { UsageError } from "@fluidframework/driver-utils/internal";
import type {
	IOdspVersionManager,
	ResolvedVersion,
} from "@fluidframework/odsp-driver/internal";
import {
	LocalCodeLoader,
	createSummarizer,
	summarizeNow,
	waitForContainerConnection,
	type ITestContainerConfig,
	type ITestFluidObject,
	type ITestObjectProvider,
} from "@fluidframework/test-utils/internal";

/**
 * A point-in-time capable factory is the capability the loader detects to drive
 * {@link loadContainerToSequenceNumber}. `createVersionManager` is the version-enumeration surface
 * the point-in-time service uses internally (list a file's ODSP versions, then pick the closest base
 * at or before a target sequence number); this test drives that exact same technique. This is the
 * minimal shape the test relies on, layered on the real ODSP factory returned by the test driver.
 */
interface IPointInTimeCapableDocumentServiceFactory extends IDocumentServiceFactory {
	createPointInTimeDocumentService(
		resolvedUrl: IResolvedUrl,
		targetSequenceNumber: number,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService>;
	createVersionManager(
		resolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IOdspVersionManager>;
}

/**
 * Wraps a point-in-time capable factory so a test can observe the ops the loader actually receives
 * from the (real ODSP) `/opStream` delta feed while replaying to the target. Every other member is
 * delegated untouched; only the materialized service's delta storage is instrumented.
 */
function instrumentPointInTimeFactory(
	inner: IPointInTimeCapableDocumentServiceFactory,
	onReturnedOpSeq: (sequenceNumber: number) => void,
): IPointInTimeCapableDocumentServiceFactory {
	const wrapService = (service: IDocumentService): IDocumentService =>
		new Proxy(service, {
			get: (target, prop, receiver) => {
				if (prop === "connectToDeltaStorage") {
					return async (): Promise<IDocumentDeltaStorageService> => {
						const innerDeltaStorage = await target.connectToDeltaStorage();
						return {
							fetchMessages: (from, to, abortSignal, cachedOnly, fetchReason) => {
								const innerStream = innerDeltaStorage.fetchMessages(
									from,
									to,
									abortSignal,
									cachedOnly,
									fetchReason,
								);
								return {
									read: async () => {
										const result = await innerStream.read();
										if (!result.done) {
											for (const op of result.value) {
												onReturnedOpSeq(op.sequenceNumber);
											}
										}
										return result;
									},
								};
							},
						};
					};
				}
				return Reflect.get(target, prop, receiver) as unknown;
			},
		});

	return new Proxy(inner, {
		get: (target, prop, receiver) => {
			if (prop === "createPointInTimeDocumentService") {
				return async (
					resolvedUrl: IResolvedUrl,
					targetSequenceNumber: number,
					logger?: ITelemetryBaseLogger,
					clientIsSummarizer?: boolean,
				): Promise<IDocumentService> =>
					wrapService(
						await target.createPointInTimeDocumentService(
							resolvedUrl,
							targetSequenceNumber,
							logger,
							clientIsSummarizer,
						),
					);
			}
			return Reflect.get(target, prop, receiver) as unknown;
		},
	});
}

/**
 * Point-in-time (sequence-number-based) container loading against the real ODSP service.
 *
 * @remarks
 * This exercises the real ODSP REST surface end-to-end, following the exact technique the
 * point-in-time document service uses in production:
 *
 * 1. Enumerate the file's versions via the version list (`/versions`), resolving each version's
 * Fluid sequence number from its snapshot (`/versions/{id}/opStream/snapshots/trees/latest`).
 * ODSP returns these newest-first, so their sequence numbers must be strictly descending.
 * 2. Pick an arbitrary target sequence number that falls strictly between two versions.
 * 3. Select the closest version at or before the target as the replay base (`findBaseForSeq`), then
 * replay ops forward from that base to the target over the live `/opStream` delta feed.
 *
 * It only runs against the ODSP driver and is skipped otherwise. Versions are created by submitting
 * summaries: each summary produces a new file version on ODSP the version manager can select as a
 * base to replay from.
 */
describeCompat(
	"Point-in-time container loading (ODSP real service)",
	"NoCompat",
	(getTestObjectProvider) => {
		let provider: ITestObjectProvider;

		const testContainerConfig: ITestContainerConfig = {
			runtimeOptions: {
				summaryOptions: {
					summaryConfigOverrides: { state: "disabled" },
				},
			},
		};

		// Every key set on the source container, mapped to the sequence number at which it landed.
		// The expected state at any target T is exactly { key : keySeq[key] <= T }.
		const keySeq = new Map<string, number>();
		let containerUrl: string;
		let resolvedUrl: IResolvedUrl;
		// The full sequence number after all ops and summaries were applied.
		let fullSeqNum: number;

		function pointInTimeFactory(): IPointInTimeCapableDocumentServiceFactory {
			// The driver builds an OdspPointInTimeDocumentServiceFactory wired with the same
			// credentials the provider uses, so the load hits the same file over the real service.
			return (
				provider.driver as OdspTestDriver
			).createPointInTimeDocumentServiceFactory() as unknown as IPointInTimeCapableDocumentServiceFactory;
		}

		/**
		 * Enumerate the file's ODSP versions with their resolved sequence numbers, exactly as the
		 * point-in-time service does internally when selecting a base to replay from.
		 */
		async function listResolvedVersions(): Promise<ResolvedVersion[]> {
			const versionManager = await pointInTimeFactory().createVersionManager(resolvedUrl);
			return versionManager.listVersions();
		}

		async function loadToSequenceNumber(
			loadToSequenceNumberValue: number,
			documentServiceFactory: IDocumentServiceFactory = pointInTimeFactory(),
		): Promise<IContainer> {
			const codeLoader = new LocalCodeLoader([
				[provider.defaultCodeDetails, provider.createFluidEntryPoint(testContainerConfig)],
			]);
			return loadContainerToSequenceNumber({
				codeLoader,
				urlResolver: provider.urlResolver,
				documentServiceFactory,
				request: { url: containerUrl },
				loadToSequenceNumber: loadToSequenceNumberValue,
			});
		}

		/** Present/absent keys expected at a target sequence number, per the recorded key/seq map. */
		function expectedKeysAt(target: number): { present: string[]; absent: string[] } {
			const present: string[] = [];
			const absent: string[] = [];
			for (const [key, seq] of keySeq) {
				(seq <= target ? present : absent).push(key);
			}
			return { present, absent };
		}

		function assertStateAt(dataObject: ITestFluidObject, target: number): void {
			const { present, absent } = expectedKeysAt(target);
			for (const key of present) {
				assert.strictEqual(
					dataObject.root.get(key),
					Number(key),
					`key ${key} (set at seq ${keySeq.get(key)}) should be present at target ${target}`,
				);
			}
			for (const key of absent) {
				assert.strictEqual(
					dataObject.root.get(key),
					undefined,
					`key ${key} (set at seq ${keySeq.get(key)}) should NOT be present at target ${target}`,
				);
			}
		}

		beforeEach("setup source container", async function () {
			provider = getTestObjectProvider();
			// Point-in-time loading is implemented for ODSP only; the version APIs it depends on do
			// not exist on the other drivers.
			if (provider.driver.type !== "odsp") {
				this.skip();
			}

			keySeq.clear();

			const mainContainer = await provider.makeTestContainer(testContainerConfig);
			const dataObject = (await mainContainer.getEntryPoint()) as ITestFluidObject;
			await waitForContainerConnection(mainContainer);

			// Summarizer used to force file versions on the server at known reference sequence numbers.
			const { summarizer } = await createSummarizer(
				provider,
				mainContainer,
				testContainerConfig,
			);

			// Interleave single-key ops and summaries so several ODSP versions exist, each at a
			// distinct sequence number, and every key's landing sequence number is recorded exactly.
			// Multiple summaries => multiple versions => a real base-selection + forward-replay path.
			let nextKey = 0;
			for (let batch = 0; batch < 4; batch++) {
				for (let i = 0; i < 3; i++) {
					const key = (nextKey++).toString();
					dataObject.root.set(key, Number(key));
					await provider.ensureSynchronized();
					keySeq.set(key, mainContainer.deltaManager.lastSequenceNumber);
				}
				await summarizeNow(summarizer, `batch-${batch}`);
			}

			fullSeqNum = mainContainer.deltaManager.lastSequenceNumber;

			const url = await mainContainer.getAbsoluteUrl("");
			assert(url !== undefined, "Expected the source container to provide an absolute URL");
			containerUrl = url;
			const maybeResolved = await provider.urlResolver.resolve({ url: containerUrl });
			assert(maybeResolved !== undefined, "Expected the container URL to resolve");
			resolvedUrl = maybeResolved;

			summarizer.close();
			mainContainer.close();
		});

		it("enumerates file versions in strictly descending sequence-number order", async () => {
			const versions = await listResolvedVersions();
			assert(
				versions.length >= 2,
				`expected multiple ODSP versions, found ${versions.length}`,
			);
			// ODSP lists versions newest-first; production relies on their sequence numbers being
			// monotonically descending so newest-to-oldest scanning finds the closest base.
			for (let i = 1; i < versions.length; i++) {
				assert(
					versions[i - 1].sequenceNumber > versions[i].sequenceNumber,
					`versions must be strictly descending by sequence number: index ${
						i - 1
					} (${versions[i - 1].sequenceNumber}) is not greater than index ${i} (${
						versions[i].sequenceNumber
					})`,
				);
			}
		});

		it("loads to an arbitrary target: closest base selected, ops replayed forward", async () => {
			const versions = await listResolvedVersions();
			assert(
				versions.length >= 2,
				"need at least two versions to pick an intermediate target",
			);

			// index 0 is the tip (live) version, which findBaseForSeq excludes as a base. Pick a
			// non-tip base and an arbitrary target strictly above it (so ops are replayed forward on
			// top of that base) but below the tip (so the tip is not itself the answer).
			const base = versions[1];
			const tip = versions[0];
			assert(
				tip.sequenceNumber - base.sequenceNumber >= 2,
				`need room between base (${base.sequenceNumber}) and tip (${tip.sequenceNumber}) for an intermediate target`,
			);
			const target = base.sequenceNumber + 1;

			// Demonstrate closest-base selection: the manager must pick `base` (the greatest version
			// at or before the target), not the tip and not an older version.
			const versionManager = await pointInTimeFactory().createVersionManager(resolvedUrl);
			const baseForSeq = await versionManager.findBaseForSeq(target);
			assert.strictEqual(
				baseForSeq.kind,
				"found",
				"a base at or before the target must exist",
			);
			assert.strictEqual(
				baseForSeq.base.sequenceNumber,
				base.sequenceNumber,
				`closest base for target ${target} should be version at seq ${base.sequenceNumber}`,
			);

			const container = await loadToSequenceNumber(target);
			try {
				assert.strictEqual(
					container.deltaManager.lastSequenceNumber,
					target,
					"loaded sequence number should match the arbitrary target",
				);
				const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
				assertStateAt(dataObject, target);
			} finally {
				container.close();
			}
		});

		it("bounds the replay: no op past the target is ever returned from the real op stream", async () => {
			const versions = await listResolvedVersions();
			const target = versions[1].sequenceNumber + 1;

			// White-box counterpart to the state-based tests: instrument the real ODSP delta feed to
			// prove the bound holds at the data level, not just that the resulting state looks right.
			let maxReturnedSeq = -1;
			const instrumentedFactory = instrumentPointInTimeFactory(pointInTimeFactory(), (seq) => {
				maxReturnedSeq = Math.max(maxReturnedSeq, seq);
			});

			const container = await loadToSequenceNumber(target, instrumentedFactory);
			try {
				assert.strictEqual(
					container.deltaManager.lastSequenceNumber,
					target,
					"loaded sequence number should match the target",
				);
				assert(
					maxReturnedSeq <= target,
					`no op past the target should be returned; max returned seq ${maxReturnedSeq} exceeds target ${target}`,
				);
				const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
				assertStateAt(dataObject, target);
			} finally {
				container.close();
			}
		});

		it("loads to the latest sequence number with all ops applied", async () => {
			const container = await loadToSequenceNumber(fullSeqNum);
			try {
				assert.strictEqual(
					container.deltaManager.lastSequenceNumber,
					fullSeqNum,
					"loaded sequence number should match the target",
				);
				const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
				assertStateAt(dataObject, fullSeqNum);
			} finally {
				container.close();
			}
		});

		it("materializes a read-only, disconnected container", async () => {
			const versions = await listResolvedVersions();
			const target = versions[1].sequenceNumber + 1;
			const container = await loadToSequenceNumber(target);
			try {
				assert.strictEqual(
					container.deltaManager.readOnlyInfo.readonly,
					true,
					"point-in-time container should be read-only",
				);
				assert.strictEqual(
					container.deltaManager.active,
					false,
					"point-in-time container should not have an active delta connection",
				);
			} finally {
				container.close();
			}
		});

		it("rejects a negative loadToSequenceNumber", async () => {
			await assert.rejects(
				loadToSequenceNumber(-1),
				(error: Error) => error instanceof UsageError,
				"a negative target should be rejected",
			);
		});

		it("rejects a non-integer loadToSequenceNumber", async () => {
			await assert.rejects(
				loadToSequenceNumber(1.5),
				(error: Error) => error instanceof UsageError,
				"a non-integer target should be rejected",
			);
		});

		it("rejects a factory that does not support point-in-time loading", async () => {
			await assert.rejects(
				loadToSequenceNumber(fullSeqNum, provider.documentServiceFactory),
				(error: Error) => error instanceof UsageError,
				"a factory without createPointInTimeDocumentService should be rejected",
			);
		});
	},
);
