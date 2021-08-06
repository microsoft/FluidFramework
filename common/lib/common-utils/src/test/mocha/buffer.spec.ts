/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as BufferBrowser from "../../bufferBrowser";

describe("buffer", () => {
    it("Uint8Array to array buffer conversion", async () => {
        const content = "contents";
        const array = BufferBrowser.IsoBuffer.from(content);

        // Convert array back to string
        assert.strictEqual(BufferBrowser.bufferToString(BufferBrowser.IsoBuffer.from(array), "utf8"), content,
            "Content {contents} should match");
        assert.strictEqual(BufferBrowser.bufferToString(BufferBrowser.IsoBuffer.from(array, 1), "utf8"), "ontents",
            "Content {ontents} should match");
        assert.strictEqual(BufferBrowser.bufferToString(BufferBrowser.IsoBuffer.from(array, 1, 2), "utf8"), "on",
            "Content {on} should match");
        assert.strictEqual(BufferBrowser.bufferToString(BufferBrowser.IsoBuffer.from(array, 1, 7), "utf8"), "ontents",
            "Content {ontents} should match");
        assert.strictEqual(BufferBrowser.bufferToString(BufferBrowser.IsoBuffer.from(array, undefined, 7), "utf8"),
            "content", "Content {content} should match");
        assert.strictEqual(BufferBrowser.bufferToString(BufferBrowser.IsoBuffer.from(array, 7, 1), "utf8"),
            "s", "Content {s} should match");
        // assert.strictEqual(BufferBrowser.bufferToString(BufferBrowser.IsoBuffer.from(array, 4, 0), "utf8"),
        //     "", "Content {s} should match");
    });

    it("Uint8Array to array buffer conversion errors", async () => {
        const content = "contents";
        const array = BufferBrowser.IsoBuffer.from(content);
        let count = 0;
        // Convert array back to string
        try {
            BufferBrowser.IsoBuffer.from(array, -1);
        } catch (error) {
            count++;
        }
        assert(count === 1, "Count should be 1");
        try {
            BufferBrowser.IsoBuffer.from(array, 8);
        } catch (error) {
            count++;
        }
        assert(count === 2, "Count should be 2");
        try {
            BufferBrowser.IsoBuffer.from(array, undefined, -1);
        } catch (error) {
            count++;
        }
        assert(count === 3, "Count should be 3");
        try {
            BufferBrowser.IsoBuffer.from(array, undefined, 9);
        } catch (error) {
            count++;
        }
        assert(count === 4, "Count should be 4");
    });
});
