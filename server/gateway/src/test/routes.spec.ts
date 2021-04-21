/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import nconf from "nconf";
import path from "path";
import supertest from "supertest";
import { ICache, MongoManager } from "@fluidframework/server-services-core";
import { Alfred } from "../alfred";
import * as app from "../app";

describe("Gateway", () => {
    describe("Server", () => {
        let testServer: supertest.SuperTest<supertest.Test>;

        beforeEach(() => {
            const defaultConfig = nconf.file(path.join(__dirname, "../../config.json")).use("memory");
            defaultConfig.set("gateway:sessionStore", "memory");

            const alf = new Alfred(
                [{ id: "git", key: "git" }],
                defaultConfig.get("worker:blobStorageUrl"),
                defaultConfig.get("gateway:auth:endpoint"));
            const gateway = app.create(
                defaultConfig,
                alf,
                [{ id: "git", key: "git" }],
                null as unknown as ICache,
                null as unknown as MongoManager,
                "");
            testServer = supertest(gateway);
        });

        describe("Routes", () => {

            describe("Home", () => {
                it("Should return page", () => {
                    return testServer.get("/").expect(200);
                });
            });
        });
    });
});
