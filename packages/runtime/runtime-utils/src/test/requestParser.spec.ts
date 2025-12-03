/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { RequestParser } from "../requestParser.js";

describe("RequestParser", () => {
	describe(".getPathParts", () => {
		it("Parse Data Store Id", () => {
			const url = "dataStoreId";
			const pathParts = RequestParser.getPathParts(url);
			assert.strictEqual(pathParts.length, 1);
			assert.strictEqual(pathParts[0], "dataStoreId");
		});
		it("Parse Data Store Id with /", () => {
			const url = "/dataStoreId/";
			const pathParts = RequestParser.getPathParts(url);
			assert.strictEqual(pathParts.length, 1);
			assert.strictEqual(pathParts[0], "dataStoreId");
		});
		it("Parse Data Store Id with query", () => {
			const url = "/dataStoreId/?foo=bar";
			const pathParts = RequestParser.getPathParts(url);
			assert.strictEqual(pathParts.length, 1);
			assert.strictEqual(pathParts[0], "dataStoreId");
		});
		it("Parse Data Store Id with sub route with query", () => {
			const url = "/dataStoreId//some/route?foo=bar";
			const pathParts = RequestParser.getPathParts(url);
			assert.strictEqual(pathParts.length, 3);
			assert.strictEqual(pathParts[0], "dataStoreId");
			assert.strictEqual(pathParts[1], "some");
			assert.strictEqual(pathParts[2], "route");
		});
		it("Parse encoded Data Store Id", () => {
			const url = "data%20store%20Id";
			const pathParts = RequestParser.getPathParts(url);
			assert.strictEqual(pathParts.length, 1);
			assert.strictEqual(pathParts[0], "data store Id");
		});
	});
	describe(".createSubRequest with special characters", () => {
		let requestParser: RequestParser;
		beforeEach(() => {
			requestParser = RequestParser.create({ url: "//dataStoreId!@//some!@//route!@//" });
		});
		it("Create request from part 0", () => {
			assert.strictEqual(
				requestParser.createSubRequest(0).url,
				"/dataStoreId!@/some!@/route!@",
			);
		});
		it("Create request from part 1", () => {
			assert.strictEqual(requestParser.createSubRequest(1).url, "/some!@/route!@");
		});
		it("Create request from part 2", () => {
			assert.strictEqual(requestParser.createSubRequest(2).url, "/route!@");
		});
		it("Create request from parts length ", () => {
			assert.strictEqual(requestParser.createSubRequest(3).url, "/");
		});
		it("Create request from invalid part ", () => {
			assert.throws(() => requestParser.createSubRequest(4));
			assert.throws(() => requestParser.createSubRequest(-1));
		});
	});

	describe(".createSubRequest with special urls", () => {
		it("Create request for `/`", () => {
			const testRequestParser = RequestParser.create({ url: "/" });
			assert.strictEqual(testRequestParser.createSubRequest(0).url, "/");
			assert.throws(() => testRequestParser.createSubRequest(1));
			assert.throws(() => testRequestParser.createSubRequest(-1));
		});
		it("Create request from empty string", () => {
			const testRequestParser = RequestParser.create({ url: "" });
			assert.strictEqual(testRequestParser.createSubRequest(0).url, "/");
			assert.throws(() => testRequestParser.createSubRequest(1));
			assert.throws(() => testRequestParser.createSubRequest(-1));
		});
		it("Create request for just query params", () => {
			const testRequestParser = RequestParser.create({ url: "/?query" });
			assert.strictEqual(testRequestParser.createSubRequest(0).url, "/?query");
			assert.throws(() => testRequestParser.createSubRequest(1));
			assert.throws(() => testRequestParser.createSubRequest(-1));
		});
	});

	const testSubRequest = function (uri: string): void {
		describe(".createSubRequest with query params", () => {
			let requestParser2: RequestParser;
			beforeEach(() => {
				requestParser2 = RequestParser.create({ url: uri });
			});
			it("Create request from part 0", () => {
				assert.strictEqual(
					requestParser2.createSubRequest(0).url,
					"/dataStoreId/some/route/?query1=1&query2=2",
				);
			});
			it("Create request from part 1", () => {
				assert.strictEqual(
					requestParser2.createSubRequest(1).url,
					"/some/route/?query1=1&query2=2",
				);
			});
			it("Create request from part 2", () => {
				assert.strictEqual(
					requestParser2.createSubRequest(2).url,
					"/route/?query1=1&query2=2",
				);
			});
			it("Create request from parts length", () => {
				assert.strictEqual(requestParser2.createSubRequest(3).url, "/?query1=1&query2=2");
			});
			it("Create request from invalid part ", () => {
				assert.throws(() => requestParser2.createSubRequest(4));
				assert.throws(() => requestParser2.createSubRequest(-1));
			});
		});
	};
	testSubRequest("/dataStoreId/some/route/?query1=1&query2=2");
	testSubRequest("dataStoreId/some/route/?query1=1&query2=2");
});
