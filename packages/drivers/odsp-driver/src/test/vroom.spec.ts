/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	IOdspUrlParts,
	ISocketStorageDiscovery,
	InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import { createChildLogger, MockLogger } from "@fluidframework/telemetry-utils/internal";

import type { EpochTracker } from "../epochTracker.js";
import type { IOdspResponse, TokenFetchOptionsEx } from "../odspUtils.js";
import { fetchJoinSession } from "../vroom.js";

describe("fetchJoinSession", () => {
	const urlParts: IOdspUrlParts = {
		siteUrl: "https://www.localhost.xxx",
		driveId: "driveId",
		itemId: "itemId",
	};

	const joinSessionResponse: ISocketStorageDiscovery = {
		deltaStorageUrl: "https://fake/deltaStorageUrl",
		deltaStreamSocketUrl: "https://localhost:3001/path",
		id: "id",
		tenantId: "tenantId",
		snapshotStorageUrl: "https://fake/snapshotStorageUrl",
		refreshSessionDurationSeconds: 100,
	};

	function makeFakeEpochTracker(captured: { body?: string }): EpochTracker {
		return {
			fetchAndParseAsJSON: async <T>(
				_url: string,
				fetchOptions: RequestInit,
			): Promise<IOdspResponse<T>> => {
				captured.body = fetchOptions.body as string;
				return {
					content: joinSessionResponse as unknown as T,
					headers: new Map<string, string>(),
					propsToLog: {},
					duration: 0,
				};
			},
		} as unknown as EpochTracker;
	}

	const getAuthHeader: InstrumentedStorageTokenFetcher = async () => "Bearer token";

	const tokenFetchOptions: TokenFetchOptionsEx = {
		refresh: false,
	};

	it("sets the Return-Sensitivity-Labels Prefer header on the join-session request", async () => {
		const captured: { body?: string } = {};
		const logger = createChildLogger({ logger: new MockLogger() });

		await fetchJoinSession(
			urlParts,
			"opStream/joinSession",
			"POST",
			logger,
			getAuthHeader,
			makeFakeEpochTracker(captured),
			false /* requestSocketToken */,
			tokenFetchOptions,
			undefined /* disableJoinSessionRefresh */,
			false /* isRefreshingJoinSession */,
			undefined /* displayName */,
		);

		assert.ok(captured.body !== undefined, "request body was not captured");
		assert.match(
			captured.body,
			/Prefer: Return-Sensitivity-Labels/,
			"Return-Sensitivity-Labels Prefer header was not present in the join-session request body",
		);
	});
});
