/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import _ from "lodash";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { configurableUrlResolver } from "@fluidframework/driver-utils";
import { IClientConfig } from "@fluidframework/odsp-doclib-utils";
import { RouterliciousUrlResolver } from "@fluidframework/routerlicious-urlresolver";
import { IGitCache } from "@fluidframework/server-services-client";
import { Request } from "express";
import { Provider } from "nconf";
import dotenv from "dotenv";
import { IAlfred } from "./interfaces";
import { spoGetResolvedUrl } from "./odspUtils";

dotenv.config();

export interface FullTree {
    cache: IGitCache,
    code: IFluidCodeDetails | null,
}

export function resolveSpoUrl(
    config: Provider,
    tenantId: string,
    documentId: string,
    request: Request,
    driveId?: string,
): [Promise<IFluidResolvedUrl>, Promise<undefined | FullTree>] {
    const microsoftConfiguration = config.get("login:microsoft");
    const clientId = _.isEmpty(microsoftConfiguration.clientId)
        ? process.env.MICROSOFT_CONFIGURATION_CLIENT_ID : microsoftConfiguration.clientId;
    const clientSecret = _.isEmpty(microsoftConfiguration.secret)
        ? process.env.MICROSOFT_CONFIGURATION_CLIENT_SECRET : microsoftConfiguration.secret;
    if (clientId !== undefined && clientSecret !== undefined) {
        const clientConfig: IClientConfig = {
            clientId,
            clientSecret,
        };
        const resolvedP = spoGetResolvedUrl(tenantId, documentId,
            request.session?.tokens, clientConfig, driveId);
        const fullTreeP = Promise.resolve(undefined);
        return [resolvedP, fullTreeP];
    } else {
        throw new Error("Failed to find client ID and secret values");
    }
}

export function resolveR11sUrl(
    config: Provider,
    alfred: IAlfred,
    tenantId: string,
    documentId: string,
    accessToken: string,
    request: Request,
): [Promise<IFluidResolvedUrl>, Promise<undefined | FullTree>] {
    const endPointConfig: { provider: Provider, tenantId: string, documentId: string } = {
        provider: config,
        tenantId,
        documentId,
    };

    const resolverList = [
        new RouterliciousUrlResolver(endPointConfig, async () => Promise.resolve(accessToken))];
    const resolvedP = configurableUrlResolver(resolverList, request);
    const fullTreeP = alfred.getFullTree(tenantId, documentId);
    // RouterliciousUrlResolver only resolves as IFluidResolvedUrl
    return [resolvedP as Promise<IFluidResolvedUrl>, fullTreeP];
}
