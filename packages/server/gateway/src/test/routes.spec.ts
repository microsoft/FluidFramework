/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as nconf from "nconf";
import * as path from "path";
import * as supertest from "supertest";
import { Alfred } from "../alfred";
import * as app from "../app";

describe("Gateway", () => {
    describe("Server", () => {
        let testServer: supertest.SuperTest<supertest.Test>;

        beforeEach(() => {
            const defaultConfig = nconf.file(path.join(__dirname, "../../config.json")).use("memory");
            const alf = new Alfred(
                [{ id: "git", key: "git" }],
                defaultConfig.get("worker:alfredUrl"),
                defaultConfig.get("worker:blobStorageUrl"),
                defaultConfig.get("gateway:auth:endpoint"));
            const gateway = app.create(
                defaultConfig,
                alf,
                [{ id: "git", key: "git" }],
                null);
            testServer = supertest(gateway);
        });

        describe("Routes", () => {
            describe("Templates", () => {
                it("Should return page", () => {
                    return testServer.get("/templates/list").expect(200);
                });
            });

            describe("DemoCreator", () => {
                it("Should return page", () => {
                    return testServer.get("/democreator").expect(200);
                });
            });

            describe("Home", () => {
                it("Should return page", () => {
                    return testServer.get("/").expect(200);
                });
            });

            describe("Maps", () => {
                it("Should be able to retrieve document", () => {
                    return testServer.get("/maps/test").expect(200);
                });

                it("Should be called with a document id", () => {
                    return testServer.get("/maps").expect(404);
                });
            });

            describe("Scribe", () => {
                it("Should return page", () => {
                    return testServer.get("/scribe").expect(200);
                });
            });

            describe("SharedText", () => {
                it.skip("Should be able to retrieve document", () => {
                    return testServer.get("/sharedText/test").expect(200);
                });

                it("Should be called with a document id", () => {
                    return testServer.get("/sharedText").expect(404);
                });
            });
        });
    });
});
