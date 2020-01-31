/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/filename-case */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as util from "util";
import { IOdspTokens } from "@microsoft/fluid-odsp-utils";

export interface IAsyncCache<K, T> {
    get(key: K): Promise<T | undefined>;
    save(key: K, value: T): Promise<void>;
}

interface IResources {
    tokens?: { [key: string]: IOdspTokens };
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

export const odspTokensCache: IAsyncCache<string, IOdspTokens> = {
    async get(server: string): Promise<IOdspTokens | undefined> {
        const rc = await loadRC();
        const tokens = rc.tokens;
        if (!tokens) {
            return undefined;
        }
        const odspTokens = tokens[server];
        if (!odspTokens) {
            return undefined;
        }
        return odspTokens;
    },
    async save(server: string, tokens: IOdspTokens): Promise<void> {
        const rc = await loadRC();
        let prevTokens = rc.tokens;
        if (!prevTokens) {
            prevTokens = {};
            rc.tokens = prevTokens;
        }
        prevTokens[server] = tokens;
        return saveRC(rc);
    },
};
