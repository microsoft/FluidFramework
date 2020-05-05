/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as aria from "aria-nodejs-sdk";
import * as commander from "commander";
import * as fs from "fs";
import { runInContext } from "vm";

// Aria only allows alphanumeric, underscore and dot
function nameFixer(eventName: string): string {
    let fixedName = "";

    eventName = eventName.replace(new RegExp("-[0-9]*\.*[0-9]*\.*[0-9]+", "g"), "");

    for (let i = 0; i < eventName.length && i < 100; i++) {
        const charCode = eventName.charCodeAt(i);
        if ((charCode >= 0x30 && charCode <= 0x39) ||
            (charCode >= 0x61 && charCode <= 0x7A) ||
            (charCode >= 0x41 && charCode <= 0x5A) ||
            (charCode === 0x2E) ||
            (charCode === 0x5F)) {

            fixedName += eventName.charAt(i);
        }
    }
    return fixedName;
}

function uploadMetric(logger: aria.AWTLogger, metrics: object, eventName: string) {
    const event = new aria.AWTEventProperties();
    event.setName(eventName);
    event.setTimestamp(Date.now());

    for (const key in metrics) {
        if (metrics.hasOwnProperty(key)) {
            const metric = metrics[key];

            let ariaMetricType = aria.AWTPropertyType.Unspecified;
            if (typeof(metric) === "string") {
                ariaMetricType = aria.AWTPropertyType.String;
            } else if (Number.isInteger(metric)) {
                ariaMetricType = aria.AWTPropertyType.Int64;
            } else if (typeof(metric) === "number") {
                ariaMetricType = aria.AWTPropertyType.Double;
            } else if (typeof(metric) === "boolean") {
                ariaMetricType = aria.AWTPropertyType.Boolean;
            }

            event.setProperty(
                nameFixer(key),
                metric,
                ariaMetricType);
        }
    }

    logger.logEvent(event);
}

function uploadMetrics(path: string, eventName: string, tenant: string): Promise<void> {
    const metricsAsString = fs.readFileSync(path, "utf8");

    const logger = aria.AWTLogManager.initialize(tenant);

    // Parse the metric string and convert to an array if only given a single object
    let metrics = JSON.parse(metricsAsString);
    metrics = metrics instanceof Array ? metrics : [metrics];

    // Upload all the metrics
    for (const metric of metrics) {
        uploadMetric(logger, metric, eventName);
    }

    // Return a promise that will resolve when the metrics have been flushed
    return new Promise<void>((resolve, reject) => {
        aria.AWTLogManager.flush(() => {
            resolve();
        });
    });
}

// Process command line input
commander
    .version("0.0.1")
    .description("Uploads a log of metrics to Aria")
    .option(
        "-t, --tenant [tenant]",
        "Aria tenant",
        "")
    .arguments("<path> <name>")
    .action((path: string, name: string) => {
        uploadMetrics(path, name, commander.tenant)
            .then(() => {
                console.log("Uploaded");
                process.exit(0);
            })
            .catch((error) => {
                console.error(error);
                process.exit(1);
            });
    })
    .parse(process.argv);
