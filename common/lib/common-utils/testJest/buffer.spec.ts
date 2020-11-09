/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import * as BufferNode from "../src/bufferNode";
// eslint-disable-next-line import/no-internal-modules
import * as BufferBrowser from "../src/bufferBrowser";

describe("Buffer isomorphism", () => {
    test("from string utf-8/16 is compatible", () => {
        const testArray = [
            "",
            "asdfasdf", // ascii range
            "比特币", // non-ascii range
            "😂💁🏼‍♂️💁🏼‍💁‍♂", // surrogate pairs with glyph modifiers
            "\u0080\u0080", // invalid sequence of utf-8 continuation codes
            "\ud800", // single utf-16 surrogate without pair
            "\u2962\u0000\uffff\uaaaa", // garbage
        ];

        for (const item of testArray) {
            const nodeBuffer = BufferNode.IsoBuffer.from(item);
            const browserBuffer = BufferBrowser.IsoBuffer.from(item);

            expect(nodeBuffer.toString()).toEqual(browserBuffer.toString());
        }

        {
            const nodeBuffer = BufferNode.IsoBuffer.from(testArray[1]);
            const browserBuffer = BufferBrowser.IsoBuffer.from(testArray[1]);
            expect(nodeBuffer.toString("utf8")).toEqual(browserBuffer.toString("utf8"));
            expect(nodeBuffer.toString("utf-8")).toEqual(browserBuffer.toString("utf-8"));
        }
    });

    test("from string base64 is compatible", () => {
        const testArray = [
            "",
            "aa_/-",
            "a==",
            "a=======",
            "äa=bb==cc==",
            "Not A Base64 String 🤪",
            "YXNkZmFzZGY=", // asdfasdf
            "5q+U54m55biB", // 比特币
            "8J+YgvCfkoHwn4+84oCN4pmC77iP8J+SgfCfj7zigI3wn5KB4oCN4pmC", // 😂💁🏼‍♂️💁🏼‍💁‍♂
        ];

        for (const item of testArray) {
            const nodeBuffer = BufferNode.IsoBuffer.from(item, "base64");
            const browserBuffer = BufferBrowser.IsoBuffer.from(item, "base64");

            expect(nodeBuffer.toString("base64")).toEqual(browserBuffer.toString("base64"));
        }
    });

    test("from arraybuffer is compatible", () => {
        const testArray = [
            "",
            "asdfasdf", // ascii range
            "比特币", // non-ascii range
            "😂💁🏼‍♂️💁🏼‍💁‍♂", // surrogate pairs with glyph modifiers
        ];

        for (const item of testArray) {
            const encoded = new TextEncoder().encode(item).buffer;
            const nodeBuffer = BufferNode.IsoBuffer.from(encoded);
            const browserBuffer = BufferBrowser.IsoBuffer.from(encoded);

            expect(nodeBuffer.toString()).toEqual(browserBuffer.toString());
        }
    });

    test("utf8 base64 conversion is compatible", () => {
        const testArrayUtf8 = [
            "",
            "asdfasdf", // ascii range
            "比特币", // non-ascii range
            "😂💁🏼‍♂️💁🏼‍💁‍♂", // surrogate pairs with glyph modifiers
        ];

        const testArrayBase64 = [
            "",
            "YXNkZmFzZGY=", // asdfasdf
            "5q+U54m55biB", // 比特币
            "8J+YgvCfkoHwn4+84oCN4pmC77iP8J+SgfCfj7zigI3wn5KB4oCN4pmC", // 😂💁🏼‍♂️💁🏼‍💁‍♂
        ];

        for (let i = 0; i < testArrayUtf8.length; i++) {
            const nodeBuffer1 = BufferNode.IsoBuffer.from(testArrayUtf8[i]);
            expect(nodeBuffer1.toString("base64")).toEqual(testArrayBase64[i]);

            const nodeBuffer2 = BufferNode.IsoBuffer.from(nodeBuffer1.toString("base64"), "base64");
            expect(nodeBuffer2.toString()).toEqual(testArrayUtf8[i]);

            const browserBuffer1 = BufferBrowser.IsoBuffer.from(testArrayUtf8[i]);
            expect(browserBuffer1.toString("base64")).toEqual(testArrayBase64[i]);

            const browserBuffer2 = BufferBrowser.IsoBuffer.from(browserBuffer1.toString("base64"), "base64");
            expect(browserBuffer2.toString()).toEqual(testArrayUtf8[i]);
        }
    });

    test("bytelength is compatible", () => {
        const testString = "8J+YgvCfkoHwn4+84oCN4pmC77iP8J+SgfCfj7zigI3wn5KB4oCN4pmC";

        const nodeBufferUtf8 = BufferNode.IsoBuffer.from(testString);
        const browserBufferUtf8 = BufferBrowser.IsoBuffer.from(testString);
        expect(nodeBufferUtf8.byteLength).toEqual(browserBufferUtf8.byteLength);

        const nodeBufferBase64 = BufferNode.IsoBuffer.from(testString, "base64");
        const browserBufferBase64 = BufferBrowser.IsoBuffer.from(testString, "base64");
        expect(nodeBufferBase64.byteLength).toEqual(browserBufferBase64.byteLength);
    });

    test("Uint8ArrayToString is compatible", () => {
        const testArray = new Uint8Array([1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377]);

        const nodeStringUtf8 = BufferNode.Uint8ArrayToString(testArray, "utf8");
        const browserStringUtf8 = BufferBrowser.Uint8ArrayToString(testArray, "utf8");
        expect(nodeStringUtf8).toEqual(browserStringUtf8);

        const nodeStringBase64 = BufferNode.Uint8ArrayToString(testArray, "base64");
        const browserStringBase64 = BufferBrowser.Uint8ArrayToString(testArray, "base64");
        expect(nodeStringBase64).toEqual(browserStringBase64);
    });
});
