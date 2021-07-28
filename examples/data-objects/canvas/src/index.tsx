/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import {
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";
import { Ink } from "@fluidframework/ink";
import React from "react";
import { Canvas } from "./canvas";
import { CanvasView } from "./view";

export const CanvasInstantiationFactory =
    new DataObjectFactory<Canvas, undefined, undefined, IEvent>(
        "Canvas",
        Canvas,
        [
            Ink.getFactory(),
        ],
        {},
    );

// const canvasViewCallback = (canvas: Canvas) => new CanvasView(canvas);
const canvasViewCallback = (canvas: Canvas) => <CanvasView canvas={canvas} />;

export const fluidExport = new ContainerViewRuntimeFactory<Canvas>(CanvasInstantiationFactory, canvasViewCallback);
