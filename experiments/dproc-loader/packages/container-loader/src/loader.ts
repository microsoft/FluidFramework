import {
    ICodeLoader,
    IDocumentService,
    IHost,
    ILoadResponse,
} from "@prague/container-definitions";
// tslint:disable-next-line:no-var-requires
const now = require("performance-now") as () => number;
import { Container } from "./container";
import { debug } from "./debug";

/**
 * Manages Prague resource loading
 */
// class Loader {
// }

/**
 * Loads a new component
 */
export async function load(
    uri: string,
    containerHost: IHost,
    documentService: IDocumentService,
    codeLoader: ICodeLoader,
    options: any,
): Promise<ILoadResponse> {
    debug(`Container loading: ${now()} `);

    // Verify we have services to load the document with

    if (!containerHost) {
        return Promise.reject("An IContainerHost must be provided");
    }

    if (!documentService) {
        return Promise.reject("An IDocumentService must be provided");
    }

    if (!codeLoader) {
        return Promise.reject("An ICodeLoader must be provided");
    }

    // We should parse out the container details from the path. Then stash it away somewhere. Then go
    // and load the object referenced by the given path.
    // Care will need to be taken for specific versions vs. live versions.
    const container = await Container.Load(
        uri,
        containerHost,
        documentService,
        codeLoader,
        options);

    return container;
}
