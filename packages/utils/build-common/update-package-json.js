const copydir = require("copy-dir");
const deepmerge = require("deepmerge");
const fs = require("fs");
const path = require("path");
const spj = require("sort-package-json");

const add = {
    "scripts": {
        "eslint": "eslint --ext=ts,tsx --fix-dry-run src"
      },    
    "devDependencies": {
        "@microsoft/eslint-config-fluid": "^0.11.0",
        "@typescript-eslint/eslint-plugin": "^2.4.0",
        "@typescript-eslint/eslint-plugin-tslint": "^2.4.0",
        "@typescript-eslint/parser": "^2.4.0",
        "eslint": "^6.5.1",
    }
}

function updatePackageJson() {
    const pkg = JSON.parse(fs.readFileSync("package.json"));
    const merged = deepmerge(pkg, add);
    const mergedOutput = JSON.stringify(merged, null, 2) + "\n";
    const sortedOutput = spj.sortPackageJson(mergedOutput);
    // console.log(mergedOutput);
    fs.writeFileSync("package.json", sortedOutput);
}

function copyFiles() {
    const src = path.join(process.env.LERNA_ROOT_PATH, "packages/utils/build-common/templates");
    const dest = path.resolve("./");
    copydir.sync(src, dest);
}

updatePackageJson();
copyFiles();
