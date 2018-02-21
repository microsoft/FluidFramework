import * as aria from "aria-nodejs-sdk";
import * as fs from "fs";

const tenant = "249d93644d18425ea36b3e443d49e59a-a78d2c7d-4380-47be-8830-7a8f2f9370d5-7185";
const logger = aria.AWTLogManager.initialize(tenant);

export function ariaLogger(scribeMetrics: string, eventName: string) {

    const event = new aria.AWTEventProperties();
    event.setName(eventName);
    event.setTimestamp(Date.now());

    const metricsObject = JSON.parse(scribeMetrics);

    for (const key in metricsObject) {
        if (metricsObject.hasOwnProperty(key)) {

            event.setProperty(key,
                metricsObject[key],
                (metricsObject[key] % 1 === 0) ? aria.AWTPropertyType.Int64 : aria.AWTPropertyType.Double);
        }
    }

    logger.logEvent(event);
    aria.AWTLogManager.flush(() => {
        console.log("Flushed");
        process.exit(0);
    });
}

// TODO: Consider running this so logs are commandline input to make it easier to add new tooling
const path = process.argv[2];
const name = process.argv[3];

const json = fs.readFileSync(path, "utf8");

ariaLogger(json, name);
