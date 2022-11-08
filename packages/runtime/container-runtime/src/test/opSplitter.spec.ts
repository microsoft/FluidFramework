/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-nodejs-modules
import { strict as assert } from "assert";
import { MessageType } from "@fluidframework/protocol-definitions";
import { OpSplitter } from "../opSplitter";

describe("Op splitter", () => {
    const submitted: { type: MessageType; contents: any; batch: boolean; appData?: any; }[] = [];
    const submitFn = (type: MessageType, contents: any, batch: boolean, appData?: any): number => {
        submitted.push({ type, contents, batch, appData });
        return submitted.length;
    };

    it("Validate chunking end to end", () => {
        const opSplitter = new OpSplitter([], submitFn);
        assert.ok(!opSplitter.hasChunks);
    });
});
