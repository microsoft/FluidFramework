/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import crypto from "crypto";
import { readFileAsync } from "./utils";

export class FileHashCache {
    private fileHashCache = new Map<string, Promise<string>>();
    private async calcFileHash(path: string) {
        const content = await readFileAsync(path);
        return crypto.createHash("sha256").update(content).digest("hex");
    }
    public async getFileHash(path: string) {
        const cachedHashP = this.fileHashCache.get(path);
        if (cachedHashP) {
            return cachedHashP;
        }
        const newHashP = this.calcFileHash(path);
        this.fileHashCache.set(path, newHashP);
        return newHashP;
    }

    public clear() {
        this.fileHashCache.clear();
    }
}