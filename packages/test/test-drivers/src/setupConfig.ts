/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { loadConfig, writeConfig } from "./config";
import { setupOdspConfig } from "./odspTestDriver";

async function main() {
    console.log("loading config");
    const config = loadConfig();

    console.log("setupOdspConfig");
    await setupOdspConfig(config.odsp);

    console.log("writing config");
    writeConfig(config);
}
main()
    .catch((e)=>{
        console.error("Failed to read testConfig.json");
        console.error(e);
        process.exit(-1);
    });
