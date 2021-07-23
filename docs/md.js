const markdownMagic = require("@tylerbu/markdown-magic");
const pathLib = require("path");
const process = require("process");

const config = require("./md-magic.config.js");

const getRepoRoot = () => {
    const root = pathLib.normalize(pathLib.join(__dirname, ".."));
    return root;
}

const pattern = "**/*.md";
process.chdir(getRepoRoot());
console.log(`Searching for markdown files in: ${process.cwd()}`);

markdownMagic(pattern, config);
