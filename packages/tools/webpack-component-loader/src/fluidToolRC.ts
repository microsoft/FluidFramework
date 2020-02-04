/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/filename-case */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as util from "util";
import { IODSPTokens } from "@microsoft/fluid-odsp-utils";

interface IResources {
    tokens?: { [key: string]: IODSPTokens };
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
