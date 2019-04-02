
import { IDocumentService, ITokenProvider } from "@prague/container-definitions";
import { parseArguments, printUsage } from "./pragueDumpArgs";
import {
    paramDocumentService,
    paramId,
    paramTenantId,
    paramTokenProvider,
    pragueDumpInit,
} from "./pragueDumpInit";

import { pragueDumpMessages } from "./pragueDumpMessages";
import { pragueDumpSnapshot } from "./pragueDumpSnapshot";

function pragueDumpMain(
    documentService: IDocumentService,
    tokenProvider: ITokenProvider,
    tenantId: string,
    id: string) {

    pragueDumpMessages(documentService, tokenProvider, tenantId, id)
    .then(() => pragueDumpSnapshot(documentService, tokenProvider, tenantId, id))
    .catch((error) => console.log(`ERROR: ${error}`))
    .finally(() => process.exit());
}

parseArguments();

pragueDumpInit()
    .then(() => {
        pragueDumpMain(paramDocumentService, paramTokenProvider, paramTenantId, paramId);
    })
    .catch((error: string) => {
        console.log(`ERROR: ${error}`);
        printUsage();
    });
