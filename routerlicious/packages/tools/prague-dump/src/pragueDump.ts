// tslint:disable:object-literal-sort-keys
import * as fs from "fs";
import * as util from "util";
import { paramSave, parseArguments } from "./pragueDumpArgs";
import {
    connectionInfo,
    paramDocumentService,
    paramId,
    paramTenantId,
    paramTokenProvider,
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

    await pragueDumpMessages(paramDocumentService, paramTokenProvider, paramTenantId, paramId);
    await pragueDumpSnapshot(paramDocumentService, paramTokenProvider, paramTenantId, paramId);
}

parseArguments();

pragueDumpMain()
    .catch((error: string) => console.log(`ERROR: ${error}`))
    .finally(() => process.exit(0));
