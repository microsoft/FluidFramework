/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { ListComponent } from "./listComponent";
import { SharedDirectory } from "../../../../packages/framework/aqueduct/node_modules/@fluidframework/map/dist";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ListComponentName = pkg.name as string;

// ----- FACTORY SETUP -----

export const ListComponentInstantiationFactory = new DataObjectFactory(
    ListComponentName,
    ListComponent,
    [SharedDirectory.getFactory()],
    {}
);

export const fluidExport = ListComponentInstantiationFactory;
