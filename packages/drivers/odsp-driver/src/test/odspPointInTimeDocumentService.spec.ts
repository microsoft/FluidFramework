/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	IDocumentDeltaStorageService,
	IDocumentService,
	IResolvedUrl,
	IStream,
	IStreamResult,
} from "@fluidframework/driver-definitions/internal";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";

// eslint-disable-next-line import-x/no-internal-modules
import { OdspPointInTimeDocumentService } from "../pointInTimeDriver/odspPointInTimeDocumentService.js";

/**
 * Behavioral tests for {@link OdspPointInTimeDocumentService.connectToDeltaStorage}, whose wrapper
 * validates op availability by observing the ops the loader actually reads: the bridge from the base
 * snapshot to the target is intact only if the lowest needed op (`from`) is still served and the
 * stream reaches the target (`bounded - 1`).
 */

/** Turn an array of "pages" (each a list of sequence numbers) into a fake delta-storage stream. */
function makeStream(pages: number[][]): IStream<ISequencedDocumentMessage[]> {
	let index = 0;
	return {
		read: async (): Promise<IStreamResult<ISequencedDocumentMessage[]>> => {
			if (index < pages.length) {
				const page = pages[index++];
				return {
					done: false,
					value: page.map(
						(sequenceNumber) => ({ sequenceNumber }) as ISequencedDocumentMessage,
					),
				};
			}
			return { done: true };
		},
	};
}

/**
 * Build a service whose live document service returns a delta storage that replays `pages`. The
 * recoverable service is never exercised by these tests, so it is a bare stub.
 */
function makeService(
	targetSequenceNumber: number,
	pages: number[][],
): OdspPointInTimeDocumentService {
	const liveDeltaStorage: IDocumentDeltaStorageService = {
		fetchMessages: () => makeStream(pages),
	};
	const liveDocumentService = {
		on: () => {},
		off: () => {},
		dispose: () => {},
		connectToDeltaStorage: async () => liveDeltaStorage,
	} as unknown as IDocumentService;
	const recoverableDocumentService = {
		dispose: () => {},
	} as unknown as IDocumentService;
	return new OdspPointInTimeDocumentService(
		{} as unknown as IResolvedUrl,
		recoverableDocumentService,
		liveDocumentService,
		targetSequenceNumber,
	);
}

/** Drive the wrapped stream to completion, surfacing any validation error it throws. */
async function drain(
	service: OdspPointInTimeDocumentService,
	from: number,
	options: { cachedOnly?: boolean; abortSignal?: AbortSignal } = {},
): Promise<void> {
	const deltaStorage = await service.connectToDeltaStorage();
	const stream = deltaStorage.fetchMessages(
		from,
		undefined,
		options.abortSignal,
		options.cachedOnly,
	);
	let result = await stream.read();
	while (!result.done) {
		result = await stream.read();
	}
}

describe("OdspPointInTimeDocumentService.connectToDeltaStorage", () => {
	it("passes when the served ops span [from, target]", async () => {
		// base seq 5, target 8 -> needs [6, 8]; the stream serves exactly that.
		const service = makeService(8, [[6, 7, 8]]);
		await drain(service, 6);
	});

	it("throws (cannotCatchUp) when the low boundary op was trimmed", async () => {
		// base seq 5, target 12 -> needs [6, 12]; retention trimmed the prefix, so the stream starts
		// at 9 instead of 6.
		const service = makeService(12, [[9, 10, 11, 12]]);
		await assert.rejects(
			async () => drain(service, 6),
			(error: Error) => {
				assert.match(error.message, /Required ops \[6, 12\] but delta storage served \[9, /);
				assert.equal(
					(error as Partial<{ errorType: string }>).errorType,
					OdspErrorTypes.cannotCatchUp,
				);
				return true;
			},
		);
	});

	it("throws (cannotCatchUp) when the stream ends short of the target (beyond tip)", async () => {
		// base seq 5, target 12 -> needs [6, 12]; the live document only has ops through 8.
		const service = makeService(12, [[6, 7, 8]]);
		await assert.rejects(
			async () => drain(service, 6),
			(error: Error) => {
				assert.match(
					error.message,
					/Required ops \[6, 12\] but delta storage served \[6, 8\]/,
				);
				assert.equal(
					(error as Partial<{ errorType: string }>).errorType,
					OdspErrorTypes.cannotCatchUp,
				);
				return true;
			},
		);
	});

	it("does not throw on a cachedOnly pass that legitimately ends short", async () => {
		// A cachedOnly pass only drains local cache and is expected to fall short; it must not fail.
		const service = makeService(12, [[6, 7, 8]]);
		await drain(service, 6, { cachedOnly: true });
	});

	it("does not throw when an aborted pass ends short", async () => {
		const controller = new AbortController();
		controller.abort();
		const service = makeService(12, [[6, 7, 8]]);
		await drain(service, 6, { abortSignal: controller.signal });
	});

	it("does not throw when no ops are needed (target at the base)", async () => {
		// from (6) is already past the bounded upper end (target 5 -> bounded 6), so nothing to verify.
		const service = makeService(5, []);
		await drain(service, 6);
	});
});
