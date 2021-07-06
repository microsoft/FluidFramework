/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { parseFacetCodes } from "../odspErrorUtils";

describe("parseFacetCodes", () => {
   it("can parse regular error", () => {
        const text = '{"error":{"code":"a"}}';
        const stack = parseFacetCodes(text);
        assert.deepStrictEqual(stack,["a"]);
   });

   it("can parse nested error", () => {
    const text = '{"error":{"code":"a", "innerError":{"code":"b"}}}';
    const text2 = '{"error":{"code":"a", "innerError":{"code":"b","innerError":{"code":"c"}}}}';
    const stack = parseFacetCodes(text);
    const stack2 = parseFacetCodes(text2);
    assert.deepStrictEqual(stack,["b","a"]);
    assert.deepStrictEqual(stack2,["c","b","a"]);
    });

    it("can handle empty error", () => {
        const text = "";
        const stack = parseFacetCodes(text);
        assert.deepStrictEqual(stack,[]);
    });

    it("can handle non-object error", () => {
        const text = "abc";
        const stack = parseFacetCodes(text);
        assert.deepStrictEqual(stack,[]);
    });

    it("can handle error with no code property", () => {
        const text = '{"error":{"innerError":"a"}}';
        const stack = parseFacetCodes(text);
        assert.deepStrictEqual(stack,[]);
    });

    it("can handle error with code property in some layers", () => {
        const text = '{"error":{"innerError":{"code":"a"}}}';
        const stack = parseFacetCodes(text);
        assert.deepStrictEqual(stack,["a"]);
    });
});
