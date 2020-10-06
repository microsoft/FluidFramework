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
import { fetchFluidObject, initializeChaincode } from "./utils";
import { AzureBlobStorage } from "./storageAccount";

// Base service configuration.
const ordererEndpoint = "https://alfred.frs.office-int.com";;
const storageEndpoint = "https://historian.frs.office-int.com";
const tenantId = "shadowkicker-watcher";
const tenantKey = "8a194e2ea505f2cb9bf71d976b27adeb";
const bearerSecret = "VBQyoGpEYrTn3XQPtXW3K8fFDd";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Code package details.
const defaultPackage = "@fluid-example/prosemirror@0.28.0";
const installPath = "/tmp/fluid-objects";
const timeoutMS = 60000;

// Document id (randomly chosen if not specified)
const docId = "gravelburn_hand";

// User information.
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const user = {
    id: "16d97a2b-b1e7-4ddf-a203-0d0ccf040b84",
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

    // Fetches the underlying Fluid object.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    fetchFluidObject(loader, fluidDocument, documentUrl);

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


export async function storageAccount() {
    const azureStorage = new AzureBlobStorage("DefaultEndpointsProtocol=https;AccountName=prosemirror;AccountKey=5LkbRyZcII5Tq6r2sjCB95vNbFOswTlJ8ZvmN5HJtEmPusAG4e8SfpWit0npF25/bT9SLZKrKT1Xq/DC/GSRRg==;EndpointSuffix=core.windows.net")
    const data = await azureStorage.getSnapShotListForBlobName("samples", "sampletext.txt");

    console.log(data);
    const snapshotdata = await azureStorage.getSnapShotContent("samples", "sampletext.txt", "2020-10-05T10:00:45.1137620Z")
    console.log(snapshotdata);
}
// storageAccount();
start();