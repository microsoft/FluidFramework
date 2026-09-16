/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Input validation for the point-in-time load entry point.
 *
 * `loadContainerToSequenceNumber` rejects a malformed target up front - before it inspects the
 * document service factory or does any network work - so this coverage needs no driver, no
 * credentials, and no service. It deliberately lives here rather than in the ODSP real-service
 * point-in-time e2e suites, whose `before` hook skips every non-odsp driver: that would leave this
 * public-contract guard running only on credentialed ODSP legs. The stubs below are tripwires - any
 * use of them fails the test, proving validation happens first.
 */

import { strict as assert } from "node:assert";

import type { ICodeDetailsLoader } from "@fluidframework/container-definitions/internal";
import { FluidErrorTypes, type IErrorBase } from "@fluidframework/core-interfaces/internal";
import type {
	IDocumentServiceFactory,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";

import { loadContainerToSequenceNumber } from "../loadContainerToSequenceNumber.js";

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
		const loadTo = async (loadToSequenceNumber: number): Promise<unknown> =>
			loadContainerToSequenceNumber({
				codeLoader: tripwireCodeLoader,
				urlResolver: tripwireUrlResolver,
				documentServiceFactory: tripwireDocumentServiceFactory,
				request: { url: "https://example.com/point-in-time-validation" },
				loadToSequenceNumber,
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
			// 0 is the boundary value: valid, so validation must fall through to the point-in-time
			// capability check. This pins the boundary and proves the guard rejects only malformed
			// targets rather than everything.
			await assert.rejects(
				loadTo(0),
				(error: IErrorBase) =>
					error.errorType === FluidErrorTypes.usageError &&
					/does not support point-in-time loading/i.test(error.message),
				"a valid target should pass validation and reach the capability check",
			);
		});
	});
});
