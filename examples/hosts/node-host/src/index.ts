/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as url from "url";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { ITokenClaims, IUser } from "@fluidframework/protocol-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { ContainerUrlResolver } from "@fluidframework/routerlicious-host";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils";
import * as jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { NodeCodeLoader } from "./nodeCodeloader";
import { fetchFluidObject } from "./utils";

// Base service configuration.
const ordererEndpoint = "http://localhost:7070";
const storageEndpoint = "http://localhost:7070";
const tenantId = "tinylicious";
// Tinylicious doesn't care about tenantKey and bearerSecret
const tenantKey = "12345";
const bearerSecret = "12345";
// Code package details.
const defaultPackage = "@fluid-example/key-value-cache@0.49.0";
const installPath = "/tmp/fluid-objects";
const timeoutMS = 120000;

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
    const createNew = docId.length === 0;
    const documentId = docId.length === 0 ? uuid() : docId;
    const hostToken = jwt.sign(
        {
            user,
        },
        bearerSecret);
    const claims: ITokenClaims = {
        documentId,
        scopes: ["doc:read", "doc:write", "summary:write"],
        tenantId,
        user,
        iat: Math.round(new Date().getTime() / 1000),
        exp: Math.round(new Date().getTime() / 1000) + 60 * 60, // 1 hour expiration
        ver: "1.0",
    };
    const token = jwt.sign(claims, tenantKey);

    // Generating Fluid urls.
    const encodedTenantId = encodeURIComponent(tenantId);
    const encodedDocId = encodeURIComponent(documentId);
    const documentUrl = `fluid://${url.parse(ordererEndpoint).host}/${encodedTenantId}/${encodedDocId}`;
    const deltaStorageUrl = `${ordererEndpoint}/deltas/${encodedTenantId}/${encodedDocId}`;
    const storageUrl = `${storageEndpoint}/repos/${encodedTenantId}`;
    const requestUrl = `http://${url.parse(ordererEndpoint).host}/${encodedTenantId}/${encodedDocId}`;

    // Crafting IFluidResolvedUrl with urls and access tokens.
    const resolved: IFluidResolvedUrl = {
        endpoints: {
            deltaStorageUrl,
            ordererUrl: ordererEndpoint,
            storageUrl,
        },
        id: documentId,
        tokens: { jwt: token },
        type: "fluid",
        url: documentUrl,
    };

    const urlResolver = new ContainerUrlResolver(
        ordererEndpoint,
        hostToken,
        new Map([[requestUrl, resolved]]));

    // A code loader that installs the code package in a specified location (installPath).
    // Once installed, the loader returns an entry point to Fluid Container to invoke the code.
    const codeLoader = new NodeCodeLoader(installPath, timeoutMS);

    const tokenProvider = new InsecureTokenProvider(tenantKey, user);

    // Construct the loader
    const loader = new Loader({
        urlResolver,
        documentServiceFactory: new RouterliciousDocumentServiceFactory(tokenProvider),
        codeLoader,
    });

    const details: IFluidCodeDetails = {
        config: {},
        package: defaultPackage,
    };
    // Resolving the URL to its underlying Fluid document.
    let container;
    if (createNew) {
        container = await loader.createDetachedContainer(details);
        await container.attach({ url: requestUrl });
    } else {
        container = await loader.resolve({ url: requestUrl });
    }

    // Fetches the underlying Fluid object.
    await fetchFluidObject(loader, container, requestUrl);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
start();
