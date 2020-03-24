/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require('fs');
const readline = require('readline');
const newline = require('os').EOL;
const program = require('commander');
const exclusions = require('./exclusions.json').map(e => new RegExp(e, "i"));
const sortPackageJson = require('sort-package-json');

/**
 * argument parsing
 */
program
    .option('-q|--quiet', 'Quiet mode')
    .option('-r|--resolve', 'Resolve errors if possible')
    .option('-h|--handler <regex>', 'Filter handler names by <regex>')
    .option('-p|--path <regex>', 'Filter file paths by <regex>')
    .parse(process.argv);

const handlerRegex = (program.handler ? new RegExp(program.handler, 'i') : /.?/);
const pathRegex = (program.path ? new RegExp(program.path, 'i') : /.?/);

function writeOutLine(output) {
    if (!program.quiet) {
        console.log(output);
    }
}

if (program.resolve) {
    writeOutLine('Resolving errors if possible.');
}

if (program.handler) {
    writeOutLine(`Filtering handlers by regex: ${handlerRegex}`);
}

if (program.path) {
    writeOutLine(`Filtering file paths by regex: ${pathRegex}`);
}

/**
 * helper functions and constants
 */
const copyrightText = "Copyright (c) Microsoft Corporation. All rights reserved." + newline + "Licensed under the MIT License.";
const licenseId = 'MIT';
const author = 'Microsoft';
const serverDockerfilePath = "server/routerlicious/r11s-Dockerfile";
function getDockerfileCopyText(packageFilePath) {
    const packageDir = packageFilePath.split("/").slice(0, -1).join("/");
    return `COPY ${packageDir}/package*.json ${packageDir}/`;
}

function readFile(file) {
    return fs.readFileSync(file, { encoding: "utf8" });
}

function writeFile(file, data) {
    fs.writeFileSync(file, data, { encoding: "utf8" });
}

const localMap = new Map();
function getOrAddLocalMap(key, getter) {
    if (!localMap.has(key)) {
        localMap.set(key, getter());
    }
    return localMap.get(key);
}

/**
 * declared file handlers
 * each handler has a name for filtering and a match regex for matching which files it should resolve
 * the handler function returns an error message or undefined/null for success
 * the resolver function (optional) can attempt to resolve the failed validation
 */
const handlers = [
    {
        name: "html-copyright-file-header",
        match: /(^|\/)[^\/]+\.html$/i,
        handler: file => {
            if (!/<!--.*Copyright/i.test(readFile(file))) {
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
            if (!/#.*Copyright/i.test(readFile(file))) {
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
            if (!/(\/\/.*Copyright|\/\*[\s\S]*Copyright[\s\S]*\*\/)/i.test(readFile(file))) {
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
    {
        name: "dockerfile-packages",
        match: /^(server\/routerlicious\/packages)\/.*\/package\.json/i,
        handler: file => {
            const dockerfileCopyText = getDockerfileCopyText(file);

            const dockerfileContents = getOrAddLocalMap(
                "dockerfileContents",
                () => fs.readFileSync(serverDockerfilePath),
            );

            if (dockerfileContents.indexOf(dockerfileCopyText) === -1) {
                return "Routerlicious Dockerfile missing COPY command for this package";
            }
        },
        resolver: file => {
            const dockerfileCopyText = getDockerfileCopyText(file);

            // add to Dockerfile
            let dockerfileContents = readFile(serverDockerfilePath);

            if (dockerfileContents.indexOf(dockerfileCopyText) === -1) {
                // regex basically find the last of 3 or more consecutive COPY package lines
                const endOfCopyLinesRegex = /(COPY\s+server\/routerlicious\/packages\/.*\/package\*\.json\s+server\/routerlicious\/packages\/.*\/\s*\n){3,}[^\S\r]*(?<newline>\r?\n)+/gi;
                const regexMatch = endOfCopyLinesRegex.exec(dockerfileContents);
                const localNewline = regexMatch.groups.newline;
                let insertIndex = regexMatch.index + regexMatch[0].length - localNewline.length;

                dockerfileContents = dockerfileContents.substring(0, insertIndex)
                    + dockerfileCopyText + localNewline
                    + dockerfileContents.substring(insertIndex, dockerfileContents.length);

                writeFile(serverDockerfilePath, dockerfileContents);
            }

            return { resolved: true };
        }
    }
];

// route files to their handlers by regex testing their full paths
// synchronize output, exit code, and resolve decision for all handlers
function routeToHandlers(file) {
    handlers.filter(handler => handler.match.test(file) && handlerRegex.test(handler.name)).map(handler => {
        const result = handler.handler(file);
        if (result) {
            let output = newline + 'file failed policy check: ' + file + newline + result;

            if (program.resolve && handler.resolver) {
                output += newline + 'attempting to resolve: ' + file;
                const resolveResult = handler.resolver(file);

                if (resolveResult.message) {
                    output += newline + resolveResult.message;
                }

                if (!resolveResult.resolved) {
                    process.exitCode = 1;
                }
            } else {
                process.exitCode = 1;
            }
            writeOutLine(output);
        }
    });
}

// prepare to read standard input line by line
process.stdin.setEncoding('utf8');
let lineReader = readline.createInterface({
    input: process.stdin,
    terminal: false
});

lineReader.on('line', line => {
    if (pathRegex.test(line) && exclusions.every(value => !value.test(line)) && fs.existsSync(line)) {
        routeToHandlers(line.trim());
    }
});
