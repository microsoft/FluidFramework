/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TelemetryLogger } from "@fluidframework/telemetry-utils";

export function convertFluidFile(inputFileContent: string, scenario: string, logger: TelemetryLogger): string {
  if (!inputFileContent || !scenario) {
    throw new Error("Empty file or missing scenario name");
  }

  logger.sendTelemetryEvent({ eventName: "Client_FileConverted" });
  return "scenario: " + scenario + "\ninput: " + inputFileContent.substring(0, 5);
}
