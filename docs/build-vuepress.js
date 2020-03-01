const { createApp, dev, build, eject } = require("vuepress");
const defaultConfig = require("./.vuepress/config");
import * as fs from "fs-extra";
// import deepmerge from "deepmerge";

let cliArgs = process.argv.slice(2);
let config = defaultConfig;

// const configs = {
//     ""
// }
async function main() {
    if (cliArgs[0]) {
        const outputDir = cliArgs[0];
        config.base = outputDir;
        console.log(`outputDir: ${outputDir}`);
        // console.log(`config: ${JSON.stringify(config, space = 2)}`);
    }

    fs.writeJSONSync("./.vuepress/config2.js", config);


    // await build({
    //     sourceDir: ".",
    //     siteConfig: config,
    // });
}

main();
