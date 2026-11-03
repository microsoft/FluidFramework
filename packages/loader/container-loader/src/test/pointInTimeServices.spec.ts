/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type {
	IDocumentService,
	IDocumentServiceFactory,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import { UsageError } from "@fluidframework/driver-utils/internal";

import {
	asPointInTimeCapableFactory,
	PointInTimeDocumentServiceFactory,
} from "../pointInTimeServices.js";

const fakeUrl = {
	url: "fluid://test",
	tokens: {},
	type: "fluid",
} as unknown as IResolvedUrl;

const fakeService = { dispose: () => {} } as unknown as IDocumentService;

function makePlainFactory(): IDocumentServiceFactory {
	return {
		createDocumentService: async () => fakeService,
		createContainer: async () => fakeService,
	} as unknown as IDocumentServiceFactory;
}

interface RecordedCall {
	resolvedUrl: IResolvedUrl;
	targetSequenceNumber: number;
	logger: ITelemetryBaseLogger | undefined;
	clientIsSummarizer: boolean | undefined;
}

type CapableFactory = IDocumentServiceFactory & {
	createPointInTimeDocumentService(
		resolvedUrl: IResolvedUrl,
		targetSequenceNumber: number,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService>;
	calls: RecordedCall[];
};

function makeCapableFactory(): CapableFactory {
	const calls: RecordedCall[] = [];
	return {
		calls,
		createDocumentService: async () => fakeService,
		createContainer: async () => fakeService,
		createPointInTimeDocumentService: async (
			resolvedUrl: IResolvedUrl,
			targetSequenceNumber: number,
			logger?: ITelemetryBaseLogger,
			clientIsSummarizer?: boolean,
		): Promise<IDocumentService> => {
			calls.push({ resolvedUrl, targetSequenceNumber, logger, clientIsSummarizer });
			return fakeService;
		},
	} as unknown as CapableFactory;
}

describe("asPointInTimeCapableFactory", () => {
	it("returns undefined for a factory without the point-in-time capability", () => {
		assert.equal(asPointInTimeCapableFactory(makePlainFactory()), undefined);
	});

	it("returns the factory when it implements createPointInTimeDocumentService", () => {
		const capable = makeCapableFactory();
		assert.equal(asPointInTimeCapableFactory(capable), capable);
	});

	it("returns undefined when createPointInTimeDocumentService is present but not a function", () => {
		const notAFunction = {
			createDocumentService: async () => fakeService,
			createContainer: async () => fakeService,
			createPointInTimeDocumentService: "nope",
		} as unknown as IDocumentServiceFactory;
		assert.equal(asPointInTimeCapableFactory(notAFunction), undefined);
	});
});

describe("PointInTimeDocumentServiceFactory", () => {
	it("routes createDocumentService to createPointInTimeDocumentService with the configured target", async () => {
		const capable = makeCapableFactory();
		const logger = {} as unknown as ITelemetryBaseLogger;
		const factory = new PointInTimeDocumentServiceFactory(capable, 42);

		const service = await factory.createDocumentService(fakeUrl, logger, true);

		assert.equal(service, fakeService);
		assert.equal(capable.calls.length, 1);
		assert.deepEqual(capable.calls[0], {
			resolvedUrl: fakeUrl,
			targetSequenceNumber: 42,
			logger,
			clientIsSummarizer: true,
		});
	});

	it("forwards the target unchanged even when it is 0", async () => {
		const capable = makeCapableFactory();
		const factory = new PointInTimeDocumentServiceFactory(capable, 0);

		await factory.createDocumentService(fakeUrl);

		assert.equal(capable.calls[0]?.targetSequenceNumber, 0);
	});

	it("throws a UsageError from createContainer", async () => {
		const capable = makeCapableFactory();
		const factory = new PointInTimeDocumentServiceFactory(capable, 7);

		await assert.rejects(
			async () => factory.createContainer(),
			(error: Error) => {
				assert.ok(error instanceof UsageError);
				assert.match(error.message, /cannot be used to create containers/);
				return true;
			},
		);
	});
});
