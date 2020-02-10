/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable prefer-template */
import * as url from "url";
import { BaseHost, IBaseHostConfig } from "@microsoft/fluid-base-host";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import { IFluidResolvedUrl } from "@microsoft/fluid-driver-definitions";
import { ContainerUrlResolver } from "@microsoft/fluid-routerlicious-host";
import { RouterliciousDocumentServiceFactory } from "@microsoft/fluid-routerlicious-driver";
import * as jwt from "jsonwebtoken";
import { Provider } from "nconf";
import * as uuid from "uuid/v4";
import * as winston from "winston";

interface ILoadParams {
    jwtKey: string;
    orderer: string;
    secret: string;
    storage: string;
    tenant: string;
    user: string;
    waitMSec: number;
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

async function runInternal(loader: Loader, docUrl: string): Promise<void> {
    winston.info(`Resolving ${docUrl}`);
    const container = await loader.resolve({ url: docUrl });
    winston.info(`Resolved ${docUrl}`);
    await waitForFullConnection(container);
    winston.info(`Fully connected to ${docUrl}`);
}

async function run(loader: Loader, docUrl: string, timeoutMS: number) {
    return new Promise<void>((resolve, reject) => {
        const waitTimer = setTimeout(() => {
            clearTimeout(waitTimer);
            reject(`Timeout (${timeoutMS} ms) expired while loading ${docUrl}`);
        }, timeoutMS);

        runInternal(loader, docUrl).then(() => {
            clearTimeout(waitTimer);
            resolve();
        }, (err) => {
            clearTimeout(waitTimer);
            reject(err);
        });
    });
}

export async function testFluidService(config: Provider): Promise<void> {
    const params = config.get("loader") as ILoadParams;
    const documentId = uuid();
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
            user: {id: "node-chatter"},
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

    const hostConfig: IBaseHostConfig = {
        documentServiceFactory: new RouterliciousDocumentServiceFactory(),
        urlResolver: resolver,
        config,
        scope: null,
        proxyLoaderFactories: new Map<string, any>(),
    };

    const baseHost = new BaseHost(hostConfig, resolved, null, []);

    const loader = await baseHost.getLoader();

    return run(loader, documentUrl, params.waitMSec);
}
