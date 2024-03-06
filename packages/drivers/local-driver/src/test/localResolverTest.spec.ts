/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DriverHeader } from "@fluidframework/driver-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { LocalResolver } from "../localResolver.js";

describe("Local Driver Resolver", () => {
	const documentId = "localResolverTest";
	let resolver: LocalResolver;

	describe("CreateNew Flow", () => {
		let request: IRequest;

		beforeEach(() => {
			resolver = new LocalResolver();
			request = resolver.createCreateNewRequest(documentId);
		});

		it("should successfully create a creatNewRequest", async () => {
			assert(
				!!request.headers?.[DriverHeader.createNew],
				"Request should contain create new header",
			);
			const expectedUrl = `http://localhost:3000/${documentId}`;
			assert.equal(request.url, expectedUrl, "The url in createNewRequest should match");
		});

		it("should successfully resolve a createNewRequest", async () => {
			const resolvedUrl = await resolver.resolve(request);
			const expectedUrl = `https://localhost:3000/tenantId/${documentId}`;
			assert.equal(resolvedUrl.url, expectedUrl, "The resolved url should match");
		});

		it("should successfully create requestUrl for a data store from resolvedUrl", async () => {
			const resolvedUrl = await resolver.resolve(request);
			const dataStoreId = "datastore";
			const response = await resolver.getAbsoluteUrl(resolvedUrl, dataStoreId);
			const expectedUrl = `http://localhost:3000/${documentId}/${dataStoreId}`;
			assert.equal(response, expectedUrl, "The requestUrl should match");
		});
	});

	describe("Container Request Resolution", () => {
		beforeEach(() => {
			resolver = new LocalResolver();
		});

		it("should successfully resolve request for a container url", async () => {
			const url = `http://localhost/${documentId}`;
			const resolvedUrl = await resolver.resolve({ url });
			const expectedUrl = `https://localhost:3000/tenantId/${documentId}`;
			assert.equal(resolvedUrl.url, expectedUrl, "The resolved container url should match");
		});
	});
});
