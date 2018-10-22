import { ICommit } from "@prague/gitresources";
import { ICodeLoader, IDocumentService, IPlatformFactory, IUser } from "@prague/runtime-definitions";
import { debug } from "./debug";
import { Document } from "./document";

// tslint:disable:no-var-requires
const now = require("performance-now");
// tslint:enable:no-var-requires

/**
 * Loads a new interactive document
 */
export async function load(
    id: string,
    tenantId: string,
    user: IUser,
    token: string,
    options: any,
    platform: IPlatformFactory,
    documentService: IDocumentService,
    codeLoader: ICodeLoader,
    specifiedVersion: ICommit = null,
    connect = true): Promise<Document> {

    // Need to go and load in the last snapshot
    // The snapshot *must* contain the consensus data. This will allows us to load in the code package
    // Connect to the delta stream in parallel - can begin queue'ing events even if can't process
    // Once code package is available download and load it.

    /* tslint:disable:no-unsafe-any */
    debug(`Document loading: ${now()} `);

    // Verify we have services to load the document with
    if (!documentService) {
        return Promise.reject("An IDocumentService must be provided");
    }

    // Connect to the document
    if (!connect && !specifiedVersion) {
        return Promise.reject("Must specify a version if connect is set to false");
    }

    // Verify a token was provided
    if (!token) {
        return Promise.reject("Must provide a token");
    }

    const document = await Document.Load(
        id,
        tenantId,
        user,
        token,
        platform,
        documentService,
        codeLoader,
        options,
        specifiedVersion,
        connect);

    return document;
}
