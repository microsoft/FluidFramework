/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { GlobalFieldKey } from "../schema-stored";
import { brand, Brand, fail } from "../util";

/**
 * Symbol which can be used to lookup a global field.
 * Using a symbol here avoids the need to use the full string version of the key,
 * and avoids the possibility of colliding with local field keys.
 *
 * Must only be produced using {@link symbolFromKey}.
 */
export type GlobalFieldKeySymbol = Brand<symbol, "GlobalFieldKeySymbol">;

// These maps are used instead of `Symbol.for` and `Symbol.keyFor` to avoid colliding with unrelated symbols.
const symbolMap: Map<GlobalFieldKey, GlobalFieldKeySymbol> = new Map();
const keyMap: Map<GlobalFieldKeySymbol, GlobalFieldKey> = new Map();

/**
 * @returns a symbol to use for `key`.
 */
export function symbolFromKey(key: GlobalFieldKey): GlobalFieldKeySymbol {
    const sym = symbolMap.get(key);
    if (sym !== undefined) {
        return sym;
    }
    const newSym: GlobalFieldKeySymbol = brand(Symbol(key));
    symbolMap.set(key, newSym);
    keyMap.set(newSym, key);
    return newSym;
}

/**
 * @returns the original {@link GlobalFieldKey} for the symbol.
 */
export function keyFromSymbol(key: GlobalFieldKeySymbol): GlobalFieldKey {
    return keyMap.get(key) ?? fail("missing key for symbol");
}

/**
 * @returns true iff `key` is a {@link GlobalFieldKeySymbol}.
 */
export function symbolIsFieldKey(key: symbol): key is GlobalFieldKeySymbol {
    return keyMap.has(key as GlobalFieldKeySymbol);
}
