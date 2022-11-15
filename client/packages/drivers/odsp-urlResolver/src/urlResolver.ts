/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";
import {
    createOdspUrl,
    OdspDriverUrlResolver,
    isSpoUrl,
    isOdcUrl,
    getOdspUrlParts,
} from "@fluidframework/odsp-driver";

export class OdspUrlResolver implements IUrlResolver {
    public async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
        if (isOdspUrl(request.url)) {
            const reqUrl = new URL(request.url);
            const contents = await getOdspUrlParts(reqUrl);
            if (!contents) {
                return undefined;
            }
            const urlToBeResolved = createOdspUrl({ ...contents, dataStorePath: "" });
            const odspDriverUrlResolver: IUrlResolver = new OdspDriverUrlResolver();
            return odspDriverUrlResolver.resolve({ url: urlToBeResolved, headers: request.headers });
        }
        return undefined;
    }

    public async getAbsoluteUrl(
        resolvedUrl: IResolvedUrl,
        relativeUrl: string,
    ): Promise<string> {
        throw new Error("Not implemented");
    }
}

export const isOdspUrl = (url: string) => {
    return isSpoUrl(url) || isOdcUrl(url);
};
