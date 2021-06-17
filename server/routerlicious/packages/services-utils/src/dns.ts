/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as dns from "dns";
import * as os from "os";
import * as util from "util";

export async function getHostIp(): Promise<string> {
    const hostname = os.hostname();
    const lookup = util.promisify(dns.lookup);
    const info = await lookup(hostname);
    return info.address;
}
