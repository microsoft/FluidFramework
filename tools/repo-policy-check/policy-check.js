/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require('fs');
const readline = require('readline');
const newline = require('os').EOL;
const program = require('commander');
const exclusions = require('./exclusions.json').map(e => new RegExp(e, "i"));

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

// promise wrappers over existing file IO callback methods
async function readFile(file) {
    return new Promise((resolve, reject) => {
        fs.readFile(file, 'utf8', (err, data) => {
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
            const separator = prevContent.startsWith('\r') || prevContent.startsWith('\n') ? newline : newline + newline;
            const newContent = '/*!' + newline + ' * ' + copyrightText.replace(newline, newline + ' * ') + newline + ' */' + separator + prevContent;

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
    handlers.filter(handler => handler.match.test(file) && handlerRegex.test(handler.name)).map(async handler => {
        const result = await handler.handler(file);
        if (result) {
            let output = newline + 'file failed policy check: ' + file + newline + result;

            if (program.resolve && handler.resolver) {
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
    if (pathRegex.test(line) && exclusions.every(value => !value.test(line)) && fs.existsSync(line)) {
        routeToHandlers(line.trim());
    }
});
