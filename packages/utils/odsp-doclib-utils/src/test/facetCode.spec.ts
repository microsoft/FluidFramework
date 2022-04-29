/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { parseFacetCodes, tryParseErrorResponse } from "../odspErrorUtils";

describe("parseFacetCodes", () => {
   it("can parse regular error", () => {
        const text = '{"error":{"message":"foo", "code":"a"}}';
        const result = tryParseErrorResponse(text);
        assert(result.success);
        const stack = parseFacetCodes(result.errorResponse);
        assert.deepStrictEqual(stack, ["a"]);
   });

   it("can parse nested error", () => {
    const text = '{"error":{"message":"foo", "code":"a", "innerError":{"code":"b"}}}';
    const result = tryParseErrorResponse(text);
    assert(result.success);
    const stack = parseFacetCodes(result.errorResponse);
    assert.deepStrictEqual(stack, ["b", "a"]);
    });

   it("can parse doubly nested error", () => {
    const text = '{"error":{"message":"foo", "code":"a", "innerError":{"code":"b","innerError":{"code":"c"}}}}';
    const result = tryParseErrorResponse(text);
    assert(result.success);
    const stack = parseFacetCodes(result.errorResponse);
    assert.deepStrictEqual(stack, ["c", "b", "a"]);
    });

    it("tryParseErrorResponse fails on empty error", () => {
        const text = "";
        const result = tryParseErrorResponse(text);
        assert(!result.success);
    });

    it("tryParseErrorResponse fails on non-object error", () => {
        const text = "abc";
        const result = tryParseErrorResponse(text);
        assert(!result.success);
    });

    it("can handle error with no code property", () => {
        const text = '{"error":{"message":"foo", "innerError":"a"}}';
        const result = tryParseErrorResponse(text);
        assert(result.success);
        const stack = parseFacetCodes(result.errorResponse);
        assert.deepStrictEqual(stack, []);
    });

    it("can handle error with code property in some layers", () => {
        const text = '{"error":{"message":"foo", "innerError":{"code":"a"}}}';
        const result = tryParseErrorResponse(text);
        assert(result.success);
        const stack = parseFacetCodes(result.errorResponse);
        assert.deepStrictEqual(stack, ["a"]);
    });
});
