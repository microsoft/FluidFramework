/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

#!/usr/bin/env node
var program = require('commander');

program
    .version('0.0.1')
    .option('-l --loader <value>', 'Whats the url of the loader you want to use? (e.g. https://www.wu2.prague.office-int.com/loader/', 'https://www.wu2.prague.office-int.com/loader/')
    .option('-t --tenant <value>', 'What tenant do you want to use?', "prague")
    .option('-c --chaincode [value]', 'Which chaincode? e.g. @chaincode/counter@0.2.3')
    .option('-p --pathToPackage [value]', 'If you want to just reference your package.json, put the path here (we guess the path as default)', "../../../package.json")
    .parse(process.argv);

const pkg = require(program.pathToPackage);

let chaincode;
if (program.chaincode) {
    chaincode = program.chaincode;
} else if (program.pathToPackage) {
    chaincode = pkg.name + "@" + pkg.version;
}

const date = new Date();
const url = `${program.loader}${program.tenant}/ChangeThisValue-${date.getTime()}?chaincode=${chaincode}`;
console.log("View your chaincode at:");
console.log('\x1b[36m%s\x1b[0m', url);