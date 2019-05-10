import * as nconf from "nconf";
import * as path from "path";
import * as raven from "raven";
import * as winston from "winston";
import { configureLogging } from "./logger";
import { testPragueService } from "./testService";

function getConfig(configFile: string): nconf.Provider {
    return nconf.argv().env("__" as any).file(configFile).use("memory");
}

async function runInternal() {
    const config = getConfig(path.join(__dirname, "../config.json"));
    raven.config(config.get("notification:endpoint")).install();
    configureLogging(config.get("logger"));
    winston.info("Test started");
    return testPragueService(config);
}

async function run() {
    try {
        await runInternal();
        winston.info("Success running test");
        process.exit(0);
    } catch (err) {
        raven.captureException(err);
        winston.error(err);
        // Wait to make sure that the exception is logged in sentry.
        setTimeout(() => {
            winston.error("Error running test. Shutting down!");
            process.exit(0);
        }, 30000);
    }
}

run();
