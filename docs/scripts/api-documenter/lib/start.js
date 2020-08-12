"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const os = require("os");
const colors = require("colors");
const node_core_library_1 = require("@rushstack/node-core-library");
const ApiDocumenterCommandLine_1 = require("./cli/ApiDocumenterCommandLine");
const myPackageVersion = node_core_library_1.PackageJsonLookup.loadOwnPackageJson(__dirname).version;
console.log(os.EOL +
    colors.bold(`api-documenter ${myPackageVersion} ` + colors.cyan(' - https://api-extractor.com/') + os.EOL));
const parser = new ApiDocumenterCommandLine_1.ApiDocumenterCommandLine();
parser.execute().catch(console.error); // CommandLineParser.execute() should never reject the promise
//# sourceMappingURL=start.js.map