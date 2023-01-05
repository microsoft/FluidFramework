/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Handler, readFile, writeFile } from "../common";

export const handler: Handler = {
    name: "fluid-case",
    match: /(^|\/)[^/]+\.([tj]s?|html|md|json)$/i,
    handler: (file) => {
        const content = readFile(file);
        // search for Fluid Framework
        if (content.search(/[Ff]luid framework/) !== -1) {
            return `'framework' need to be capitalized in prose`;
        }
        // search for the work 'fluid' surround by other words
        if (content.search(/[a-z] fluid [a-z]/) !== -1) {
            return `'fluid' needs to be capitalized in prose`;
        }
    },
    resolver: (file) => {
        const content = readFile(file);
        const newContent = content.replace(/([a-z]) fluid ([a-z])/g, "$1 Fluid $2");
        writeFile(file, newContent.replace(/[Ff]luid framework/g, "Fluid Framework"));
        return { resolved: true };
    },
};
