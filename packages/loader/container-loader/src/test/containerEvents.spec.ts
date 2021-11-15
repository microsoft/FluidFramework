/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import { strict as assert } from "assert";
import { EventEmitter } from "events";
// import { Container } from "../container";
// import { Loader } from "../loader";

class Foo extends EventEmitter {
    constructor() {
        super();
        this.on("newListener", (event: string, listener: (...args: any[]) => void) => {
            Promise.resolve().then(() => listener(event)).catch(() => {});
        });
        this.on(true as unknown as string, (...args) => { console.log(`true: ${args} (${args?.length})`); });
        this.on("wassap", (...args) => { console.log(`wassap: ${args} (${args?.length})`); });
    }
}

describe("okay", () => {
    it("hello", async () => {
        const foo = new Foo();
        await Promise.resolve();
        foo.emit("");
        foo.emit("wassap", 999);
        foo.emit(true as unknown as string);
    });
});
