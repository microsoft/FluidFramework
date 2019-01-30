import { ICodeLoader, IContainerHost, IDocumentService, IPlatformFactory } from "@prague/container-definitions";
import { ICommit } from "@prague/gitresources";
// tslint:disable-next-line:no-var-requires
const now = require("performance-now") as () => number;
import { Container } from "./container";
import { debug } from "./debug";

/**
 * Loads a new component
 */
export async function load(
    uri: string,
    options: any,
    containerHost: IContainerHost,
    platform: IPlatformFactory,
    documentService: IDocumentService,
    codeLoader: ICodeLoader,
    specifiedVersion: ICommit = null,
    connect = true,
): Promise<Container> {
    debug(`Container loading: ${now()} `);

    // Verify we have services to load the document with

    if (!containerHost) {
        return Promise.reject("An IContainerHost must be provided");
    }

    if (!platform) {
        return Promise.reject("An IPlatformFactory must be provided");
    }

    if (!documentService) {
        return Promise.reject("An IDocumentService must be provided");
    }

    if (!codeLoader) {
        return Promise.reject("An ICodeLoader must be provided");
    }

    // Connect to the document
    if (!connect && !specifiedVersion) {
        return Promise.reject("Must specify a version if connect is set to false");
    }

    const container = await Container.Load(
        uri,
        options,
        containerHost,
        platform,
        documentService,
        codeLoader,
        specifiedVersion,
        connect);

    return container;
}
