/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import nconf from "nconf";
import * as aria from "aria-nodejs-sdk";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Transport = require("winston-transport");

const configFile = path.join(__dirname, "../config/config.json");
const config = nconf.argv().env({ separator: "__", parseValues: true }).file(configFile).use("memory");
aria.AWTLogManager.initialize(config.get("aria:key"));
const ariaLogger = aria.AWTLogManager.getLogger();

export class AriaTransport extends Transport {
    constructor(opt) {
        super(opt);
    }

    log(info, callback) {
        setImmediate(() => {
            this.emit("logged", info);
        });
        const eventProperties = new aria.AWTEventProperties("WinstonAriaTransport");
        const { label, level, message } = info;
        eventProperties.setProperty("Label", label);
        eventProperties.setProperty("Level", level);
        eventProperties.setProperty("Message", message);
        ariaLogger.logEvent(eventProperties);

        callback();
    }
}
