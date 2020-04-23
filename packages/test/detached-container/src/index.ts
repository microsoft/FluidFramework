/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  SimpleModuleInstantiationFactory
} from "@microsoft/fluid-aqueduct";

import { DetachedContainerTestInstantiationFactory } from "./main";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
const chaincodeName = pkg.name as string;

export const fluidExport = new SimpleModuleInstantiationFactory(
  chaincodeName,
  new Map([
      [chaincodeName, Promise.resolve(DetachedContainerTestInstantiationFactory)],
  ]),
);
