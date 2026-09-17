/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	IDocumentServiceFactory,
	IResolvedUrl,
	IUrlResolver,
	SequenceNumberAvailability,
} from "@fluidframework/driver-definitions/internal";

import { checkSequenceNumberAvailability } from "../checkSequenceNumberAvailability.js";

const resolvedUrl: IResolvedUrl = {
	type: "fluid",
	id: "test",
	url: "fluid://test",
	tokens: {},
	endpoints: {},
};

const unsupportedDocumentServiceFactory: IDocumentServiceFactory = {
	createDocumentService: async () => assert.fail("must not create a document service"),
	createContainer: async () => assert.fail("must not create a container"),
};

describe("checkSequenceNumberAvailability", () => {
	it("validates all targets before resolving the request", async () => {
		const urlResolver: IUrlResolver = {
			resolve: async () => assert.fail("must not resolve malformed input"),
			getAbsoluteUrl: async () => assert.fail("must not resolve malformed input"),
		};
		await assert.rejects(
			checkSequenceNumberAvailability({
				request: { url: resolvedUrl.url },
				sequenceNumbers: [1, Number.MAX_SAFE_INTEGER + 1],
				urlResolver,
				documentServiceFactory: unsupportedDocumentServiceFactory,
			}),
			/non-negative safe integers/i,
		);
	});

	it("preserves batching and forwards cancellation", async () => {
		const controller = new AbortController();
		let seenSequenceNumbers: readonly number[] | undefined;
		let seenSignal: AbortSignal | undefined;
		const documentServiceFactory: IDocumentServiceFactory & {
			checkSequenceNumberAvailability(options: {
				readonly sequenceNumbers: readonly number[];
				readonly signal?: AbortSignal;
			}): Promise<readonly SequenceNumberAvailability[]>;
		} = {
			createDocumentService: async () => assert.fail("must not create a document service"),
			createContainer: async () => assert.fail("must not create a container"),
			checkSequenceNumberAvailability: async ({
				sequenceNumbers,
				signal,
			}): Promise<readonly SequenceNumberAvailability[]> => {
				seenSequenceNumbers = sequenceNumbers;
				seenSignal = signal;
				return sequenceNumbers.map((sequenceNumber) => ({
					sequenceNumber,
					status: "available" as const,
				}));
			},
		};

		const results = await checkSequenceNumberAvailability({
			request: { url: resolvedUrl.url },
			sequenceNumbers: [9, 4, 9],
			signal: controller.signal,
			urlResolver: {
				resolve: async () => resolvedUrl,
				getAbsoluteUrl: async () => resolvedUrl.url,
			},
			documentServiceFactory,
		});

		assert.deepEqual(seenSequenceNumbers, [9, 4, 9]);
		assert.equal(seenSignal, controller.signal);
		assert.deepEqual(results, [
			{ sequenceNumber: 9, status: "available" },
			{ sequenceNumber: 4, status: "available" },
			{ sequenceNumber: 9, status: "available" },
		]);
	});
});
