/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { Suite } from "benchmark";
import { FluidSerializer } from "../..";
import { makeJson, MockHandleContext } from "../../src/test/utils";
import { consume, runSuites } from "./util";

const serializer = new FluidSerializer(new MockHandleContext(), (handle: IFluidHandle) => {});

// Mock Fluid handle
const handle: IFluidHandle = {
    get IFluidHandle() { return handle; },
    absolutePath: "/",
    isAttached: false,

    attachGraph(): void { },
    get: async () => Promise.resolve(undefined as any),
    bind() {},
};

const shallowNoHandles = makeJson(/* breadth: */ 2, /* depth: */ 2, () => ({}));
const deepWithHandles = makeJson(/* breadth: */ 8, /* depth: */ 8, () => handle);

const shallowNoHandlesString = serializer.stringify(shallowNoHandles, handle);
const deepWithHandlesString =  serializer.stringify(deepWithHandles, handle);

const measureReplaceHandles = (name: string, value: any) => new Suite(`replaceHandles Handles: ${name}`)
    .add("replaceHandles(...)", () => {
        consume(serializer.replaceHandles(value, handle));
    })
    .add("parse(stringify(...))", () => {
        consume(serializer.parse(serializer.stringify(value, handle)));
    });

const measureStringify = (name: string, value: any) => new Suite(`Stringify: ${name}`)
    .add("JSON.stringify(replaceHandles(...))", () => {
        consume(JSON.stringify(serializer.replaceHandles(value, handle)));
    })
    .add("stringify(...)", () => {
        consume(serializer.stringify(value, handle));
    });

const measureParse = (name: string, value: any) => new Suite(`Parse: ${name}`)
    .add("parse(...)", () => {
        consume(serializer.parse(value));
    });

runSuites([
    measureReplaceHandles("primitive", 0),
    measureReplaceHandles("shallow (no handles)", shallowNoHandles),
    measureReplaceHandles("deep (with handles)", deepWithHandles),
]);

runSuites([
    measureStringify("primitive", 0),
    measureStringify("shallow (no handles)", shallowNoHandles),
    measureStringify("deep (with handles)", deepWithHandles),
]);

runSuites([
    measureParse("primitive", "0"),
    measureParse("shallow (no handles)", shallowNoHandlesString),
    measureParse("deep (with handles)", deepWithHandlesString),
]);
