const cpy = require("cpy");
const copy = require("copy");
const copydir = require("copy-dir");
const deepmerge = require("deepmerge");
const fs = require("fs");
const path = require("path");

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
    // console.log(mergedOutput);
    fs.writeFileSync("package.json", mergedOutput);
}

function copyFiles() {
    console.log(`root path: ${process.env.LERNA_ROOT_PATH}`);
    const src = path.join(process.env.LERNA_ROOT_PATH, "packages/utils/build-common/templates");
    console.log(`src: ${src}`);
    const dest = path.resolve("./");
    console.log(`dest: ${dest}`);
    // cpx.copySync(src, dest, {dereference: true, update: true});
    // fs.copyFileSync(src, dest);
    // copy(src, dest, function(err, files) {
    //     if (err) throw err;
    //     // `files` is an array of the files that were copied
    //     console.log(`files: ${JSON.stringify(files)}`);
    //   });

    //   (async () => {
    //     await cpy(src, dest);
    //     console.log("Files copied!");
    // })();

    copydir.sync(src, dest);
}

updatePackageJson();
copyFiles();
