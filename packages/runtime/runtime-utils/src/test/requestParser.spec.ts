/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { RequestParser } from "../requestParser";

describe("RequestParser", () => {
    describe(".getPathParts", () => {
        it("Parse Data Store Id", () => {
            const url = "dataStoreId";
            const pathParts = RequestParser.getPathParts(url);
            assert.equal(pathParts.length, 1);
            assert.equal(pathParts[0], "dataStoreId");
        });
        it("Parse Data Store Id with /", () => {
            const url = "/dataStoreId/";
            const pathParts = RequestParser.getPathParts(url);
            assert.equal(pathParts.length, 1);
            assert.equal(pathParts[0], "dataStoreId");
        });
        it("Parse Data Store Id with query", () => {
            const url = "/dataStoreId/?foo=bar";
            const pathParts = RequestParser.getPathParts(url);
            assert.equal(pathParts.length, 1);
            assert.equal(pathParts[0], "dataStoreId");
        });
        it("Parse Data Store Id with sub route with query", () => {
            const url = "/dataStoreId//some/route?foo=bar";
            const pathParts = RequestParser.getPathParts(url);
            assert.equal(pathParts.length, 3);
            assert.equal(pathParts[0], "dataStoreId");
            assert.equal(pathParts[1], "some");
            assert.equal(pathParts[2], "route");
        });
        it("Parse encoded Data Store Id", () => {
            const url = "data%20store%20Id";
            const pathParts = RequestParser.getPathParts(url);
            assert.equal(pathParts.length, 1);
            assert.equal(pathParts[0], "data store Id");
        });
    });
    describe(".createSubRequest", () => {
        let requestParser: RequestParser;
        beforeEach(() => {
            requestParser = RequestParser.create({ url: "/dataStoreId//some/route/" });
        });
        it("Create request from part 0", () => {
            assert.equal(requestParser.createSubRequest(0)?.url, "dataStoreId/some/route");
        });
        it("Create request from part 1", () => {
            assert.equal(requestParser.createSubRequest(1)?.url, "some/route");
        });
        it("Create request from part 2", () => {
            assert.equal(requestParser.createSubRequest(2)?.url, "route");
        });
        it("Create request from parts length ", () => {
            assert.equal(requestParser.createSubRequest(3)?.url, "");
        });
        it("Create request from invalid part ", () => {
            assert.throws(() => requestParser.createSubRequest(4));
            assert.throws(() => requestParser.createSubRequest(-1));
        });
    });
});
