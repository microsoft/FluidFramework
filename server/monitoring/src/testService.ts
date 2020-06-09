/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable prefer-template */
import * as url from "url";
import { IFluidCodeDetails, IProxyLoaderFactory } from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { ContainerUrlResolver } from "@fluidframework/routerlicious-host";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { NodeCodeLoader, NodeWhiteList } from "@fluidframework/server-services";
import * as jwt from "jsonwebtoken";
import { Provider } from "nconf";
import { v4 as uuid } from "uuid";
import * as winston from "winston";

interface ILoadParams {
    jwtKey: string;
    orderer: string;
    secret: string;
    storage: string;
    tenant: string;
    user: string;
    waitMSec: number;
    docId: string;
    component: {
        load: boolean,
        packageName: string,
        installPath: string,
        timeoutMS: number,
    }
}

// Wait for the container to get fully connected.
async function waitForFullConnection(container: Container): Promise<void> {
    if (container.connected) {
        return;
    } else {
        return new Promise<void>((resolve, reject) => {
            container.once("connected", () => {
                resolve();
            });
        });
    }
}

// Initializes the component.
async function initializeChaincode(container: Container, pkg?: IFluidCodeDetails): Promise<void> {
    if (pkg === undefined) {
        return;
    }

    const quorum = container.getQuorum();
    if (!container.connected) {
        await new Promise<void>((resolve) => container.on("connected", () => resolve()));
    }
    if (!quorum.has("code")) {
        await quorum.propose("code", pkg);
    }
}

async function runInternal(loader: Loader, docUrl: string, params: ILoadParams): Promise<void> {
    winston.info(`Resolving ${docUrl}`);
    const container = await loader.resolve({ url: docUrl });
    winston.info(`Resolved ${docUrl}`);
    await waitForFullConnection(container);
    winston.info(`Fully connected to ${docUrl}`);
    if (params.component.load) {
        const codePackage: IFluidCodeDetails = {
            config: undefined,
            package: params.component.packageName,
        };
        await initializeChaincode(container, codePackage);
        winston.info(`Proposed code`);
    }
}

const run = async (loader: Loader, docUrl: string, params: ILoadParams) => {
    return new Promise<void>((resolve, reject) => {
        const waitTimer = setTimeout(() => {
            clearTimeout(waitTimer);
            reject(`Timeout (${params.waitMSec} ms) expired while loading ${docUrl}`);
        }, params.waitMSec);

        runInternal(loader, docUrl, params).then(() => {
            clearTimeout(waitTimer);
            resolve();
        }, (err) => {
            clearTimeout(waitTimer);
            reject(err);
        });
    });
};

export async function testFluidService(config: Provider): Promise<void> {
    const params = config.get("loader") as ILoadParams;
    const documentId = (params.docId !== undefined && params.docId.length > 0) ? params.docId : uuid();
    const hostToken = jwt.sign(
        {
            user: params.user,
        },
        params.jwtKey);
    const token = jwt.sign(
        {
            documentId,
            scopes: ["doc:read", "doc:write", "summary:write"],
            tenantId: params.tenant,
            user: { id: "node-user" },
        },
        params.secret);

    const documentUrl = `fluid://${url.parse(params.orderer).host}` +
        `/${encodeURIComponent(params.tenant)}` +
        `/${encodeURIComponent(documentId)}`;

    const deltaStorageUrl = params.orderer +
        `/deltas/${encodeURIComponent(params.tenant)}/${encodeURIComponent(documentId)}`;

    const storageUrl =
        params.storage +
        "/repos" +
        `/${encodeURIComponent(params.tenant)}`;

    const resolved: IFluidResolvedUrl = {
        endpoints: {
            deltaStorageUrl,
            ordererUrl: params.orderer,
            storageUrl,
        },
        tokens: { jwt: token },
        type: "fluid",
        url: documentUrl,
    };

    const resolver = new ContainerUrlResolver(
        params.orderer,
        hostToken,
        new Map([[documentUrl, resolved]]));

    const loader = new Loader(
        resolver,
        new RouterliciousDocumentServiceFactory(),
        new NodeCodeLoader(
            params.component.installPath,
            params.component.timeoutMS,
            new NodeWhiteList()),
        config,
        {},
        new Map<string, IProxyLoaderFactory>(),
    );

    return run(loader, documentUrl, params);
}
