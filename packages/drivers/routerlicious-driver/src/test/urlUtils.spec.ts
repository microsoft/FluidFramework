/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { ISession } from "@fluidframework/server-services-client";
import { getDiscoveredFluidResolvedUrl, replaceDocumentIdInPath } from "../urlUtils";

describe("UrlUtils", () => {
	const exampleFluidUrl1 =
		"https://orderer.examplehost.com/example-tenant/some-document?param1=value1";
	const exampleFluidUrl2 = "https://examplehost.com/other-tenant/";

	describe("replaceDocumentIdInPath()", () => {
		it("returns pathname with replacement", () => {
			const parsedUrl = new URL(exampleFluidUrl1);
			assert.strictEqual(
				replaceDocumentIdInPath(parsedUrl.pathname, "otherdoc"),
				"/example-tenant/otherdoc",
			);
		});
		it("returns pathname with replacement of blank documentId", () => {
			const parsedUrl = new URL(exampleFluidUrl2);
			assert.strictEqual(
				replaceDocumentIdInPath(parsedUrl.pathname, "otherdoc"),
				"/other-tenant/otherdoc",
			);
		});
		it("replaced pathname is altered in full URL", () => {
			const parsedUrl = new URL(exampleFluidUrl1);
			parsedUrl.pathname = replaceDocumentIdInPath(parsedUrl.pathname, "otherdoc");
			assert.strictEqual(
				parsedUrl.toString(),
				exampleFluidUrl1.replace("some-document", "otherdoc"),
			);
		});
	});

	describe("getDiscoveredFluidResolvedUrl()", () => {
		let testResolvedURL: IResolvedUrl;
		let testSession: ISession;

		before(() => {
			testResolvedURL = {
				type: "fluid",
				id: "id",
				// Routerlicious resolved urls are expected to always have a valid URL.
				url: "https://examplehost.com",
				tokens: {
					testKey: "testValue",
				},
				endpoints: {
					// Routerlicious resolved urls are expected to always have these three endpoints with valid URLs,
					// though their exact values are not important for this test.
					storageUrl: "https://examplehost.com",
					deltaStorageUrl: "https://examplehost.com",
					ordererUrl: "https://examplehost.com",
				},
			};

			testSession = {
				ordererUrl: "http://ordererUrl.test",
				deltaStreamUrl: "http://deltaStreamUrl.test",
				historianUrl: "http://historianUrl.test",
				isSessionActive: false,
				isSessionAlive: false,
			};
		});

		it("overrides resolvedURL endpoints with session endpoints", () => {
			const result = getDiscoveredFluidResolvedUrl(testResolvedURL, testSession);

			assert.strictEqual("https://ordererurl.test/", result.endpoints.deltaStorageUrl);
			assert.strictEqual("https://historianurl.test/", result.endpoints.storageUrl);
			assert.strictEqual(testSession.ordererUrl, result.endpoints.ordererUrl);
			assert.strictEqual(testSession.deltaStreamUrl, result.endpoints.deltaStreamUrl);
		});
	});
});
