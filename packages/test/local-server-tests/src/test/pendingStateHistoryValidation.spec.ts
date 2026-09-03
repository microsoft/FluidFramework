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

function delayMismatchedAnchor(
	inner: IDocumentServiceFactory,
	anchorSequenceNumber: number,
	validationStarted: Deferred<void>,
	releaseValidation: Deferred<void>,
): IDocumentServiceFactory {
	const wrapService = (service: IDocumentService): IDocumentService =>
		new Proxy(service, {
			get: (target, property, receiver) => {
				if (property !== "connectToDeltaStorage") {
					return Reflect.get(target, property, receiver) as unknown;
				}
				return async (): Promise<IDocumentDeltaStorageService> => {
					const storage = await target.connectToDeltaStorage();
					return {
						fetchMessages: (...args): IStream<ISequencedDocumentMessage[]> => {
							const stream = storage.fetchMessages(...args);
							let firstRead = true;
							return {
								read: async () => {
									const result = await stream.read();
									if (!firstRead || result.done) {
										return result;
									}
									firstRead = false;
									assert.strictEqual(result.value[0]?.sequenceNumber, anchorSequenceNumber);
									validationStarted.resolve();
									await releaseValidation.promise;
									return {
										done: false,
										value: [{ ...result.value[0], clientId: "restored-history-client" }],
									};
								},
							};
						},
					};
				};
			},
		});

	return {
		createContainer: async (...args) => wrapService(await inner.createContainer(...args)),
		createDocumentService: async (...args) =>
			wrapService(await inner.createDocumentService(...args)),
	};
}

describe("Pending-state history validation", () => {
	it("returns before validation completes and closes on a delayed mismatch", async () => {
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

		const validationStarted = new Deferred<void>();
		const releaseValidation = new Deferred<void>();
		const loadP = loadExistingContainer({
			codeLoader,
			documentServiceFactory: delayMismatchedAnchor(
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
});
