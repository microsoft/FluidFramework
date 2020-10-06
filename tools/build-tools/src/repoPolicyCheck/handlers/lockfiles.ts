/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import shell from "shelljs";
import {
    Handler,
    readFile
} from "../common";

const urlPattern = /(https?[^"@]+)(\/@.+|\/[^/]+\/-\/.+tgz)/g;

export const handler: Handler = {
    name: "package-lockfiles",
    match: /^.*?package-lock\.json$/i,
    handler: file => {
        let content = readFile(file);
        const matches = content.match(urlPattern);
        if (matches !== null) {
            const containsBadUrl = matches.some((value) => {
                return !value.startsWith(`https://registry.npmjs.org`);
            });
            if (containsBadUrl) {
                return `A private registry URL is in lock file: ${file}`;
            }
        }
        return;
    },
    resolver: file => {
        const command = `package-lock-sanitizer -l ${file}`;
        if (shell.exec(command).code !== 0) {
            return { resolved: false, message: "Error: package-lock sanitize" };
        }
        return { resolved: true };
    }
};
