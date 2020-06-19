import { EOL as newline } from "os";
import {
  Handler,
  readFile,
  writeFile,
  copyrightText,
} from "../common";

export const handler: Handler = {
    name: "dockerfile-copyright-file-header",
    match: /(^|\/)Dockerfile$/i,
    handler: file => {
        const content = readFile(file);
        if (!/#[\s\S]*Copyright \(c\) Microsoft Corporation. All rights reserved./i.test(content) ||
            !/#[\s\S]*Licensed under the MIT License./i.test(content)) {
            return 'Dockerfile missing copyright header';
        }
    },
    resolver: file => {
        const prevContent = readFile(file);

        // prepend copyright header to existing content
        const newContent = '# ' + copyrightText.replace(newline, newline + '# ') + newline + newline + prevContent;

        writeFile(file, newContent);

        return { resolved: true };
    }
};
