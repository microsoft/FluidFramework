/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export function convertUrls(host: string) {
    const ordererUrl = host ?? "";
    let historianUrl: string = "";
    if (ordererUrl.includes("alfred")) {
        historianUrl = ordererUrl.replace("alfred", "historian");
    } else if (ordererUrl.includes("local")) {
        historianUrl = "localhost:3001";
    }
    return [ordererUrl, historianUrl];
}
