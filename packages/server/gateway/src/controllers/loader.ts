/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { start } from "@prague/base-host";
import {
    IResolvedUrl,
} from "@prague/container-definitions";
import { IResolvedPackage } from "@prague/loader-web";
import { IGitCache } from "@prague/services-client";

export function initialize(
    url: string,
    resolved: IResolvedUrl,
    cache: IGitCache,
    pkg: IResolvedPackage,
    scriptIds: string[],
    npm: string,
    jwt: string,
) {
    console.log(`Loading ${url}`);
    const startP = start(
        url,
        resolved,
        cache,
        pkg,
        scriptIds,
        npm,
        jwt);
    startP.catch((err) => console.error(err));
}
