/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import {  SimpleComponentInstantiationFactory, SimpleModuleInstantiationFactory } from "@prague/aqueduct";
import {
  IPraguePackage,
} from "@prague/container-definitions";
import { SharedMap } from "@prague/map";
import { SharedObjectSequence } from "@prague/sequence";
import { ExternalComponentLoader } from "./externalComponentLoader";
import { UrlRegistry } from "./UrlRegistry";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json") as IPraguePackage;

export const fluidExport = new SimpleModuleInstantiationFactory(
    pkg.name,
    new UrlRegistry(
        new Map([
            [pkg.name, Promise.resolve(
                new SimpleComponentInstantiationFactory([
                    SharedMap.getFactory(),
                    SharedObjectSequence.getFactory(),
                ],
                ExternalComponentLoader.load))],
        ])));
