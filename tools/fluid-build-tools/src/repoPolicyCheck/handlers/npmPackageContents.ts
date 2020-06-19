import { EOL as newline } from "os";
import sortPackageJson from "sort-package-json";
import {
  Handler,
  readFile,
  writeFile,
  licenseId,
  author,
} from "../common";

export const handlers: Handler[] = [
    {
        name: "npm-package-author-license-sort",
        match: /(^|\/)package\.json/i,
        handler: file => {
            let json;
            try {
                json = JSON.parse(readFile(file));
            } catch (err) {
                return 'Error parsing JSON file: ' + file;
            }

            const missing = [];

            if (json.author !== author) {
                missing.push(`${author} author entry`);
            }

            if (json.license !== licenseId) {
                missing.push(`${licenseId} license entry`);
            }

            const ret = [];
            if (missing.length > 0) {
                ret.push(`missing ${missing.join(' and ')}`);
            }

            if (JSON.stringify(sortPackageJson(json)) != JSON.stringify(json)) {
                ret.push(`not sorted`);
            }

            if (ret.length > 0) {
                return `Package.json ${ret.join(', ')}`;
            }
        },
        resolver: file => {
            let json;
            try {
                json = JSON.parse(readFile(file));
            } catch (err) {
                return { resolved: false, message: 'Error parsing JSON file: ' + file };
            }

            let resolved = true;

            if (!json.author) {
                json.author = author;
            } else if (json.author !== author) {
                resolved = false;
            }

            if (!json.license) {
                json.license = licenseId;
            } else if (json.license !== licenseId) {
                resolved = false;
            }

            writeFile(file, JSON.stringify(sortPackageJson(json), undefined, 2) + newline);

            return { resolved: resolved };
        }
    },
];
