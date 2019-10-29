/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const execSync = require('child_process').execSync;
const path = require('path');

console.log(`args before: ${process.argv}`);
const args = process.argv.splice(2, process.argv.length - 2);
console.log(`args after: ${args}`);

let scriptPath = args.splice(args.length - 1, 1);
scriptPath = scriptPath[0];
console.log(`scriptPath: ${scriptPath}`);
const src = path.join(__dirname, scriptPath);
const cmd = `lerna exec ${args.join(" ")} -- node ${src}`;
console.log(`cmd: ${cmd}`);
execSync(cmd, { stdio: [0, 1, 2] });
