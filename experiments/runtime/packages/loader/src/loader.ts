import { ICommit } from "@prague/gitresources";
import { IDocumentService, ITokenService } from "@prague/runtime-definitions";
import now = require("performance-now");
import { debug } from "./debug";
import { Document } from "./document";

/**
 * Loads a new interactive document
 */
export async function load(
    token: string,
    options: any,
    documentService: IDocumentService,
    tokenService: ITokenService,
    specifiedVersion: ICommit = null,
    connect = true): Promise<Document> {

    // Need to go and load in the last snapshot
    // The snapshot *must* contain the consensus data. This will allows us to load in the code package
    // Connect to the delta stream in parallel - can begin queue'ing events even if can't process
    // Once code package is available download and load it.

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

    const document = new Document(token, documentService, tokenService, options);
    await document.load(specifiedVersion, connect);

    return document;
}
