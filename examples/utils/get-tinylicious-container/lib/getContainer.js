/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { Loader } from "@fluidframework/container-loader";
export async function getContainer(documentId, createNew, request, urlResolver, documentServiceFactory, containerRuntimeFactory) {
    const module = { fluidExport: containerRuntimeFactory };
    const codeLoader = { load: async () => module };
    const loader = new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader,
    });
    let container;
    if (createNew) {
        // We're not actually using the code proposal (our code loader always loads the same module regardless of the
        // proposal), but the Container will only give us a NullRuntime if there's no proposal.  So we'll use a fake
        // proposal.
        container = await loader.createDetachedContainer({ package: "no-dynamic-package", config: {} });
        await container.attach({ url: documentId });
    }
    else {
        // Request must be appropriate and parseable by resolver.
        container = await loader.resolve(request);
        // If we didn't create the container properly, then it won't function correctly.  So we'll throw if we got a
        // new container here, where we expect this to be loading an existing container.
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!container.existing) {
            throw new Error("Attempted to load a non-existing container");
        }
    }
    return container;
}
//# sourceMappingURL=getContainer.js.map