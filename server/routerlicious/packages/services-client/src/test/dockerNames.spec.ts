/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";

import { getRandomName, choose } from "../dockerNames";

describe("DockerNames", () => {
    describe("getRandomName", () => {
        it("generates a random name", async () => {
            const name = getRandomName();
            assert(typeof(name) === "string");
            assert(name.includes("_"));
        });

        it("generates a random name with '-' connector", async () => {
            const name = getRandomName("-");
            assert(name.includes("-"));
        });
    });
    describe("choose", () => {
        it("generates a random name", async () => {
            const name = choose();
            assert(typeof(name) === "string");
            assert(name.includes("_"));
        });
    });
});
