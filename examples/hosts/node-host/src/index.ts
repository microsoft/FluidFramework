/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as url from "url";
import { IFluidCodeDetails, IProxyLoaderFactory } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { IUser } from "@fluidframework/protocol-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { ContainerUrlResolver } from "@fluidframework/routerlicious-host";
import * as jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { NodeCodeLoader } from "./nodeCodeloader";
import { fetchComponent, initializeChaincode } from "./component";

// Base service configuration.
const ordererEndpoint = "";
const storageEndpoint = "";
const tenantId = "";
const tenantKey = "";
const bearerSecret = "";

// Code package details.
const defaultPackage = "@fluid-example/key-value-cache@0.19.0-28557";
const installPath = "/tmp/components";
const timeoutMS = 60000;

// Document id (randomly chosen if not specified)
const docId = "";

// User information.
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const user = {
    id: "node-user",         // Required value
    name: "Node User",       // Optional value that we included
} as IUser;

export async function start(): Promise<void> {
    // TODO: Create a url resolver for node environment.
    // Generate access tokens.
    const documentId = docId.length === 0 ? uuid() : docId;
    const hostToken = jwt.sign(
        {
            user,
        },
        bearerSecret);
    const token = jwt.sign(
        {
            documentId,
            scopes: ["doc:read", "doc:write", "summary:write"],
            tenantId,
            user,
        },
        tenantKey);

    // Genearting Fluid urls.
    const encodedTenantId = encodeURIComponent(tenantId);
    const encodedDocId = encodeURIComponent(documentId);
    const documentUrl = `fluid://${url.parse(ordererEndpoint).host}/${encodedTenantId}/${encodedDocId}`;
    const deltaStorageUrl = `${ordererEndpoint}/deltas/${encodedTenantId}/${encodedDocId}`;
    const storageUrl = `${storageEndpoint}/repos/${encodedTenantId}`;

    // Crafting IFluidResolvedUrl with urls and access tokens.
    const resolved: IFluidResolvedUrl = {
        endpoints: {
            deltaStorageUrl,
            ordererUrl: ordererEndpoint,
            storageUrl,
        },
        tokens: { jwt: token },
        type: "fluid",
        url: documentUrl,
    };

    const resolver = new ContainerUrlResolver(
        ordererEndpoint,
        hostToken,
        new Map([[documentUrl, resolved]]));

    // A code loader that installs the code package in a specified location (installPath).
    // Once installed, the loader returns an entry point to Fluid Container to invoke the code.
    const nodeCodeLoader = new NodeCodeLoader(installPath, timeoutMS);

    // Construct the loader
    const loader = new Loader(
        resolver,
        new RouterliciousDocumentServiceFactory(),
        nodeCodeLoader,
        {},
        {},
        new Map<string, IProxyLoaderFactory>(),
    );

    // Resolving the URL to its underlying Fluid document.
    const fluidDocument = await loader.resolve({ url: documentUrl });

    // Fetches the underlying component.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    fetchComponent(loader, fluidDocument, documentUrl);

    // Proposes the code package for a new document.
    if (!fluidDocument.existing) {
        const details: IFluidCodeDetails = {
            config: {},
            package: defaultPackage,
        };

        await initializeChaincode(fluidDocument, details)
            .catch((error) => console.error("chaincode error", error));
    }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
start();
