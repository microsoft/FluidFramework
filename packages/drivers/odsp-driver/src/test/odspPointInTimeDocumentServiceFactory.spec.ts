/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IResolvedUrl } from "@fluidframework/driver-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

/* eslint-disable import-x/no-internal-modules */
import type {
	BaseForSeq,
	IOdspVersionManager,
	ResolvedVersion,
} from "../odspVersionManager/index.js";
import { OdspPointInTimeDocumentServiceFactory } from "../pointInTimeDriver/odspPointInTimeDocumentServiceFactory.js";
/* eslint-enable import-x/no-internal-modules */

/**
 * A resolved URL is never dereferenced on the failure path under test (the factory throws before it
 * resolves the base version), so a bare stub suffices.
 */
const fakeResolvedUrl = {} as unknown as IResolvedUrl;

/**
 * Factory subclass that swaps in a fake version manager, so `createPointInTimeDocumentService` can be
 * driven without touching ODSP. `createVersionManager` is the only ODSP-dependent step exercised on
 * the base-selection (failure) path, and it is public specifically so callers - including this test -
 * can substitute it.
 */
class TestPointInTimeFactory extends OdspPointInTimeDocumentServiceFactory {
	public findBaseForSeqCalls: number[] = [];

	public constructor(private readonly baseResult: BaseForSeq) {
		super(
			async () => "storage-token",
			async () => "websocket-token",
		);
	}

	public override async createVersionManager(): Promise<IOdspVersionManager> {
		return {
			findBaseForSeq: async (target: number): Promise<BaseForSeq> => {
				this.findBaseForSeqCalls.push(target);
				return this.baseResult;
			},
			listVersions: async (): Promise<ResolvedVersion[]> => [],
		};
	}
}

describe("OdspPointInTimeDocumentServiceFactory", () => {
	describe("createPointInTimeDocumentService: target predates retained history", () => {
		it("rejects with a UsageError naming the target and oldest resolved version", async () => {
			const factory = new TestPointInTimeFactory({
				kind: "noBaseVersion",
				oldestResolvedSeq: 100,
			});

			await assert.rejects(
				factory.createPointInTimeDocumentService(fakeResolvedUrl, 42),
				(error: Error) => {
					assert(error instanceof UsageError, "should be a UsageError");
					assert(
						error.message.includes("42"),
						`message should name the target sequence number: ${error.message}`,
					);
					assert(
						error.message.includes("100"),
						`message should name the oldest resolved sequence number: ${error.message}`,
					);
					return true;
				},
			);
		});

		it("omits the oldest-version detail when no version was resolved", async () => {
			const factory = new TestPointInTimeFactory({ kind: "noBaseVersion" });

			await assert.rejects(
				factory.createPointInTimeDocumentService(fakeResolvedUrl, 7),
				(error: Error) => {
					assert(error instanceof UsageError, "should be a UsageError");
					assert(
						error.message.includes("7"),
						`message should name the target sequence number: ${error.message}`,
					);
					assert(
						!error.message.includes("oldest resolved"),
						`message should not mention an oldest resolved version: ${error.message}`,
					);
					return true;
				},
			);
		});

		it("forwards the requested target to the version manager", async () => {
			const factory = new TestPointInTimeFactory({ kind: "noBaseVersion" });

			await assert.rejects(factory.createPointInTimeDocumentService(fakeResolvedUrl, 12345));

			assert.deepStrictEqual(
				factory.findBaseForSeqCalls,
				[12345],
				"the requested target should be passed through to findBaseForSeq",
			);
		});
	});
});
