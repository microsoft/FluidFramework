/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Suite } from "benchmark";
import { ComponentSerializer } from "../../src";
import { handle, makeJson, mockHandleContext as context } from "../../src/test/utils";
import { consume, runSuites } from "./util";

const serializer = new ComponentSerializer(context);
const deepNoHandles = makeJson(/* breadth: */ 8, /* depth: */ 8, () => ({}));
const deepWithHandles = makeJson(/* breadth: */ 8, /* depth: */ 8, () => handle);

function measure(name: string, value: any) {
    return new Suite(name)
        .add("replaceHandles", () => {
            consume(serializer.replaceHandles(value, handle));
        })
        .add("stringify", () => {
            consume(serializer.stringify(value, handle));
        });
}

runSuites([
    measure("primitive", 0),
    measure("handle", handle),
    measure("deep (no handles)", deepNoHandles),
    measure("deep (with handles)", deepWithHandles),
]);
