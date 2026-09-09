/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	asLegacyAlpha,
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/internal";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import type { IErrorBase } from "@fluidframework/core-interfaces/internal";
import { Deferred } from "@fluidframework/core-utils/internal";
import type {
	IDocumentDeltaStorageService,
	IDocumentService,
	IDocumentServiceFactory,
	ISequencedDocumentMessage,
	IStream,
} from "@fluidframework/driver-definitions/internal";
import type { ISharedMap } from "@fluidframework/map/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
	getRequiredPendingLocalState,
	type ITestFluidObject,
	timeoutAwait,
	timeoutPromise,
} from "@fluidframework/test-utils/internal";

import { createLoader } from "./utils.js";

/**
 * Intercepts the first storage response containing the saved-op anchor so tests can control
 * when history validation proceeds. Other messages, later fetches, and socket traffic pass through.
 *
 * @param inner - Factory backed by the real local service.
 * @param anchorSequenceNumber - Sequence number of the final op in the saved pending state.
 * @param validationStarted - Resolved when a storage read finds the anchor, before returning it.
 * @param releaseValidation - The intercepted read waits for this to resolve.
 * @param validationCompleted - Optionally resolved when the stream that returned the anchor ends.
 * This signals storage completion, not successful validation or container connection.
 * @param introduceMismatch - If true, changes only the returned anchor's client ID to simulate
 * overwritten history. If false, returns the service response unchanged.
 */
function wrapAnchorValidation(
	inner: IDocumentServiceFactory,
	anchorSequenceNumber: number,
	validationStarted: Deferred<void>,
	releaseValidation: Deferred<void>,
	validationCompleted?: Deferred<void>,
	introduceMismatch = true,
): IDocumentServiceFactory {
	// Shared across streams so only one read is intercepted, even if catch-up starts more fetches.
	let anchorObserved = false;

	/**
	 * Delays the anchor-bearing response and optionally changes that anchor without dropping
	 * other ops. Completion belongs to this stream, not to unrelated concurrent fetches.
	 */
	function wrapStream(
		stream: IStream<ISequencedDocumentMessage[]>,
	): IStream<ISequencedDocumentMessage[]> {
		let validatingFetch = false;
		return {
			read: async () => {
				const result = await stream.read();
				if (result.done) {
					if (validatingFetch) {
						validationCompleted?.resolve();
					}
					return result;
				}
				const anchorIndex = result.value.findIndex(
					(message) => message.sequenceNumber === anchorSequenceNumber,
				);
				if (anchorObserved || anchorIndex === -1) {
					return result;
				}
				anchorObserved = true;
				validatingFetch = true;
				validationStarted.resolve();
				await releaseValidation.promise;
				if (!introduceMismatch) {
					return result;
				}
				return {
					done: false,
					value: result.value.map((message, index) =>
						index === anchorIndex
							? { ...message, clientId: "restored-history-client" }
							: message,
					),
				};
			},
		};
	}

	/** Wraps storage fetch streams while preserving their requested ranges and abort signals. */
	async function connectToDeltaStorage(
		service: IDocumentService,
	): Promise<IDocumentDeltaStorageService> {
		const storage = await service.connectToDeltaStorage();
		return {
			fetchMessages: (...args) => wrapStream(storage.fetchMessages(...args)),
		};
	}

	/** Overrides only delta storage access; all other service operations remain unchanged. */
	const wrapService = (service: IDocumentService): IDocumentService =>
		new Proxy(service, {
			get: (target, property, receiver) => {
				if (property !== "connectToDeltaStorage") {
					return Reflect.get(target, property, receiver) as unknown;
				}
				return async () => connectToDeltaStorage(target);
			},
		});

	return {
		createContainer: async (...args) => wrapService(await inner.createContainer(...args)),
		createDocumentService: async (...args) =>
			wrapService(await inner.createDocumentService(...args)),
	};
}

/**
 * Creates a local container, waits for an edit to be saved, then disconnects and captures its
 * pending state before closing it. The saved ops include an anchor backed by unchanged service
 * history, which tests can compare directly or deliberately corrupt in intercepted responses.
 *
 * @returns The serialized pending state, its final saved-op anchor, and the URL and loader
 * dependencies needed to rehydrate the same document against the existing local service.
 */
async function createPendingState(): Promise<{
	codeLoader: Parameters<typeof loadExistingContainer>[0]["codeLoader"];
	documentServiceFactory: IDocumentServiceFactory;
	urlResolver: Parameters<typeof loadExistingContainer>[0]["urlResolver"];
	url: string;
	pendingLocalState: string;
	anchor: ISequencedDocumentMessage;
}> {
	const deltaConnectionServer = LocalDeltaConnectionServer.create();
	const { codeDetails, loaderProps, urlResolver, codeLoader, documentServiceFactory } =
		createLoader({ deltaConnectionServer });
	const container = asLegacyAlpha(
		await createDetachedContainer({ codeDetails, ...loaderProps }),
	);
	const entryPoint = (await container.getEntryPoint()) as ITestFluidObject;
	const map = await entryPoint.getSharedObject<ISharedMap>("map");
	map.set("before-attach", "value");
	await container.attach(urlResolver.createCreateNewRequest("pending-history-validation"));
	map.set("saved", "value");
	if (container.isDirty) {
		await timeoutPromise((resolve) => container.once("saved", () => resolve()));
	}

	const url = await container.getAbsoluteUrl("");
	assert(url !== undefined, "Expected the attached container to have a URL");
	container.disconnect();
	const pendingLocalState = await getRequiredPendingLocalState(container);
	container.close();

	const pendingState = JSON.parse(pendingLocalState) as {
		savedOps: ISequencedDocumentMessage[];
	};
	const anchor = pendingState.savedOps.at(-1);
	assert(anchor !== undefined, "Expected pending state to contain a saved-op anchor");
	return { codeLoader, documentServiceFactory, urlResolver, url, pendingLocalState, anchor };
}

describe("Pending-state history validation", () => {
	it("remains usable after re-stashing offline state and validating unchanged service history", async () => {
		const { codeLoader, documentServiceFactory, urlResolver, url, pendingLocalState, anchor } =
			await createPendingState();
		const offline = asLegacyAlpha(
			await loadExistingContainer({
				codeLoader,
				documentServiceFactory,
				urlResolver,
				request: {
					url,
					headers: { [LoaderHeader.loadMode]: { deltaConnection: "none" } },
				},
				pendingLocalState,
			}),
		);
		// Re-stashing preserves the loader's savedOp replay marker, which is absent in storage.
		const restashedState = await getRequiredPendingLocalState(offline);
		offline.close();
		const validationStarted = new Deferred<void>();
		const releaseValidation = new Deferred<void>();
		const validationCompleted = new Deferred<void>();
		releaseValidation.resolve();
		const rehydrated = await timeoutAwait(
			loadExistingContainer({
				codeLoader,
				documentServiceFactory: wrapAnchorValidation(
					documentServiceFactory,
					anchor.sequenceNumber,
					validationStarted,
					releaseValidation,
					validationCompleted,
					false,
				),
				urlResolver,
				request: {
					url,
					headers: { [LoaderHeader.loadMode]: { deltaConnection: "none" } },
				},
				pendingLocalState: restashedState,
			}),
		);

		const connectedP = new Promise<void>((resolve) =>
			rehydrated.once("connected", () => resolve()),
		);
		let closeError: IErrorBase | undefined;
		rehydrated.once("closed", (error) => {
			closeError = error;
		});
		rehydrated.connect();
		await Promise.all([timeoutAwait(validationCompleted.promise), timeoutAwait(connectedP)]);
		await new Promise<void>((resolve) => setImmediate(resolve));
		assert.strictEqual(rehydrated.closed, false, closeError?.message);
		const entryPoint = (await rehydrated.getEntryPoint()) as ITestFluidObject;
		const map = await entryPoint.getSharedObject<ISharedMap>("map");
		map.set("after-validation", "value");
		if (rehydrated.isDirty) {
			await timeoutPromise((resolve) => rehydrated.once("saved", () => resolve()));
		}
		assert.strictEqual(map.get("after-validation"), "value");
		assert.strictEqual(rehydrated.closed, false);
		rehydrated.close();
	});

	it("returns before validation completes and closes on a delayed mismatch", async () => {
		const { codeLoader, documentServiceFactory, urlResolver, url, pendingLocalState, anchor } =
			await createPendingState();

		const validationStarted = new Deferred<void>();
		const releaseValidation = new Deferred<void>();
		const loadP = loadExistingContainer({
			codeLoader,
			documentServiceFactory: wrapAnchorValidation(
				documentServiceFactory,
				anchor.sequenceNumber,
				validationStarted,
				releaseValidation,
			),
			urlResolver,
			request: { url },
			pendingLocalState,
		});

		await timeoutAwait(validationStarted.promise);
		const rehydrated = await timeoutAwait(loadP);
		const closedP = new Promise<IErrorBase | undefined>((resolve) =>
			rehydrated.once("closed", (closeError) => resolve(closeError)),
		);
		releaseValidation.resolve();

		const error = await timeoutAwait(closedP);
		assert.match(error?.message ?? "", /same sequenceNumber but different payloads/);
		assert.strictEqual(rehydrated.closed, true);
	});

	it("validates pending state after a deferred connection", async () => {
		const { codeLoader, documentServiceFactory, urlResolver, url, pendingLocalState, anchor } =
			await createPendingState();
		const validationStarted = new Deferred<void>();
		const releaseValidation = new Deferred<void>();
		const rehydrated = await timeoutAwait(
			loadExistingContainer({
				codeLoader,
				documentServiceFactory: wrapAnchorValidation(
					documentServiceFactory,
					anchor.sequenceNumber,
					validationStarted,
					releaseValidation,
				),
				urlResolver,
				request: {
					url,
					headers: { [LoaderHeader.loadMode]: { deltaConnection: "none" } },
				},
				pendingLocalState,
			}),
		);
		const closedP = new Promise<IErrorBase | undefined>((resolve) =>
			rehydrated.once("closed", (closeError) => resolve(closeError)),
		);

		rehydrated.connect();
		await timeoutAwait(validationStarted.promise);
		releaseValidation.resolve();

		const error = await timeoutAwait(closedP);
		assert.match(error?.message ?? "", /same sequenceNumber but different payloads/);
		assert.strictEqual(rehydrated.closed, true);
	});

	it("rejects an invalid saved-op MSN without an unhandled rejection", async () => {
		const { codeLoader, documentServiceFactory, urlResolver, url, pendingLocalState } =
			await createPendingState();
		const pendingState = JSON.parse(pendingLocalState) as {
			savedOps: ISequencedDocumentMessage[];
		};
		const anchor = pendingState.savedOps.at(-1);
		assert(anchor !== undefined, "Expected pending state to contain a saved-op anchor");
		anchor.minimumSequenceNumber = -2;

		const unhandledRejections: unknown[] = [];
		const rejectionHandler = (reason: unknown): void => {
			unhandledRejections.push(reason);
		};
		process.on("unhandledRejection", rejectionHandler);
		try {
			await assert.rejects(
				timeoutAwait(
					loadExistingContainer({
						codeLoader,
						documentServiceFactory,
						urlResolver,
						request: { url },
						pendingLocalState: JSON.stringify(pendingState),
					}),
				),
				/The last processed message's minimum sequence number is below the snapshot minimum sequence number/,
			);
			await new Promise<void>((resolve) => setImmediate(resolve));

			assert.deepStrictEqual(unhandledRejections, []);
		} finally {
			process.off("unhandledRejection", rejectionHandler);
		}
	});
});
