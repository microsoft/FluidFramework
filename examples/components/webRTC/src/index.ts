/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { pkgName } from "./packageVersion";
import { factory } from "./component";

export const fluidExport = new SimpleModuleInstantiationFactory(
    pkgName,
    [[pkgName, Promise.resolve(factory)]]);

