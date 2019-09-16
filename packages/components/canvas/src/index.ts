/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Ink } from "@microsoft/fluid-ink-stream";
import { PrimedComponentFactory, SimpleModuleInstantiationFactory } from "@prague/aqueduct";
import { Canvas } from "./canvas";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
export const CanvasName = pkg.name as string;

export const CanvasInstantiationFactory = new PrimedComponentFactory(
    Canvas,
    [
        Ink.getFactory(),
    ],
  );

export const fluidExport = new SimpleModuleInstantiationFactory(
    CanvasName,
    new Map([
        [CanvasName, Promise.resolve(CanvasInstantiationFactory)],
    ]),
);
