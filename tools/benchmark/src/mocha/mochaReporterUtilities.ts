/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Suite } from "mocha";
import { getName } from "../ReporterUtilities";

/**
 * This file contains generic utilities of use to a mocha reporter, especially for convenient formatting of textual
 * output to the command line.
 */

/**
 * Strip tags and user-specified category from a test suite's name.
 */
export const getSuiteName = (suite: Suite): string => getName(suite.fullTitle());
