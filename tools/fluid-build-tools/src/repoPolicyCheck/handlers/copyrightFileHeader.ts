import { EOL as newline } from "os";
import {
  Handler,
  readFile,
  writeFile,
  copyrightText,
} from "../common";

export const handlers: Handler[] = [
    {
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
    },
    {
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
    },
    {
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
    },
];
