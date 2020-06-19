import { EOL as newline } from "os";
import {
  Handler,
  readFile,
  writeFile,
  copyrightText,
} from "../common";

export const handler: Handler = {
    name: "js-ts-copyright-file-header",
    match: /(^|\/)[^\/]+\.[jt]sx?$/i,
    handler: file => {
        const content = readFile(file);
        if (!/(\/\/|[\s\S]*\*)[\s\S]*Copyright \(c\) Microsoft Corporation. All rights reserved./i.test(content)
            || !/(\/\/|[\s\S]*\*)[\s\S]*Licensed under the MIT License./i.test(content)) {
            return 'JavaScript/TypeScript file missing copyright header';
        }
    },
    resolver: file => {
        const prevContent = readFile(file);

        // prepend copyright header to existing content
        const separator = prevContent.startsWith('\r') || prevContent.startsWith('\n') ? newline : newline + newline;
        const newContent = '/*!' + newline + ' * ' + copyrightText.replace(newline, newline + ' * ') + newline + ' */' + separator + prevContent;

        writeFile(file, newContent);

        return { resolved: true };
    }
};
