/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions */

import { strict as assert } from "node:assert";

import type {
	IDocumentDeltaStorageService,
	IDocumentService,
	ISequencedDocumentMessage,
	IStream,
} from "@fluidframework/driver-definitions/internal";
import {
	type IOdspResolvedUrl,
	OdspErrorTypes,
} from "@fluidframework/odsp-driver-definitions/internal";

import { LocalPersistentCache } from "../odspCache.js";
import type { OdspPointInTimeAvailabilityImplementationProps } from "../odspDocumentServiceFactoryCore.js";
/* eslint-disable import-x/no-internal-modules -- Tests target internal point-in-time and version-manager contracts. */
import { checkSequenceNumberAvailabilityCore } from "../pointInTimeDriver/checkSequenceNumberAvailability.js";
import type {
	AvailabilityBaseResults,
	BaseForSeq,
	IOdspVersionManager,
} from "../odspVersionManager/odspVersionManager.js";
/* eslint-enable import-x/no-internal-modules */

function message(
	sequenceNumber: number,
	properties: Partial<ISequencedDocumentMessage> = {},
): ISequencedDocumentMessage {
	return { sequenceNumber, clientId: "client", ...properties } as ISequencedDocumentMessage;
}

function stream(
	reads: (
		| { readonly done: true }
		| { readonly done: false; readonly value: ISequencedDocumentMessage[] }
		| Error
	)[],
): IStream<ISequencedDocumentMessage[]> {
	return {
		read: async () => {
			const next = reads.shift();
			if (next instanceof Error) {
				throw next;
			}
			return next ?? { done: true };
		},
	};
}

function makeManager(result: AvailabilityBaseResults): IOdspVersionManager {
	return {
		findBaseForSeq: async (): Promise<BaseForSeq> =>
			assert.fail("single-target lookup is not expected"),
		findBasesForSeqs: async () => result,
	};
}

function makeProps(
	deltaStorage: IDocumentDeltaStorageService,
	onConnectToStorage?: () => void,
): Omit<OdspPointInTimeAvailabilityImplementationProps, "sequenceNumbers" | "signal"> {
	const resolvedUrl = {
		odspResolvedUrl: true,
		siteUrl: "https://microsoft.sharepoint.com",
		driveId: "drive",
		itemId: "item",
		hashedDocumentId: "hashed",
	} as IOdspResolvedUrl;
	return {
		resolvedUrl,
		persistedCache: new LocalPersistentCache(),
		getStorageToken: async () => "token",
		createDocumentService: async () =>
			({
				connectToStorage: async () => {
					onConnectToStorage?.();
					return assert.fail("availability must not seed live snapshot ops");
				},
				connectToDeltaStorage: async () => deltaStorage,
				dispose: () => {},
			}) as unknown as IDocumentService,
	};
}

async function createPointInTimeAvailabilityProviderCore(
	props: Omit<OdspPointInTimeAvailabilityImplementationProps, "sequenceNumbers" | "signal">,
	dependencies?: Parameters<typeof checkSequenceNumberAvailabilityCore>[1],
): Promise<{
	readonly checkSequenceNumberAvailability: (
		sequenceNumbers: readonly number[],
		options?: { readonly signal?: AbortSignal },
	) => ReturnType<typeof checkSequenceNumberAvailabilityCore>;
}> {
	return {
		checkSequenceNumberAvailability: async (
			sequenceNumbers: readonly number[],
			options?: { readonly signal?: AbortSignal },
		) =>
			checkSequenceNumberAvailabilityCore(
				{
					...props,
					sequenceNumbers,
					signal: options?.signal,
				},
				dependencies,
			),
	};
}

const foundBases: AvailabilityBaseResults = {
	observedStorageSequenceNumber: 100,
	bases: [
		{
			kind: "found",
			base: {
				versionId: "base",
				lastModifiedDateTime: "2026-01-01T00:00:00Z",
				sequenceNumber: 10,
			},
		},
		{
			kind: "found",
			base: {
				versionId: "base",
				lastModifiedDateTime: "2026-01-01T00:00:00Z",
				sequenceNumber: 10,
			},
		},
	],
};

describe("createPointInTimeAvailabilityProvider", () => {
	it("rejects invalid sequence numbers before creating driver services", async () => {
		const deltaStorage = {} as IDocumentDeltaStorageService;
		const provider = await createPointInTimeAvailabilityProviderCore(makeProps(deltaStorage), {
			createVersionManager: () =>
				assert.fail("invalid input must not create a version manager"),
		});

		await assert.rejects(
			provider.checkSequenceNumberAvailability([Number.MAX_SAFE_INTEGER + 1]),
			/non-negative safe integers/i,
		);
	});

	it("returns base-selection results without connecting delta storage", async () => {
		let deltaConnections = 0;
		const deltaStorage = {
			fetchMessages: () => assert.fail("no range should be requested"),
		} as unknown as IDocumentDeltaStorageService;
		const provider = await createPointInTimeAvailabilityProviderCore(
			{
				...makeProps(deltaStorage),
				createDocumentService: async () =>
					({
						connectToDeltaStorage: async () => {
							deltaConnections++;
							return deltaStorage;
						},
						dispose: () => {},
					}) as unknown as IDocumentService,
			},
			{
				createVersionManager: () =>
					makeManager({
						observedStorageSequenceNumber: 50,
						bases: [
							{ kind: "noBaseVersion", oldestResolvedSeq: 10 },
							{ kind: "noBaseVersion" },
							foundBases.bases[0],
						],
					}),
			},
		);

		const result = await provider.checkSequenceNumberAvailability([5, 20, 60]);

		assert.equal(deltaConnections, 0);
		assert.deepEqual(result, [
			{ sequenceNumber: 5, status: "unavailable", reason: "noRetainedBase" },
			{ sequenceNumber: 20, status: "unknown", reason: "transientFailure" },
			{ sequenceNumber: 60, status: "unknown", reason: "transientFailure" },
		]);
	});

	it("preserves conclusive results when the delta service cannot be created", async () => {
		const provider = await createPointInTimeAvailabilityProviderCore(
			{
				...makeProps({} as IDocumentDeltaStorageService),
				createDocumentService: async () => {
					throw new Error("transient service failure");
				},
			},
			{
				createVersionManager: () =>
					makeManager({
						observedStorageSequenceNumber: 100,
						bases: [{ kind: "noBaseVersion", oldestResolvedSeq: 10 }, foundBases.bases[0]],
					}),
			},
		);

		const result = await provider.checkSequenceNumberAvailability([5, 20]);

		assert.deepEqual(result, [
			{ sequenceNumber: 5, status: "unavailable", reason: "noRetainedBase" },
			{ sequenceNumber: 20, status: "unknown", reason: "transientFailure" },
		]);
	});

	it("returns unknown when no sealed base has been resolved", async () => {
		const deltaStorage = {
			fetchMessages: () => assert.fail("no range should be requested"),
		} as unknown as IDocumentDeltaStorageService;
		const provider = await createPointInTimeAvailabilityProviderCore(makeProps(deltaStorage), {
			createVersionManager: () =>
				makeManager({
					observedStorageSequenceNumber: 50,
					bases: [{ kind: "noBaseVersion" }],
				}),
		});

		assert.deepEqual(await provider.checkSequenceNumberAvailability([5]), [
			{ sequenceNumber: 5, status: "unknown", reason: "transientFailure" },
		]);
	});

	it("returns unknown instead of noRetainedBase when retained history crosses a lineage boundary", async () => {
		const deltaStorage = {
			fetchMessages: () => assert.fail("no range should be requested"),
		} as unknown as IDocumentDeltaStorageService;
		const provider = await createPointInTimeAvailabilityProviderCore(makeProps(deltaStorage), {
			createVersionManager: () =>
				makeManager({
					observedStorageSequenceNumber: 100,
					lineageBoundaryObserved: true,
					bases: [{ kind: "noBaseVersion", oldestResolvedSeq: 50 }],
				}),
		});

		assert.deepEqual(await provider.checkSequenceNumberAvailability([40]), [
			{ sequenceNumber: 40, status: "unknown", reason: "transientFailure" },
		]);
	});

	for (const errorType of [
		OdspErrorTypes.fileOverwrittenInStorage,
		OdspErrorTypes.cannotCatchUp,
	]) {
		it(`returns unknown when discovery fails with ${errorType}`, async () => {
			const provider = await createPointInTimeAvailabilityProviderCore(
				makeProps({} as IDocumentDeltaStorageService),
				{
					createVersionManager: () => ({
						findBaseForSeq: async () => assert.fail("single-target lookup is not expected"),
						findBasesForSeqs: async () => {
							throw Object.assign(new Error("discovery failed"), { errorType });
						},
					}),
				},
			);

			assert.deepEqual(await provider.checkSequenceNumberAvailability([20]), [
				{ sequenceNumber: 20, status: "unknown", reason: "transientFailure" },
			]);
		});
	}

	it("returns unknown when version discovery is canceled", async () => {
		const controller = new AbortController();
		const deltaStorage = {
			fetchMessages: () => assert.fail("no range should be requested"),
		} as unknown as IDocumentDeltaStorageService;
		const provider = await createPointInTimeAvailabilityProviderCore(makeProps(deltaStorage), {
			createVersionManager: () => ({
				findBaseForSeq: async () => assert.fail("single-target lookup is not expected"),
				findBasesForSeqs: async () => {
					controller.abort();
					throw controller.signal.reason;
				},
			}),
		});

		const result = await provider.checkSequenceNumberAvailability([20], {
			signal: controller.signal,
		});

		assert.deepEqual(result, [
			{ sequenceNumber: 20, status: "unknown", reason: "transientFailure" },
		]);
	});

	it("preserves a verified prefix and returns unknown when a later op page times out", async () => {
		const transientOpsError = Object.assign(
			new Error("Failed to retrieve ops from storage (Too Many Retries)"),
			{ errorType: "genericNetworkError" },
		);
		const deltaStorage = {
			fetchMessages: () =>
				stream([
					{
						done: false,
						value: Array.from({ length: 15 }, (_value, index) => message(index + 11)),
					},
					transientOpsError,
				]),
		} as IDocumentDeltaStorageService;
		const provider = await createPointInTimeAvailabilityProviderCore(makeProps(deltaStorage), {
			createVersionManager: () => makeManager(foundBases),
		});

		const result = await provider.checkSequenceNumberAvailability([20, 30]);

		assert.deepEqual(result, [
			{ sequenceNumber: 20, status: "available" },
			{ sequenceNumber: 30, status: "unknown", reason: "transientFailure" },
		]);
	});

	it("returns the entire query as unknown when a restore races bridge verification", async () => {
		const epochChange = Object.assign(new Error("restore raced verification"), {
			errorType: OdspErrorTypes.fileOverwrittenInStorage,
		});
		const deltaStorage = {
			fetchMessages: () =>
				stream([
					{
						done: false,
						value: Array.from({ length: 15 }, (_value, index) => message(index + 11)),
					},
					epochChange,
				]),
		} as IDocumentDeltaStorageService;
		const provider = await createPointInTimeAvailabilityProviderCore(makeProps(deltaStorage), {
			createVersionManager: () => makeManager(foundBases),
		});

		const result = await provider.checkSequenceNumberAvailability([20, 30]);

		assert.deepEqual(result, [
			{ sequenceNumber: 20, status: "unknown", reason: "transientFailure" },
			{ sequenceNumber: 30, status: "unknown", reason: "transientFailure" },
		]);
	});

	it("reports an authoritative cannot-catch-up response as missing bridging ops", async () => {
		const cannotCatchUp = Object.assign(new Error("Cannot catch up"), {
			errorType: OdspErrorTypes.cannotCatchUp,
		});
		const deltaStorage = {
			fetchMessages: () => stream([cannotCatchUp]),
		} as IDocumentDeltaStorageService;
		const provider = await createPointInTimeAvailabilityProviderCore(makeProps(deltaStorage), {
			createVersionManager: () => makeManager(foundBases),
		});

		const result = await provider.checkSequenceNumberAvailability([20]);

		assert.deepEqual(result, [
			{
				sequenceNumber: 20,
				status: "unavailable",
				reason: "missingBridgingOps",
			},
		]);
	});

	for (const failurePoint of ["service creation", "delta storage connection"] as const) {
		it(`returns unknown when ${failurePoint} fails with cannot-catch-up`, async () => {
			const cannotCatchUp = Object.assign(new Error("Cannot catch up"), {
				errorType: OdspErrorTypes.cannotCatchUp,
			});
			const baseProps = makeProps({} as IDocumentDeltaStorageService);
			const createDocumentService =
				failurePoint === "service creation"
					? async (): Promise<IDocumentService> => {
							throw cannotCatchUp;
						}
					: async (): Promise<IDocumentService> =>
							({
								connectToDeltaStorage: async () => {
									throw cannotCatchUp;
								},
								dispose: () => {},
							}) as unknown as IDocumentService;
			const provider = await createPointInTimeAvailabilityProviderCore(
				{ ...baseProps, createDocumentService },
				{ createVersionManager: () => makeManager(foundBases) },
			);

			assert.deepEqual(await provider.checkSequenceNumberAvailability([20]), [
				{ sequenceNumber: 20, status: "unknown", reason: "transientFailure" },
			]);
		});
	}

	it("returns unknown when delta storage violates its contiguous stream contract", async () => {
		const deltaStorage = {
			fetchMessages: () => stream([{ done: false, value: [message(11), message(13)] }]),
		} as IDocumentDeltaStorageService;
		const provider = await createPointInTimeAvailabilityProviderCore(makeProps(deltaStorage), {
			createVersionManager: () => makeManager(foundBases),
		});

		assert.deepEqual(await provider.checkSequenceNumberAvailability([20]), [
			{ sequenceNumber: 20, status: "unknown", reason: "transientFailure" },
		]);
	});

	it("returns unknown when cancellation ends the op stream", async () => {
		const controller = new AbortController();
		const deltaStorage = {
			fetchMessages: () => ({
				read: async () => {
					controller.abort();
					return { done: true };
				},
			}),
		} as IDocumentDeltaStorageService;
		const provider = await createPointInTimeAvailabilityProviderCore(makeProps(deltaStorage), {
			createVersionManager: () => makeManager(foundBases),
		});

		const result = await provider.checkSequenceNumberAvailability([20, 30], {
			signal: controller.signal,
		});

		assert.deepEqual(result, [
			{ sequenceNumber: 20, status: "unknown", reason: "transientFailure" },
			{ sequenceNumber: 30, status: "unknown", reason: "transientFailure" },
		]);
	});

	it("uses delta storage without connecting the live service to storage", async () => {
		let storageConnections = 0;
		const deltaStorage = {
			fetchMessages: () =>
				stream([
					{ done: false, value: Array.from({ length: 20 }, (_, i) => message(i + 11)) },
					{ done: true },
				]),
		} as IDocumentDeltaStorageService;
		const provider = await createPointInTimeAvailabilityProviderCore(
			makeProps(deltaStorage, () => {
				storageConnections++;
			}),
			{ createVersionManager: () => makeManager(foundBases) },
		);

		const result = await provider.checkSequenceNumberAvailability([20, 30]);

		assert.equal(storageConnections, 0);
		assert.deepEqual(
			result.map(({ status }) => status),
			["available", "available"],
		);
	});

	it("validates from the historical snapshot sequence regardless of bundled ops", async () => {
		let requestedFrom: number | undefined;
		const deltaStorage = {
			fetchMessages: (from: number) => {
				requestedFrom = from;
				return stream([
					{
						done: false,
						value: Array.from({ length: 20 }, (_, index) => message(index + 11)),
					},
					{ done: true },
				]);
			},
		} as IDocumentDeltaStorageService;
		const bases: AvailabilityBaseResults = {
			observedStorageSequenceNumber: 100,
			bases: foundBases.bases.map((base) =>
				base.kind === "found"
					? {
							...base,
							base: { ...base.base, latestSequenceNumber: 20 },
						}
					: base,
			),
		};
		const provider = await createPointInTimeAvailabilityProviderCore(makeProps(deltaStorage), {
			createVersionManager: () => makeManager(bases),
		});

		const result = await provider.checkSequenceNumberAvailability([20, 30]);

		assert.equal(requestedFrom, 11);
		assert.deepEqual(
			result.map(({ status }) => status),
			["available", "available"],
		);
	});

	it("reports targets inside a runtime batch as unavailable", async () => {
		const deltaStorage = {
			fetchMessages: () =>
				stream([
					{
						done: false,
						value: [
							message(11, { metadata: { batch: true } }),
							message(12),
							message(13, { metadata: { batch: false } }),
						],
					},
					{ done: true },
				]),
		} as IDocumentDeltaStorageService;
		const provider = await createPointInTimeAvailabilityProviderCore(makeProps(deltaStorage), {
			createVersionManager: () =>
				makeManager({
					observedStorageSequenceNumber: 100,
					bases: [foundBases.bases[0], foundBases.bases[0], foundBases.bases[0]],
				}),
		});

		assert.deepEqual(await provider.checkSequenceNumberAvailability([11, 12, 13]), [
			{
				sequenceNumber: 11,
				status: "unavailable",
				reason: "notMaterializationBoundary",
			},
			{
				sequenceNumber: 12,
				status: "unavailable",
				reason: "notMaterializationBoundary",
			},
			{ sequenceNumber: 13, status: "available" },
		]);
	});

	it("reports intermediate chunks as unavailable and the final chunk as available", async () => {
		const chunk = (
			sequenceNumber: number,
			chunkId: number,
			totalChunks: number,
			clientId = "client",
		): ISequencedDocumentMessage =>
			message(sequenceNumber, {
				clientId,
				contents: JSON.stringify({
					type: "chunkedOp",
					contents: { chunkId, totalChunks, contents: "part" },
				}),
			});
		const deltaStorage = {
			fetchMessages: () =>
				stream([
					{
						done: false,
						value: [chunk(11, 1, 3), chunk(12, 2, 3), chunk(13, 3, 3)],
					},
					{ done: true },
				]),
		} as IDocumentDeltaStorageService;
		const provider = await createPointInTimeAvailabilityProviderCore(makeProps(deltaStorage), {
			createVersionManager: () =>
				makeManager({
					observedStorageSequenceNumber: 100,
					bases: [foundBases.bases[0], foundBases.bases[0], foundBases.bases[0]],
				}),
		});

		assert.deepEqual(await provider.checkSequenceNumberAvailability([11, 12, 13]), [
			{
				sequenceNumber: 11,
				status: "unavailable",
				reason: "notMaterializationBoundary",
			},
			{
				sequenceNumber: 12,
				status: "unavailable",
				reason: "notMaterializationBoundary",
			},
			{ sequenceNumber: 13, status: "available" },
		]);
	});

	it("treats each completed interleaved chunk stream as its own boundary", async () => {
		const chunk = (
			sequenceNumber: number,
			clientId: string,
			chunkId: number,
			totalChunks: number,
		): ISequencedDocumentMessage =>
			message(sequenceNumber, {
				clientId,
				contents: JSON.stringify({
					type: "chunkedOp",
					contents: { chunkId, totalChunks, contents: "part" },
				}),
			});
		const deltaStorage = {
			fetchMessages: () =>
				stream([
					{
						done: false,
						value: [
							chunk(11, "client-a", 1, 2),
							chunk(12, "client-b", 1, 2),
							chunk(13, "client-a", 2, 2),
							chunk(14, "client-b", 2, 2),
						],
					},
					{ done: true },
				]),
		} as IDocumentDeltaStorageService;
		const provider = await createPointInTimeAvailabilityProviderCore(makeProps(deltaStorage), {
			createVersionManager: () =>
				makeManager({
					observedStorageSequenceNumber: 100,
					bases: Array.from({ length: 4 }, () => foundBases.bases[0]),
				}),
		});

		const result = await provider.checkSequenceNumberAvailability([11, 12, 13, 14]);
		assert.deepEqual(
			result.map(({ status }) => status),
			["unavailable", "unavailable", "available", "available"],
		);
	});

	it("allows replay to begin in an initial partial chunk stream", async () => {
		const chunk = (sequenceNumber: number, chunkId: number): ISequencedDocumentMessage =>
			message(sequenceNumber, {
				contents: JSON.stringify({
					type: "chunkedOp",
					contents: { chunkId, totalChunks: 3, contents: "part" },
				}),
			});
		const deltaStorage = {
			fetchMessages: () =>
				stream([{ done: false, value: [chunk(11, 2), chunk(12, 3)] }, { done: true }]),
		} as IDocumentDeltaStorageService;
		const provider = await createPointInTimeAvailabilityProviderCore(makeProps(deltaStorage), {
			createVersionManager: () =>
				makeManager({
					observedStorageSequenceNumber: 100,
					bases: [foundBases.bases[0], foundBases.bases[0]],
				}),
		});

		assert.deepEqual(await provider.checkSequenceNumberAvailability([11, 12]), [
			{
				sequenceNumber: 11,
				status: "unavailable",
				reason: "notMaterializationBoundary",
			},
			{ sequenceNumber: 12, status: "available" },
		]);
	});
});
