/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { IContainer, IRuntimeFactory } from "@fluidframework/container-definitions";
import { DriverHeader } from "@fluidframework/driver-definitions";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { InsecureTinyliciousTokenProvider, InsecureTinyliciousUrlResolver } from "@fluidframework/tinylicious-driver";
import { IRequest } from "@fluidframework/core-interfaces";
import { createContainer, getContainer } from "./getContainer";

const createAzureCreateNewRequest = (): IRequest => (
    {
        url: "",
        headers: {
            [DriverHeader.createNew]: true,
        },
    }
);

const verifyEnvConfig = () => {
    if (process.env.ID === undefined) { throw Error("Define ID in .env file"); }
    if (process.env.KEY === undefined) { throw Error("Define KEY in .env file"); }
    if (process.env.ORDERER === undefined) { throw Error("Define ORDERER in .env file"); }
    if (process.env.STORAGE === undefined) { throw Error("Define STORAGE in .env file"); }
};

export async function getFluidRelayContainer(
    documentId: string,
    containerRuntimeFactory: IRuntimeFactory,
    createNew: boolean,
): Promise<[IContainer, string]> {
    verifyEnvConfig();

    const tokenProvider = new InsecureTinyliciousTokenProvider();
    const documentServiceFactory = new RouterliciousDocumentServiceFactory(tokenProvider);
    const urlResolver = new InsecureTinyliciousUrlResolver();

    const container = await (createNew
        ? createContainer({
            documentServiceFactory,
            urlResolver,
            containerRuntimeFactory,
            request: createAzureCreateNewRequest(),
        }) : getContainer({
            documentServiceFactory,
            urlResolver,
            containerRuntimeFactory,
            request: { url: documentId },
        }));
    const resolved = container.resolvedUrl;
    ensureFluidResolvedUrl(resolved);
    const containerId = resolved.id;
    return [container, containerId];
}

export function hasFluidRelayEndpoints() {
    try {
        verifyEnvConfig();
        return true;
    } catch {
        return false;
    }
}
