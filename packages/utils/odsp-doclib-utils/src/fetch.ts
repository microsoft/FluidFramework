/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    default as nodeFetch,
    RequestInfo as FetchRequestInfo,
    RequestInit as FetchRequestInit,
} from "node-fetch";

// The only purpose of this helper is to work around the slight misalignments between the
// Browser's fetch API and the 'node-fetch' package.
//
// Originally, our code simply omitted the '@types/node-fetch' dependency and let TypeScript
// use the 'fetch' declarations in 'DOM.lib.ts'.  This works until some other package introduces
// a dependency on '@types/node-fetch' and Lerna hoists '@types/node-fetch' to the root /node_modules/.
export const fetch = async (request: RequestInfo, config?: RequestInit): Promise<Response> =>
    nodeFetch(request as FetchRequestInfo, config as FetchRequestInit) as unknown as Response;
