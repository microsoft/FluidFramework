/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { OffsetListFactory } from "../../util";

describe("OffsetListFactory", () => {
    it("Inserts an offset when there is content after the offset", () => {
        const factory = new OffsetListFactory<string>();
        factory.pushOffset(42);
        factory.pushContent("foo");
        assert.deepStrictEqual(factory.list, [42, "foo"]);
    });

    it("Merges runs of offsets into a single offset", () => {
        const factory = new OffsetListFactory<string>();
        factory.pushOffset(42);
        factory.pushOffset(42);
        factory.pushContent("foo");
        assert.deepStrictEqual(factory.list, [84, "foo"]);
    });

    it("Does not insert an offset when there is no content after the offset", () => {
        const factory = new OffsetListFactory<string>();
        factory.pushContent("foo");
        factory.pushOffset(42);
        factory.pushOffset(42);
        assert.deepStrictEqual(factory.list, ["foo"]);
    });
});
