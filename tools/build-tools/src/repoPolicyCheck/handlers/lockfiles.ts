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
            const results: string[] = [];
            const containsBadUrl = matches.some((value) => {
                if (value.startsWith(`https://registry.npmjs.org`)) {
                    return false;
                }
                results.push(value)
                return true;
            });
            if (containsBadUrl) {
                return `A private registry URL is in lock file: ${file}:\n${results.join("\n")}`;
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
