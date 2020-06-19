import { EOL as newline } from "os";
import {
  Handler,
  readFile,
  writeFile,
  copyrightText,
} from "../common";

export const handler: Handler = {
    name: "html-copyright-file-header",
    match: /(^|\/)[^\/]+\.html$/i,
    handler: file => {
        const content = readFile(file);
        if (!/<!--[\s\S]*Copyright \(c\) Microsoft Corporation. All rights reserved./i.test(content) ||
            !/<!--[\s\S]*Licensed under the MIT License./i.test(content)) {
            return "Html file missing copyright header";
        }
    },
    resolver: file => {
        const prevContent = readFile(file);

        const newContent = '<!-- ' + copyrightText.replace(newline, ' -->' + newline + '<!-- ') + ' -->' + newline + newline + prevContent;

        writeFile(file, newContent);

        return { resolved: true };
    }
};
