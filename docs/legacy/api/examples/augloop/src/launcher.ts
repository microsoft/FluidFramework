/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {IHostCallbacks, runtime} from "@augloop/runtime-client";
import * as winston from "winston";
import {IDocTile, inputSchemaName} from "./common";
import {configureRuntimeForWorkflows} from "./main";

let _runtimeInitPromise: Promise<void> = null;
const _serviceUrl = "https://augloop-cluster-prod-gw.westus.cloudapp.azure.com";
const _hostMetadata = {
    appName: "Prague",
    appPlatform: "Node",
  };

const onResultCallback = (inputSchema: string, input: IDocTile, outputSchema: string, output) => {
    winston.info(`Result for request ${input.reqOrd}`);
    winston.info(inputSchema);
    winston.info(JSON.stringify(input));
    winston.info(outputSchema);
    winston.info(JSON.stringify(output));
};

const _hostCallbacks: IHostCallbacks = {
    isFeatureEnabled: null,
    onResult: onResultCallback,
    sendTelemetryEvent: null,
};

function startRuntime(): Promise<void> {
    if (_runtimeInitPromise !== null) {
      return _runtimeInitPromise;
    }

    if (_serviceUrl === undefined || _hostMetadata === undefined || _serviceUrl === null) {
      throw Error("Augmentation Loop runtime initalization failed");
    }

    _runtimeInitPromise = runtime.init(_serviceUrl, _hostMetadata, _hostCallbacks);
    return _runtimeInitPromise;
}

const inputTexts = [
    "Terible speling",
    "The cat are fat",
    "Everything looks good",
    "Congressman did something stupid",
    `It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a
    wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood,
    this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful
    property of some one or other of their daughters.`,
];

export function launch() {
    startRuntime().then(() => {
        configureRuntimeForWorkflows(runtime).then(() => {
            let index = 0;
            for (const text of inputTexts) {
                const input: IDocTile = {
                    content: text,
                    documentId: "random-id",
                    reqOrd: index,
                    requestTime: index,
                };
                ++index;
                runtime.submit(inputSchemaName, input);
            }
        });
      });
}
