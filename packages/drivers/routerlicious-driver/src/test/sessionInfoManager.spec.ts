/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { IResolvedUrl } from "@fluidframework/driver-definitions/internal";
import { ISession } from "@fluidframework/server-services-client";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import { SinonFakeTimers, useFakeTimers } from "sinon";

import { RouterliciousOrdererRestWrapper } from "../restWrapper.js";
import {
	RediscoverAfterTimeSinceDiscoveryMs,
	SessionInfoManager,
} from "../sessionInfoManager.js";

describe("SessionInfoManager", () => {
	let clock: SinonFakeTimers;
	let ordererRestWrapper: RouterliciousOrdererRestWrapper;
	let mockOrdererCalls = 0;

	const documentIdA = "documentA";
	const documentIdB = "documentB";

	before(() => {
		clock = useFakeTimers();
	});

	beforeEach(() => {
		clock.tick(1000000); // ! Need to set to large number to trigger initializeSessionInfo calls correctly (Date.now() is 0 by default)
		mockOrdererCalls = 0;
		ordererRestWrapper =
			new MockOrdererRestWrapper() as unknown as RouterliciousOrdererRestWrapper;
	});

	afterEach(() => {
		clock.reset();
	});

	class MockOrdererRestWrapper {
		get() {
			mockOrdererCalls++;
			return {
				content: createSession(numberToFakeUrl(mockOrdererCalls)),
			};
		}
	}

	const exampleHostUrl = "https://examplehost.com";
	function createSession(url: string): ISession {
		return {
			deltaStreamUrl: url, // ! This endpoint will be hijacked to detect a change in the session
			ordererUrl: exampleHostUrl,
			historianUrl: exampleHostUrl,
			isSessionAlive: true,
			isSessionActive: true,
		};
	}

	function createGetSessionInfoParams(documentId: string, session?: ISession) {
		return {
			resolvedUrl: {
				type: "fluid",
				id: "id",
				url: exampleHostUrl,
				tokens: {},
				endpoints: {
					deltaStreamUrl: exampleHostUrl, // ! This endpoint will be hijacked to detect changes
					ordererUrl: exampleHostUrl,
					storageUrl: exampleHostUrl,
					deltaStorageUrl: exampleHostUrl,
				},
			} satisfies IResolvedUrl,
			documentId,
			tenantId: "fakeTenant",
			ordererRestWrapper,
			logger: new MockLogger().toTelemetryLogger(),
			session,
		};
	}

	function numberToFakeUrl(num: number): string {
		return `https://${num}.com`;
	}

	function assertResolvedUrlMatch(
		resolvedUrl: IResolvedUrl,
		expectedUrl: string,
		errorMessage?: string,
	) {
		// ! The deltaStreamUrl endpoint is hijacked by these tests to detect session info changes
		assert.strictEqual(resolvedUrl.endpoints.deltaStreamUrl, expectedUrl, errorMessage);
	}

	describe("initializeSessionInfo", () => {
		describe("session provided", () => {
			[true, false].forEach((enableDiscovery) => {
				describe(`discovery ${enableDiscovery ? "enabled" : "disabled"}`, () => {
					it("uses provided session", async () => {
						const manager = new SessionInfoManager(enableDiscovery);

						const url = "https://providedSession.com";

						const resolvedUrl = await manager.initializeSessionInfo(
							createGetSessionInfoParams(documentIdA, createSession(url)),
						);

						assert.strictEqual(mockOrdererCalls, 0);
						assertResolvedUrlMatch(resolvedUrl, url);
					});

					it("URL already exists", async () => {
						const manager = new SessionInfoManager(enableDiscovery);

						const originalUrl = "https://original.com";
						const newUrl = "https://new.com";

						let resolvedUrl = await manager.initializeSessionInfo(
							createGetSessionInfoParams(documentIdA, createSession(originalUrl)),
						);

						const getParams = createGetSessionInfoParams(documentIdA);

						assert.strictEqual(mockOrdererCalls, 0);
						assertResolvedUrlMatch(resolvedUrl, originalUrl);
						assertResolvedUrlMatch(
							(await manager.getSessionInfo(getParams)).resolvedUrl,
							originalUrl,
						);

						resolvedUrl = await manager.initializeSessionInfo(
							createGetSessionInfoParams(documentIdA, createSession(newUrl)),
						);

						assert.strictEqual(mockOrdererCalls, 0);
						assertResolvedUrlMatch(resolvedUrl, newUrl);
						assertResolvedUrlMatch(
							(await manager.getSessionInfo(getParams)).resolvedUrl,
							newUrl,
							"expected session info to be overwritten",
						);
					});
				});
			});
		});

		it("discovery enabled", async () => {
			const manager = new SessionInfoManager(true);

			const resolvedUrl = await manager.initializeSessionInfo(
				createGetSessionInfoParams(documentIdA),
			);

			assert.strictEqual(mockOrdererCalls, 1);
			assertResolvedUrlMatch(resolvedUrl, numberToFakeUrl(mockOrdererCalls));
		});

		it("discovery enabled, URL already exists", async () => {
			const manager = new SessionInfoManager(true);

			let resolvedUrl = await manager.initializeSessionInfo(
				createGetSessionInfoParams(documentIdA),
			);

			assert.strictEqual(mockOrdererCalls, 1);
			assertResolvedUrlMatch(resolvedUrl, numberToFakeUrl(mockOrdererCalls));

			resolvedUrl = await manager.initializeSessionInfo(
				createGetSessionInfoParams(documentIdA),
			);

			// Value should remain unchanged
			assert.strictEqual(
				mockOrdererCalls,
				1,
				"number of update calls should remain unchanged",
			);
			assertResolvedUrlMatch(resolvedUrl, numberToFakeUrl(mockOrdererCalls));
		});

		it("discovery disabled", async () => {
			const manager = new SessionInfoManager(false);

			const resolvedUrl = await manager.initializeSessionInfo(
				createGetSessionInfoParams(documentIdA),
			);

			assert.strictEqual(mockOrdererCalls, 0);
			assertResolvedUrlMatch(resolvedUrl, exampleHostUrl);
		});
	});

	describe("getSessionInfo", () => {
		const initialUrl = "https://initial.com";
		async function createSessionInfoManager(
			enableDiscovery: boolean,
		): Promise<SessionInfoManager> {
			const manager = new SessionInfoManager(enableDiscovery);

			const resolvedUrl = await manager.initializeSessionInfo(
				createGetSessionInfoParams(documentIdA, createSession(initialUrl)),
			);

			assert.strictEqual(mockOrdererCalls, 0);
			assertResolvedUrlMatch(resolvedUrl, initialUrl);

			return manager;
		}

		it("no rediscovery needed", async () => {
			const manager = await createSessionInfoManager(true);

			clock.tick(1000);

			const response = await manager.getSessionInfo(createGetSessionInfoParams(documentIdA));
			assert.strictEqual(mockOrdererCalls, 0);
			assert.strictEqual(response.refreshed, false);
			assertResolvedUrlMatch(response.resolvedUrl, initialUrl);
		});

		it("rediscovery needed", async () => {
			const manager = await createSessionInfoManager(true);

			clock.tick(RediscoverAfterTimeSinceDiscoveryMs);

			let response = await manager.getSessionInfo(createGetSessionInfoParams(documentIdA));
			assert.strictEqual(mockOrdererCalls, 0);
			assert.strictEqual(response.refreshed, false);
			assertResolvedUrlMatch(response.resolvedUrl, initialUrl);

			clock.tick(1);

			response = await manager.getSessionInfo(createGetSessionInfoParams(documentIdA));
			assert.strictEqual(mockOrdererCalls, 1);
			assert.strictEqual(response.refreshed, true);
			assertResolvedUrlMatch(response.resolvedUrl, numberToFakeUrl(mockOrdererCalls));
		});

		it("rediscovery needed, but discovery is disabled", async () => {
			const manager = await createSessionInfoManager(false);

			clock.tick(RediscoverAfterTimeSinceDiscoveryMs + 1);

			const response = await manager.getSessionInfo(createGetSessionInfoParams(documentIdA));
			assert.strictEqual(mockOrdererCalls, 0);
			assert.strictEqual(response.refreshed, false);
			assertResolvedUrlMatch(response.resolvedUrl, initialUrl);
		});

		it("multiple documents active scenario", async () => {
			const manager = await createSessionInfoManager(true);

			// Offset document refresh timers by 1 tick
			clock.tick(1);

			// Start tracking a second document's session
			const resolvedUrl = await manager.initializeSessionInfo(
				createGetSessionInfoParams(documentIdB, createSession(initialUrl)),
			);
			assert.strictEqual(mockOrdererCalls, 0);
			assertResolvedUrlMatch(resolvedUrl, initialUrl);

			// 1 off threshold for document A
			clock.tick(RediscoverAfterTimeSinceDiscoveryMs - 1);

			const getSessionParamsA = createGetSessionInfoParams(documentIdA);
			const getSessionParamsB = createGetSessionInfoParams(documentIdB);

			{
				const responseA = await manager.getSessionInfo(getSessionParamsA);
				const responseB = await manager.getSessionInfo(getSessionParamsB);

				assert.strictEqual(mockOrdererCalls, 0);
				assert.strictEqual(responseA.refreshed, false);
				assert.strictEqual(responseB.refreshed, false);

				assertResolvedUrlMatch(responseA.resolvedUrl, initialUrl);
				assertResolvedUrlMatch(responseB.resolvedUrl, initialUrl);
			}

			clock.tick(1);

			{
				const responseA = await manager.getSessionInfo(getSessionParamsA);
				const responseB = await manager.getSessionInfo(getSessionParamsB);

				assert.strictEqual(mockOrdererCalls, 1);
				assert.strictEqual(responseA.refreshed, true);
				assert.strictEqual(responseB.refreshed, false);

				assertResolvedUrlMatch(responseA.resolvedUrl, numberToFakeUrl(1));
				assertResolvedUrlMatch(responseB.resolvedUrl, initialUrl);
			}

			clock.tick(1);

			{
				const responseA = await manager.getSessionInfo(getSessionParamsA);
				const responseB = await manager.getSessionInfo(getSessionParamsB);

				assert.strictEqual(mockOrdererCalls, 2);
				assert.strictEqual(responseA.refreshed, false);
				assert.strictEqual(responseB.refreshed, true);

				assertResolvedUrlMatch(responseA.resolvedUrl, numberToFakeUrl(1));
				assertResolvedUrlMatch(responseB.resolvedUrl, numberToFakeUrl(2));
			}

			// 1 off threshold for document A
			clock.tick(RediscoverAfterTimeSinceDiscoveryMs - 1);

			{
				const responseA = await manager.getSessionInfo(getSessionParamsA);
				const responseB = await manager.getSessionInfo(getSessionParamsB);

				assert.strictEqual(mockOrdererCalls, 2);
				assert.strictEqual(responseA.refreshed, false);
				assert.strictEqual(responseB.refreshed, false);

				assertResolvedUrlMatch(responseA.resolvedUrl, numberToFakeUrl(1));
				assertResolvedUrlMatch(responseB.resolvedUrl, numberToFakeUrl(2));
			}

			clock.tick(1);

			{
				const responseA = await manager.getSessionInfo(getSessionParamsA);
				const responseB = await manager.getSessionInfo(getSessionParamsB);

				assert.strictEqual(mockOrdererCalls, 3);
				assert.strictEqual(responseA.refreshed, true);
				assert.strictEqual(responseB.refreshed, false);

				assertResolvedUrlMatch(responseA.resolvedUrl, numberToFakeUrl(3));
				assertResolvedUrlMatch(responseB.resolvedUrl, numberToFakeUrl(2));
			}
		});
	});
});
