/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { GlobalFieldKey } from "../../schema-stored";
import { keyFromSymbol, symbolFromKey, symbolIsFieldKey } from "../../tree";
import { brand } from "../../util";

const key1 = brand<GlobalFieldKey>("testKey");
const key2 = brand<GlobalFieldKey>("testKey2");

describe("globalFieldKeySymbol", () => {
    it("symbolFromKey", () => {
        assert.equal(symbolFromKey(key1), symbolFromKey(key1));
        assert.notEqual(symbolFromKey(key1), symbolFromKey(key2));
    });
    it("keyFromSymbol", () => {
        const sym1 = symbolFromKey(key1);
        const sym2 = symbolFromKey(key2);
        assert.equal(keyFromSymbol(sym1), key1);
        assert.equal(keyFromSymbol(sym2), key2);
    });
    it("symbolIsFieldKey", () => {
        const sym1 = Symbol("not a field");
        const sym2 = symbolFromKey(key2);
        assert.equal(symbolIsFieldKey(sym1), false);
        assert.equal(symbolIsFieldKey(sym2), true);
    });
});
