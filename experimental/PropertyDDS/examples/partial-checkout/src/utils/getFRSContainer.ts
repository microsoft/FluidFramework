/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createContainer, getContainer } from "@fluid-experimental/get-container";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { IRuntimeFactory } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { DriverHeader } from "@fluidframework/driver-definitions";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { InsecureTinyliciousTokenProvider, InsecureTinyliciousUrlResolver } from "@fluidframework/tinylicious-driver";
import { IRequest } from "@fluidframework/core-interfaces";

const createAzureCreateNewRequest = (): IRequest => (
    {
        url: "",
        headers: {
            [DriverHeader.createNew]: true,
        },
    }
);

export async function getFRSContainer(
    documentId: string,
    containerRuntimeFactory: IRuntimeFactory,
    createNew: boolean,
): Promise<[Container, string]> {
    if (process.env.ID === undefined) { throw Error("Define ID in .env file"); }
    if (process.env.KEY === undefined) { throw Error("Define KEY in .env file"); }
    if (process.env.ORDERER === undefined) { throw Error("Define ORDERER in .env file"); }
    if (process.env.STORAGE === undefined) { throw Error("Define STORAGE in .env file"); }

    const tokenProvider = new InsecureTinyliciousTokenProvider();
    const documentServiceFactory = new RouterliciousDocumentServiceFactory(tokenProvider);
    const urlResolver = new InsecureTinyliciousUrlResolver();

    /* const user = {
        id: "unique-id",
        name: "Unique Idee",
    };

    const tenantId = process.env.ID;
    const key = process.env.KEY;
    const hostToken = jwt.sign(
        {
            user,
            documentId,
            tenantId: tenantId,
            scopes: ["doc:read", "doc:write", "summary:write"],
        },
        key); */

    let container: Container;
    if (createNew) {
        container = await createContainer({
            documentServiceFactory,
            urlResolver,
            containerRuntimeFactory,
            request: createAzureCreateNewRequest(),
        });
    } else {
        container = await getContainer({
            documentServiceFactory,
            urlResolver,
            containerRuntimeFactory,
            request: { url: documentId },
        });
    }
    const resolved = container.resolvedUrl;
    ensureFluidResolvedUrl(resolved);
    const containerId = resolved.id;
    return [container, containerId];
}

export function hasFRSEndpoints() {
    try {
        if (process.env.ID === undefined) { throw Error("Define ID in .env file"); }
        if (process.env.KEY === undefined) { throw Error("Define KEY in .env file"); }
        if (process.env.ORDERER === undefined) { throw Error("Define ORDERER in .env file"); }
        if (process.env.STORAGE === undefined) { throw Error("Define STORAGE in .env file"); }
    } catch {
        return false;
    }
    return true;
}
