import * as nconf from "nconf";
import * as path from "path";
import * as winston from "winston";
import { configureLogging } from "./logger";
import { testPragueService } from "./testService";

function getConfig(configFile: string): nconf.Provider {
    return nconf.argv().env("__" as any).file(configFile).use("memory");
}

async function runInternal() {
    const config = getConfig(path.join(__dirname, "../config.json"));
    configureLogging(config.get("logger"));
    winston.info("Test started");
    return testPragueService(config);
}

function run() {
    runInternal().then(() => {
        winston.info("Success running test");
        process.exit(0);
    }, (err) => {
        winston.error(err);
        winston.info("Error running test");
        process.exit(1);
    });
}

run();
