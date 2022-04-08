/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Utility class to compute an hash for a given set of variables
 * using the murmur3 hash (see https://code.google.com/p/smhasher/)
 */

import murmurHash3 from "murmurhash3js";

export function calculateHash(key, seed = 0) {
    const str = murmurHash3.x86.hash128(key, seed);
    return `${str.substr(0, 8)}-${str.substr(8, 4)}-${str.substr(12, 4)}-${str.substr(16, 4)}-${str.substr(20, 12)}`;
}
