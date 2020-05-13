/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import dns from "dns";
import os from "os";
import util from "util";

export async function getHostIp(): Promise<string> {
    const hostname = os.hostname();
    const lookup = util.promisify(dns.lookup);
    const info = await lookup(hostname);
    return info.address;
}
