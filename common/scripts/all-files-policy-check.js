/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require('fs');
const readline = require('readline');
const newline = require('os').EOL;

/**
 * argument parsing
 * could use commander if this gets too complicated
 */
// parse quiet arg
const quiet = process.argv.some(arg => arg == '--quiet' || arg == '-q');
function writeOutLine(output) {
    if (!quiet) {
        console.log(output);
    }
}

// parse resolve arg
const shouldResolve = process.argv.some(arg => arg == '--resolve');
if (shouldResolve) {
    writeOutLine('Resolving errors if possible.');
}

// parse handler name regex arg
const nameArg = process.argv.find(arg => /^-(-name|n)[:=]./.test(arg));
const nameRegex = nameArg ? new RegExp(nameArg.substring(nameArg.match(/[:=]/).index + 1), 'i') : /.?/; // match all by default
if (nameArg) {
    writeOutLine("Filtering handlers by regex: " + nameRegex);
}

// parse file filter (path) regex arg
const pathArg = process.argv.find(arg => /^-(-path|p)[:=]./.test(arg));
const pathRegex = pathArg ? new RegExp(pathArg.substring(pathArg.match(/[:=]/).index + 1), 'i') : /.?/; // match all by default
if (pathArg) {
    writeOutLine("Filtering file paths by regex: " + pathRegex);
}

/**
 * helper functions and constants
 */
const copyrightText = "Copyright (c) Microsoft Corporation. All rights reserved." + newline + "Licensed under the MIT License.";
const licenseId = 'MIT';
const author = 'Microsoft';

// promise wrappers over existing file IO callback methods
async function readFile(file) {
    return new Promise((resolve, reject) => {
        fs.readFile(file, (err, data) => {
            if (err) throw err;
            resolve(data);
        });
    })
}

async function writeFile(file, data) {
    return new Promise((resolve, reject) => {
        fs.writeFile(file, data, err => {
            if (err) throw err;
            resolve();
        });
    });
}

/**
 * declared file handlers
 * each handler has a name for filtering and a match regex for matching which files it should resolve
 * the handler function returns an error message or undefined/null for success
 * the resolver function (optional) can attempt to resolve the failed validation
 */
const handlers = [
    {
        name: "dockerfile-copyright-file-header",
        match: /(^|\/)Dockerfile$/i,
        handler: async file => {
            if (!/#.*Copyright/i.test(await readFile(file))) {
                return 'Dockerfile missing copyright header';
            }
        },
        resolver: async file => {
            const prevContent = await readFile(file);

            // prepend copyright header to existing content
            const newContent = '# ' + copyrightText.replace(newline, newline + '# ') + newline + newline + prevContent;

            await writeFile(file, newContent);

            return { resolved: true };
        }
    },
    {
        name: "js-ts-copyright-file-header",
        match: /(^|\/)[^\/]+\.[jt]sx?$/i,
        handler: async file => {
            if (!/(\/\/.*Copyright|\/\*[\s\S]*Copyright[\s\S]*\*\/)/i.test(await readFile(file))) {
                return 'JavaScript/TypeScript file missing copyright header';
            }
        },
        resolver: async file => {
            const prevContent = await readFile(file);

            // prepend copyright header to existing content
            const newContent = '/*!' + newline + ' * ' + copyrightText.replace(newline, newline + ' * ') + newline + ' */' + newline + newline + prevContent;

            await writeFile(file, newContent);

            return { resolved: true };
        }
    },
    {
        name: "npm-package-author-license",
        match: /(^|\/)package\.json/i,
        handler: async file => {
            const json = JSON.parse(await readFile(file));
            let ret = [];

            if (json.author !== author) {
                ret.push(`${author} author entry`);
            }

            if (json.license !== licenseId) {
                ret.push(`${licenseId} license entry`);
            }

            if (ret.length > 0) {
                return 'Package missing ' + ret.join(' and ');
            }
        },
        resolver: async file => {
            let json = JSON.parse(await readFile(file));
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

            await writeFile(file, JSON.stringify(json, undefined, 2) + newline);

            return { resolved: resolved };
        }
    }
];

// route files to their handlers by regex testing their full paths
// synchronize output, exit code, and resolve decision for all handlers
async function routeToHandlers(file) {
    handlers.filter(handler => handler.match.test(file) && nameRegex.test(handler.name)).map(async handler => {
        const result = await handler.handler(file);
        if (result) {
            let output = newline + 'file failed policy check: ' + file + newline + result;

            if (shouldResolve && handler.resolver) {
                output += newline + 'attempting to resolve: ' + file;
                const resolveResult = await handler.resolver(file);

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
    if (pathRegex.test(line)) {
        routeToHandlers(line.trim());
    }
});
