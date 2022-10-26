/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Handler, readFile } from "../common";

const lockFilePattern = /.*?package-lock\.json$/i;
const urlPattern = /(https?[^"@]+)(\/@.+|\/[^/]+\/-\/.+tgz)/g;
const versionPattern = /"lockfileVersion"\s*:\s*\b1\b/g;

export const handlers: Handler[] = [
    {
        name: "package-lockfiles-no-private-url",
        match: lockFilePattern,
        handler: (file) => {
            const content = readFile(file);
            const matches = content.match(urlPattern);
            if (matches !== null) {
                const results: string[] = [];
                const containsBadUrl = matches.some((value) => {
                    const url = new URL(value);
                    if (url.protocol === `https:` && url.hostname === `registry.npmjs.org`) {
                        return false;
                    }
                    results.push(value);
                    return true;
                });
                if (containsBadUrl) {
                    return `A private registry URL is in lock file: ${file}:\n${results.join(
                        "\n",
                    )}`;
                }
            }
            return;
        },
    },
    {
        name: "package-lockfiles-npm-version",
        match: lockFilePattern,
        handler: (file) => {
            const content = readFile(file);
            const match = content.match(versionPattern);
            if (match === null) {
                return `Unexpected 'lockFileVersion' (Please use NPM v6: 'npm i -g npm@latest-6'): ${file}`;
            }
            return;
        },
    },
];
