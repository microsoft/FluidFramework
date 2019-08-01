/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleComponentInstantiationFactory, SimpleModuleInstantiationFactory } from "@prague/aqueduct";
import { SharedMap } from "@prague/map";
import { Stream } from "@prague/stream";
import { Canvas } from "./canvas";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
export const CanvasName = pkg.name as string;

export const CanvasInstantiationFactory = new SimpleComponentInstantiationFactory(
    [
        SharedMap.getFactory(),
        Stream.getFactory(),
    ],
    Canvas.load,
  );

export const fluidExport = new SimpleModuleInstantiationFactory(
    CanvasName,
    new Map([
        [CanvasName, Promise.resolve(CanvasInstantiationFactory)],
    ]),
);
