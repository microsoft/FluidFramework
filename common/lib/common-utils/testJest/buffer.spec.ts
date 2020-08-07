/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as BufferNode from "../src/bufferNode";
import * as BufferBrowser from "../src/bufferBrowser";

describe("Buffer isomorphism", () => {
    test("from string utf-8/16 is compatible", async () => {
        const testArray = [
            "",
            "asdfasdf", // ascii range
            "比特币", // non-ascii range
            "😂💁🏼‍♂️💁🏼‍💁‍♂", // surrogate pairs with glyph modifiers
            "\u0080\u0080", // invalid sequence of utf-8 continuation codes
            "\ud800", // single utf-16 surrogate without pair
            "\u2962\u0000\uffff\uaaaa" // garbage
        ];

        for (let i = 0; i < testArray.length; i++) {
            const nodeBuffer = BufferNode.IsoBuffer.from(testArray[i]);
            const browserBuffer = BufferBrowser.IsoBuffer.from(testArray[i]);

            expect(nodeBuffer.toString()).toEqual(browserBuffer.toString());
        }

        const nodeBuffer = BufferNode.IsoBuffer.from(testArray[1]);
        const browserBuffer = BufferBrowser.IsoBuffer.from(testArray[1]);
        expect(nodeBuffer.toString("utf8")).toEqual(browserBuffer.toString("utf8"));
        expect(nodeBuffer.toString("utf-8")).toEqual(browserBuffer.toString("utf-8"));
    });

    test("from string base64 is compatible", async () => {
        const testArray = [
            "",
            "aa_/-",
            "a==",
            "a=======",
            "äa=bb==cc==",
            "Not A Base64 String 🤪",
            "YXNkZmFzZGY=", // asdfasdf
            "5q+U54m55biB", // 比特币
            "8J+YgvCfkoHwn4+84oCN4pmC77iP8J+SgfCfj7zigI3wn5KB4oCN4pmC" // 😂💁🏼‍♂️💁🏼‍💁‍♂
        ];

        for (let i = 0; i < testArray.length; i++) {
            const nodeBuffer = BufferNode.IsoBuffer.from(testArray[i], "base64");
            const browserBuffer = BufferBrowser.IsoBuffer.from(testArray[i], "base64");

            expect(nodeBuffer.toString("base64")).toEqual(browserBuffer.toString("base64"));
        }
    });

    test("from arraybuffer is compatible", async () => {
        const testArray = [
            "",
            "asdfasdf", // ascii range
            "比特币", // non-ascii range
            "😂💁🏼‍♂️💁🏼‍💁‍♂", // surrogate pairs with glyph modifiers
        ];

        for (let i = 0; i < testArray.length; i++) {
            const encoded = new TextEncoder().encode(testArray[i]).buffer;
            const nodeBuffer = BufferNode.IsoBuffer.from(encoded);
            const browserBuffer = BufferBrowser.IsoBuffer.from(encoded);

            expect(nodeBuffer.toString()).toEqual(browserBuffer.toString());
        }
    });

    test("utf8 base64 conversion is compatible", async () => {
        const testArrayUtf8 = [
            "",
            "asdfasdf", // ascii range
            "比特币", // non-ascii range
            "😂💁🏼‍♂️💁🏼‍💁‍♂" // surrogate pairs with glyph modifiers
        ];

        const testArrayBase64 = [
            "",
            "YXNkZmFzZGY=", // asdfasdf
            "5q+U54m55biB", // 比特币
            "8J+YgvCfkoHwn4+84oCN4pmC77iP8J+SgfCfj7zigI3wn5KB4oCN4pmC" // 😂💁🏼‍♂️💁🏼‍💁‍♂
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
});
