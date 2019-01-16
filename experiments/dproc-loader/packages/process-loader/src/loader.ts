import { ICommit } from "@prague/gitresources";
import { ICodeLoader } from "@prague/process-definitions";
import { IDocumentService, IPlatformFactory, ITokenProvider, IUser } from "@prague/runtime-definitions";
import { debug } from "./debug";
import { Document } from "./document";

/**
 * Loads a new interactive document
 */
export async function load(
    id: string,
    tenantId: string,
    user: IUser,
    tokenProvider: ITokenProvider,
    options: any,
    platform: IPlatformFactory,
    documentService: IDocumentService,
    codeLoader: ICodeLoader,
    specifiedVersion: ICommit = null,
    connect = true): Promise<Document> {

    debug(`Document loading: ${Date.now} `);

    // Verify we have services to load the document with
    if (!documentService) {
        return Promise.reject("An IDocumentService must be provided");
    }

    // Connect to the document
    if (!connect && !specifiedVersion) {
        return Promise.reject("Must specify a version if connect is set to false");
    }

    // Verify a token was provided
    if (!tokenProvider.isValid()) {
        return Promise.reject("Must provide a token");
    }

    const document = await Document.Load(
        id,
        tenantId,
        user,
        tokenProvider,
        platform,
        documentService,
        codeLoader,
        options,
        specifiedVersion,
        connect);

    return document;
}
