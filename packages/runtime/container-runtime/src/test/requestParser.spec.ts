/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { RequestParser } from "../requestParser";

describe("RequestParser", () => {
    describe(".getPathParts", () => {
        it("Parse Component Id", () => {
            const url = "componentId";
            const pathParts = RequestParser.getPathParts(url);
            assert.equal(pathParts.length, 1);
            assert.equal(pathParts[0], "componentId");
        });
        it("Parse Component Id with /", () => {
            const url = "/componentId/";
            const pathParts = RequestParser.getPathParts(url);
            assert.equal(pathParts.length, 1);
            assert.equal(pathParts[0], "componentId");
        });
        it("Parse Component Id with query", () => {
            const url = "/componentId/?foo=bar";
            const pathParts = RequestParser.getPathParts(url);
            assert.equal(pathParts.length, 1);
            assert.equal(pathParts[0], "componentId");
        });
        it("Parse Component Id with sub route with query", () => {
            const url = "/componentId//some/route?foo=bar";
            const pathParts = RequestParser.getPathParts(url);
            assert.equal(pathParts.length, 3);
            assert.equal(pathParts[0], "componentId");
            assert.equal(pathParts[1], "some");
            assert.equal(pathParts[2], "route");
        });
        it("Parse encoded Component Id", () => {
            const url = "component%20Id";
            const pathParts = RequestParser.getPathParts(url);
            assert.equal(pathParts.length, 1);
            assert.equal(pathParts[0], "component Id");
        });
    });
    describe(".createSubRequest", () => {
        let requestParser: RequestParser;
        beforeEach(() => {
            requestParser = new RequestParser({ url: "/componentId//some/route/" });
        });
        it("Create request from part 0", () => {
            assert.equal(requestParser.createSubRequest(0)?.url, "componentId/some/route");
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
            assert.equal(requestParser.createSubRequest(4), undefined);
            assert.equal(requestParser.createSubRequest(-1), undefined);
        });
    });
});
