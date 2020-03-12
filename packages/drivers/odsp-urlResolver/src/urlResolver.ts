/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IResolvedUrl, IUrlResolver } from "@microsoft/fluid-driver-definitions";
import { createOdspUrl, OdspDriverUrlResolver, isSpoUrl, isOdcUrl, getOdspUrlParts } from "@microsoft/fluid-odsp-driver";

export class OdspUrlResolver implements IUrlResolver {

    public async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
        if (isOdspUrl(request.url)) {
            const reqUrl = new URL(request.url);
            const contents = getOdspUrlParts(reqUrl);
            if (!contents) {
                return undefined;
            }
            const urlToBeResolved = createOdspUrl(contents.site, contents.drive, contents.item, "");
            const odspDriverUrlResolver: IUrlResolver = new OdspDriverUrlResolver();
            return odspDriverUrlResolver.resolve({ url: urlToBeResolved });
        }
        return undefined;
    }
}

export function isOdspUrl(url: string) {
    return isSpoUrl(url) || isOdcUrl(url);
}
