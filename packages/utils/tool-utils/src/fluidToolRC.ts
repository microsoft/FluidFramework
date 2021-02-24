/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/filename-case */

import fs from "fs";
import os from "os";
import path from "path";
import util from "util";
import { lock, unlock } from "proper-lockfile";
import { IOdspTokens } from "@fluidframework/odsp-doclib-utils";

export interface IAsyncCache<TKey, TValue> {
    get(key: TKey): Promise<TValue | undefined>;
    save(key: TKey, value: TValue): Promise<void>;
    lock<T>(callback: () => Promise<T>): Promise<T>;
}

export interface IResources {
    tokens?: {
        version?: number;
        data: {
            [key: string]: {
                storage?: IOdspTokens,
                push?: IOdspTokens
            }
        }
    }
}

const getRCFileName = () => path.join(os.homedir(), ".fluidtoolrc");

export async function loadRC(): Promise<IResources> {
    const readFile = util.promisify(fs.readFile);
    const exists = util.promisify(fs.exists);
    const fileName = getRCFileName();
    if (await exists(fileName)) {
        const buf = await readFile(fileName);
        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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

export async function lockRC<T>(callback: () => Promise<T>) {
    let locked = false;
    do{
        try{
            await lock(getRCFileName(), { realpath: false });
            locked = true;
        }catch{
            await new Promise((resolve)=>setTimeout(resolve, 0));
         }
    }while(!locked);
    try{
        return await callback();
    }finally{
        await unlock(getRCFileName(), { realpath: false });
    }
}
