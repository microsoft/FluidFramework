"use strict";
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OdspPersistentCache = void 0;
class OdspPersistentCache {
    constructor() {
        this.cache = new Map();
    }
    async get(entry) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.cache.get(this.keyFromEntry(entry));
    }
    async put(entry, value) {
        this.cache.set(this.keyFromEntry(entry), value);
    }
    async removeEntries(file) { }
    keyFromEntry(entry) {
        return `${entry.file.docId}_${entry.type}_${entry.key}`;
    }
}
exports.OdspPersistentCache = OdspPersistentCache;
//# sourceMappingURL=odspPersistantCache.js.map