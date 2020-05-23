/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/filename-case */

import fs from "fs";
import os from "os";
import path from "path";
import util from "util";
import { IOdspTokens } from "@fluidframework/odsp-utils";

export interface IAsyncCache<K, T> {
    get(key: K): Promise<T | undefined>;
    save(key: K, value: T): Promise<void>;
}

interface IResources {
    tokens?: { [key: string]: IOdspTokens };
    pushTokens?: IOdspTokens;
}

const getRCFileName = () => path.join(os.homedir(), ".fluidtoolrc");

export async function loadRC(): Promise<IResources> {
    const readFile = util.promisify(fs.readFile);
    const exists = util.promisify(fs.exists);
    const fileName = getRCFileName();
    if (await exists(fileName)) {
        const buf = await readFile(fileName);
        try {
            return JSON.parse(buf.toString("utf8"));
        } catch (e) {
            // Nothing
        }
    }
    return {};
}

export async function saveRC(rc: IResources) {
    const writeFile = util.promisify(fs.writeFile);
    const content = JSON.stringify(rc, undefined, 2);
    return writeFile(getRCFileName(), Buffer.from(content, "utf8"));
}
