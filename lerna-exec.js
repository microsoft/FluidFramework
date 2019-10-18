const execSync = require('child_process').execSync;
const path = require('path');

console.log(`args: ${process.argv}`);

const args = process.argv.splice(2, process.argv.length - 2)
    .map(arg => arg.replace(/^--/, ''));

let scriptPath = args.splice(1, args.length - 1);
scriptPath = scriptPath[0];
console.log(`scriptPath: ${scriptPath}`);
const src = path.join(__dirname, scriptPath);
const cmd = `lerna exec --stream -- node ${src} ${args.join(" ")}`;
console.log(`cmd: ${cmd}`);
execSync(cmd, { stdio: [0, 1, 2] });
