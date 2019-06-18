/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:object-literal-sort-keys
import * as fs from "fs";
import * as util from "util";
import { paramSave, parseArguments } from "./pragueDumpArgs";
import {
    connectionInfo,
    paramDocumentService,
    pragueDumpInit,
} from "./pragueDumpInit";

import { pragueDumpMessages } from "./pragueDumpMessages";
import { pragueDumpSnapshot } from "./pragueDumpSnapshot";

async function pragueDumpMain() {
    await pragueDumpInit();
    if (paramSave !== undefined) {
        const mkdir = util.promisify(fs.mkdir);
        const writeFile = util.promisify(fs.writeFile);
        await mkdir(paramSave, { recursive: true });
        const info = {
            creationDate: new Date().toString(),
            connectionInfo,
        };
        await writeFile(`${paramSave}/info.json`, JSON.stringify(info, undefined, 2));
    }

    await pragueDumpMessages(paramDocumentService);
    await pragueDumpSnapshot(paramDocumentService);
}

parseArguments();

pragueDumpMain()
    .catch((error: string) => console.log(`ERROR: ${error}`))
    .then(() => process.exit(0));
