/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  SimpleModuleInstantiationFactory
} from "@microsoft/fluid-aqueduct";

import { VersiontestInstantiationFactory } from "./main";

const chaincodeName = VersiontestInstantiationFactory.type;

export const fluidExport = new SimpleModuleInstantiationFactory(
  chaincodeName,
  new Map([
      [chaincodeName, Promise.resolve(VersiontestInstantiationFactory)],
  ]),
);
