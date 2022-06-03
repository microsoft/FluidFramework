/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { Container, IContainerConfig, waitContainerToCatchUp } from "../container";
import { Loader } from "../loader";

describe("Container", () => {
    describe("constructor", () => {
        //* Ehh probably not. Get coverage via e2e tests instead.
        it("Respects CatchUpBeforeDeclaringConnected config", () => {
            const container = new Container({} as any as Loader, {} as any as IContainerConfig);
            assert(container !== undefined);
        });
    });

    describe("waitContainerToCatchUp", () => {
        //* Write these tests
        it("asdf", async () => {
            const mockContainer: Partial<IContainer> = {

            };
            await waitContainerToCatchUp(mockContainer as IContainer);
        });
    });
});
