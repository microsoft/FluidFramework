/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";

export function getArgsValidationError(
  inputFile: string,
  outputFolder: string,
  scenario: string,
  props: string
): string {
  if (props) {
    const propsArr = props.split(",");
    for (let i = 0; i < propsArr.length; i += 1) {
      const propDetails = propsArr[i].split("=");
      if (propDetails.length < 2) {
        return "Incorrect props " + propsArr[i];
      }
    }
  }

  // Validate input file
  if (!inputFile) {
    // TODO: Do not log file name. It can be customer content
    return "Input file name is missing.";
  } else if (!fs.existsSync(inputFile)) {
    return "Input file does not exist.";
  }

  // Validate output file
  if (!outputFolder) {
    return "Output folder name is missing.";
  } else if (!fs.existsSync(outputFolder)) {
    return "Output folder does not exist.";
  } else if (fs.existsSync(outputFolder + "/index.html")) {
    return "Output file already exists.";
  }

  // Validate scenario name
  if (!scenario) {
    return "Scenario name is missing.";
  }

  return "";
}
