/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:object-literal-sort-keys
import * as fs from "fs";
import * as util from "util";
import { paramSave, parseArguments } from "./fluidFetchArgs";
import {
    connectionInfo,
    fluidFetchInit,
    paramDocumentService,
} from "./fluidFetchInit";

import { fluidFetchMessages } from "./fluidFetchMessages";
import { fluidFetchSnapshot } from "./fluidFetchSnapshot";

async function fluidFetchMain() {
    await fluidFetchInit();
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

    await fluidFetchMessages(paramDocumentService);
    await fluidFetchSnapshot(paramDocumentService);
}

parseArguments();

fluidFetchMain()
    .catch((error: Error) => {
        if (error instanceof Error) {
            let extraMsg = "";
            const data = (error as any).requestResult;
            if (data) {
                extraMsg = "\nRequest Result: JSON.stringify(data, undefined, 2)";
            }
            const statusCode = (error as any).statusCode;
            if (statusCode !== undefined) {
                extraMsg = `${extraMsg}\nStatus Code: ${statusCode}`;
            }
            console.log(`ERROR: ${error.stack}${extraMsg}`);
        } else if (typeof error === "object") {
            console.log(`ERROR: Unknown exception object\n${JSON.stringify(error, undefined, 2)}`);
        } else {
            console.log(`ERROR: ${error}`);
        }
    })
    .then(() => process.exit(0));
