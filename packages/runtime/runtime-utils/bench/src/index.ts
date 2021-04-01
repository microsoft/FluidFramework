/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { Suite } from "benchmark";
import { FluidSerializer } from "../..";
import { makeJson, MockHandleContext } from "../../src/test/utils";
import { consume, runSuites } from "./util";

const serializer = new FluidSerializer(new MockHandleContext());

const handle: IFluidHandle = {
    get IFluidHandle() { return handle; },
    absolutePath: "/",
    isAttached: false,

    attachGraph(): void { },
    get: async () => Promise.resolve(undefined as any),
    bind() {},
};

const shallowNoHandles = makeJson(/* breadth: */ 2, /* depth: */ 2, () => ({}));
const shallowWithHandles = makeJson(/* breadth: */ 2, /* depth: */ 2, () => handle);

const deepNoHandles = makeJson(/* breadth: */ 8, /* depth: */ 8, () => ({}));
const deepWithHandles = makeJson(/* breadth: */ 8, /* depth: */ 8, () => handle);

const measureEncode = (name: string, value: any) => new Suite(`Encode Handles: ${name}`)
    .add("encode", () => {
        consume(serializer.encode(value, handle));
    })
    .add("stringify/parse", () => {
        consume(serializer.parse(serializer.stringify(value, handle)));
    });

const measureStringify = (name: string, value: any) => new Suite(`Stringify: ${name}`)
        .add("JSON.stringify(encode)", () => {
            consume(JSON.stringify(serializer.encode(value, handle)));
        })
        .add("stringify", () => {
            consume(serializer.stringify(value, handle));
        });

runSuites([
    measureEncode("primitive", 0),
    measureEncode("handle", handle),
    measureEncode("shallow (no handles)", shallowNoHandles),
    measureEncode("shallow (with handles)", shallowWithHandles),
    measureEncode("deep (no handles)", deepNoHandles),
    measureEncode("deep (with handles)", deepWithHandles),
]);

runSuites([
    measureStringify("primitive", 0),
    measureStringify("handle", handle),
    measureStringify("shallow (no handles)", shallowNoHandles),
    measureStringify("shallow (with handles)", shallowWithHandles),
    measureStringify("deep (no handles)", deepNoHandles),
    measureStringify("deep (with handles)", deepWithHandles),
]);
