/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DriverHeader, IResolvedUrl } from "@fluidframework/driver-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { InsecureUrlResolver } from "../insecureUrlResolver.js";

describe("Insecure Url Resolver Test", () => {
	const deltaStreamUrl = "https://localhost.deltaStream";
	const hostUrl = "https://localhost";
	const ordererUrl = "https://localhost.orderer";
	const storageUrl = "https://localhost.storage";
	const tenantId = "tenantId";
	const bearer = "bearer";
	const fileName = "fileName";
	let resolver: InsecureUrlResolver;
	let request: IRequest;

	beforeEach(() => {
		resolver = new InsecureUrlResolver(
			hostUrl,
			ordererUrl,
			storageUrl,
			deltaStreamUrl,
			tenantId,
			bearer,
		);
		request = resolver.createCreateNewRequest(fileName);

		// Mocking window since the resolver depends on window.location.host
		if (typeof window === "undefined" && typeof global === "object") {
			// eslint-disable-next-line @typescript-eslint/dot-notation
			global["window"] = {
				location: { host: "localhost" } as unknown as Location,
			} as unknown as Window & typeof globalThis;
		}
	});

	it("Create New Request", async () => {
		assert(
			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			!!request.headers?.[DriverHeader.createNew],
			"Request should contain create new header",
		);
		const url = `${hostUrl}?fileName=${fileName}`;
		assert.strictEqual(request.url, url, "Request url should match");
	});

	it("Resolved CreateNew Request", async () => {
		const resolvedUrl = (await resolver.resolve(request)) as IResolvedUrl;
		const documentUrl = `https://${new URL(ordererUrl).host}/${tenantId}/${fileName}`;
		assert.strictEqual(
			resolvedUrl.endpoints.ordererUrl,
			ordererUrl,
			"Orderer url should match",
		);
		assert.strictEqual(resolvedUrl.url, documentUrl, "Document url should match");
	});

	it("Test RequestUrl for a data store", async () => {
		const resolvedUrl = await resolver.resolve(request);

		const expectedResolvedUrl = `https://${new URL(ordererUrl).host}/${tenantId}/${fileName}`;
		assert.strictEqual(resolvedUrl?.url, expectedResolvedUrl, "resolved url is wrong");

		const dataStoreId = "dataStore";
		const absoluteUrl = await resolver.getAbsoluteUrl(resolvedUrl, dataStoreId);

		const expectedUrl = `${hostUrl}/${tenantId}/${fileName}/${dataStoreId}`;
		assert.strictEqual(absoluteUrl, expectedUrl, "Url should match");
	});

	it("Test RequestUrl for url with only document id", async () => {
		const testRequest: IRequest = {
			url: `https://localhost/${fileName}`,
			headers: {},
		};
		const resolvedUrl = await resolver.resolve(testRequest);

		const expectedResolvedUrl = `https://${new URL(ordererUrl).host}/${tenantId}/${fileName}`;
		assert.strictEqual(resolvedUrl?.url, expectedResolvedUrl, "resolved url is wrong");
	});

	it("Test RequestUrl for url with data store ids", async () => {
		const testRequest: IRequest = {
			url: `https://localhost/${fileName}/dataStore1/dataStore2`,
			headers: {},
		};
		const resolvedUrl = await resolver.resolve(testRequest);

		const expectedResolvedUrl = `https://${
			new URL(ordererUrl).host
		}/${tenantId}/${fileName}/dataStore1/dataStore2`;
		assert.strictEqual(resolvedUrl?.url, expectedResolvedUrl, "resolved url is wrong");

		const dataStoreId = "dataStore";
		const absoluteUrl = await resolver.getAbsoluteUrl(resolvedUrl, dataStoreId);

		const expectedResponseUrl = `${hostUrl}/${tenantId}/${fileName}/${dataStoreId}`;
		assert.strictEqual(absoluteUrl, expectedResponseUrl, "response url is wrong");
	});

	it("Test RequestUrl for url with a slash at the end", async () => {
		const testRequest: IRequest = {
			url: `https://localhost/${fileName}/`,
			headers: {},
		};
		const resolvedUrl = await resolver.resolve(testRequest);

		const expectedResolvedUrl = `https://${new URL(ordererUrl).host}/${tenantId}/${fileName}/`;
		assert.strictEqual(resolvedUrl?.url, expectedResolvedUrl, "resolved url is wrong");
	});

	it("Test RequestUrl for url with 2 slashes at the end", async () => {
		const testRequest: IRequest = {
			url: `https://localhost/${fileName}//`,
			headers: {},
		};
		const resolvedUrl = await resolver.resolve(testRequest);

		const expectedResolvedUrl = `https://${new URL(ordererUrl).host}/${tenantId}/${fileName}//`;
		assert.strictEqual(resolvedUrl?.url, expectedResolvedUrl, "resolved url is wrong");
	});

	it("Test RequestUrl for url with special characters", async () => {
		const testRequest: IRequest = {
			url: `https://localhost/${fileName}/!@$123/dataStore!@$`,
			headers: {},
		};
		const resolvedUrl = await resolver.resolve(testRequest);

		const expectedResolvedUrl = `https://${
			new URL(ordererUrl).host
		}/${tenantId}/${fileName}/!@$123/dataStore!@$`;
		assert.strictEqual(resolvedUrl?.url, expectedResolvedUrl, "resolved url is wrong");
	});
});
