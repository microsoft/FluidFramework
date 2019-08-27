/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { start } from "@prague/base-host";
import { IComponent } from "@prague/component-core-interfaces";
import { IResolvedPackage } from "@prague/loader-web";
import { IResolvedUrl } from "@prague/protocol-definitions";
import { IGitCache } from "@prague/services-client";

export function initialize(
    url: string,
    resolved: IResolvedUrl,
    cache: IGitCache,
    pkg: IResolvedPackage,
    scriptIds: string[],
    npm: string,
    jwt: string,
    config: any,
    scope: IComponent,
) {
    console.log(`Loading ${url}`);
    const startP = start(
        url,
        resolved,
        cache,
        pkg,
        scriptIds,
        npm,
        jwt,
        config,
        scope,
        document.getElementById("content") as HTMLDivElement);
    startP.catch((err) => console.error(err));
}
