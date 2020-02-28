/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";

export interface IParsedUrl {
    id: string;
    path: string;
    /**
     * Null means do not use snapshots, undefined means load latest snapshot
     * otherwise it's version ID passed to IDocumentStorageService.getVersions() to figure out what snapshot to use.
     * If needed, can add undefined which is treated by Container.load() as load latest snapshot.
     */
    version: string | null | undefined;
}

export function parseUrl(url: string): IParsedUrl | null {
    const parsed = parse(url, true);

    const regex = /^\/([^/]*\/[^/]*)(\/?.*)$/;
    const match = regex.exec(parsed.pathname!);

    return (match && match.length === 3)
        ? { id: match[1], path: match[2], version: parsed.query.version as string }
        : null;
}
