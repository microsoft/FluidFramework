/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { ContainerUrlResolver } from "@fluidframework/routerlicious-host";
import jwt from "jsonwebtoken";
import { IRuntimeFactory } from "@fluidframework/container-definitions";
import { getContainer } from "./getContainer";

export async function getRouterliciousContainer(
    documentId: string,
    containerRuntimeFactory: IRuntimeFactory,
    createNew: boolean,
) {
    const documentServiceFactory = new RouterliciousDocumentServiceFactory();
    const user = {
        id: "node-user",         // Required value
        name: "Node User",       // Optional value that we included
    };

    const hostToken = jwt.sign(
        {
            user,
            documentId,
            tenantId: "fluid",
            scopes: ["doc:read", "doc:write", "summary:write"],
        },
        "");

    const urlResolver = new ContainerUrlResolver("https://www.r11s-wu2.prague.office-int.com", hostToken);

    return getContainer(
        documentId,
        createNew,
        { url: `` },
        urlResolver,
        documentServiceFactory,
        containerRuntimeFactory,
    );
}
