/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { IRequest } from "@fluidframework/core-interfaces";
import { DriverHeader } from "@fluidframework/driver-definitions";
import { InsecureTinyliciousUrlResolver } from "../insecureTinyliciousUrlResolver.js";

describe("Insecure Url Resolver Test", () => {
	const documentId = "fileName";
	const hostUrl = "http://localhost:7070";
	const tinyliciousEndpoint = "http://localhost:7070";
	let resolver: InsecureTinyliciousUrlResolver;

	beforeEach(() => {
		resolver = new InsecureTinyliciousUrlResolver();
	});

	it("Should resolve url with only document id", async () => {
		const testRequest: IRequest = {
			url: `${documentId}`,
			headers: {},
		};

		const resolvedUrl = await resolver.resolve(testRequest);

		const expectedResolvedUrl = `${hostUrl}/tinylicious/${documentId}`;
		assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
	});

	it("Should resolve url with custom domain and port", async () => {
		const customEndpoint = "http://custom-endpoint.io";
		const customFluidEndpoint = "http://custom-endpoint.io";
		const customPort = 1234;
		const customResolver = new InsecureTinyliciousUrlResolver(customPort, customEndpoint);
		const testRequest: IRequest = {
			url: `${documentId}`,
			headers: {},
		};

		const resolvedUrl = await customResolver.resolve(testRequest);

		const expectedResolvedUrl = `${customFluidEndpoint}:${customPort}/tinylicious/${documentId}`;
		assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
	});

	it("Should resolve url with data object ids", async () => {
		const path = "dataObject1/dataObject2";
		const testRequest: IRequest = {
			url: `${documentId}/${path}`,
		};

		const resolvedUrl = await resolver.resolve(testRequest);

		const expectedResolvedUrl = `${hostUrl}/tinylicious/${documentId}/${path}`;
		assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
	});

	it("Should resolve url with a slash at the end", async () => {
		const testRequest: IRequest = {
			url: `${documentId}/`,
		};

		const resolvedUrl = await resolver.resolve(testRequest);

		const expectedResolvedUrl = `${hostUrl}/tinylicious/${documentId}/`;
		assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
	});

	it("Should resolve url with 2 slashes at the end", async () => {
		const testRequest: IRequest = {
			url: `${documentId}//`,
		};

		const resolvedUrl = await resolver.resolve(testRequest);

		const expectedResolvedUrl = `${hostUrl}/tinylicious/${documentId}//`;
		assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
	});

	it("Should resolve url with special characters", async () => {
		const path = "dataObject!@$";
		const testDocumentId = "fileName!@$";
		const testRequest: IRequest = {
			url: `${testDocumentId}/${path}`,
		};

		const resolvedUrl = await resolver.resolve(testRequest);

		const expectedResolvedUrl = `${hostUrl}/tinylicious/${encodeURIComponent(
			testDocumentId,
		)}/${path}`;
		assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
	});

	it("Should correctly resolve url for a create-new request with a non-empty URL", async () => {
		const testDocumentId = "fileName!@$";
		const testRequest: IRequest = {
			url: `${testDocumentId}`,
			headers: {
				[DriverHeader.createNew]: true,
			},
		};

		const resolvedUrl = await resolver.resolve(testRequest);

		const expectedResolvedUrl = {
			endpoints: {
				deltaStorageUrl: `${tinyliciousEndpoint}/deltas/tinylicious/${testDocumentId}`,
				ordererUrl: tinyliciousEndpoint,
				storageUrl: `${tinyliciousEndpoint}/repos/tinylicious`,
			},
			id: testDocumentId,
			tokens: {},
			type: "fluid",
			url: `${hostUrl}/tinylicious/${testDocumentId}`,
		};
		assert.deepStrictEqual(resolvedUrl, expectedResolvedUrl);
	});

	it("Should correctly resolve url for a create-new request with an empty URL", async () => {
		const testRequest: IRequest = {
			url: "",
			headers: {
				[DriverHeader.createNew]: true,
			},
		};

		const resolvedUrl = await resolver.resolve(testRequest);

		const expectedResolvedUrl = {
			endpoints: {
				deltaStorageUrl: `${tinyliciousEndpoint}/deltas/tinylicious/new`,
				ordererUrl: tinyliciousEndpoint,
				storageUrl: `${tinyliciousEndpoint}/repos/tinylicious`,
			},
			id: "new",
			tokens: {},
			type: "fluid",
			url: `${hostUrl}/tinylicious/new`,
		};
		assert.deepStrictEqual(resolvedUrl, expectedResolvedUrl);
	});
});
