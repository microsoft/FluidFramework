/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IHost } from "./host";
import { PostMessageHost } from "./post-message-host";
import { PostMessageHostServer } from "./post-message-host-server";

export * from "./interfaces";
export { PostMessageHostServer };

function detectHost(): IHost {
    if (window !== top) {
        let host = new PostMessageHost(window);
        host.start();

        return host;
    }

    // No host available
    return null;
}

export let pnhost = detectHost();
