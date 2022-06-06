/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { AxiosRequestConfig } from "axios";
import { json, urlencoded } from "body-parser";
import express from "express";
import request from "supertest";
import { RestLessClient } from "@fluidframework/server-services-client";
import { RestLessServer } from "../restLessServer";

describe("RestLess", () => {
    const authToken = "123456abcdef";
    const resource1 = {
        id: "one",
        content: "Hello",
    };
    let supertest: request.SuperTest<request.Test>;
    let database: Map<string, any>;
    const setupApp = (restLessBeforeBodyParser: boolean = false) => {
        /**
         * Set up example (simple) express server with "authentication"
         */
        const app = express();
        database = new Map();
        // initialize RestLess server translation
        const restLessMiddleware: () => express.RequestHandler = () => {
            const restLessServer = new RestLessServer();
            return (req, res, next) => {
                restLessServer
                    .translate(req)
                    .then(() => next())
                    .catch(next);
            };
        };
        // set up rudimentary authentication
        const authMiddleware: () => express.RequestHandler = () => (req, res, next) => {
            if (req.get("Authorization") !== `Bearer ${authToken}`) {
                return res.sendStatus(403);
            }
            next();
        };
        if (restLessBeforeBodyParser) {
            app.use(restLessMiddleware());
            app.use(authMiddleware());
        }
        app.use(json());
        // urlencoded does not recognize content-type: application/x-www-form-urlencoded
        app.use(urlencoded({ extended: true, type: (req) => req.headers["content-type"]?.startsWith("application/x-www-form-urlencoded") }));
        if (!restLessBeforeBodyParser) {
            app.use(restLessMiddleware());
            app.use(authMiddleware());
        }
        app.get("/resource/:id", (req, res) => {
            const content = database.get(req.params.id);
            if (!content) {
                return res.sendStatus(404);
            }
            res.status(200).json({
                id: req.params.id,
                query: req.query,
                content,
            });
        });
        app.put("/resource", (req, res) => {
            if (!req.body) {
                return res.sendStatus(400);
            }
            if (!database.get(req.body.id)) {
                return res.sendStatus(404);
            }
            database.set(req.body.id, req.body.content);
            res.status(200).json({
                id: req.body.id,
                query: req.query,
                content: req.body.content,
            });
        });
        app.post("/resource", (req, res) => {
            if (!req.body) {
                return res.sendStatus(400);
            }
            if (database.get(req.body.id)) {
                return res.sendStatus(400);
            }
            database.set(req.body.id, req.body.content);
            res.status(201).json({
                id: req.body.id,
                query: req.query,
                content: req.body.content,
            });
        });
        supertest = request(app);
    };
    const superRequest = (requestConfig: AxiosRequestConfig, translate = false) => {
        const reqConf = translate ? new RestLessClient().translate(requestConfig) : requestConfig;
        const req: request.Test = supertest[reqConf.method?.toLowerCase() ?? "get"](reqConf.url ?? "");
        req.send(reqConf.data);
        for (const [headerKey, headerValue] of Object.entries(reqConf.headers as Record<string, string> | undefined ?? {})) {
            req.set(headerKey, headerValue);
        }
        return req;
    }
    [true, false].forEach((variation) => {
        describe(`RestLess middleware ${variation ? "before" : "after"} bodyParser middleware`, () => {
            before(() => {
                setupApp(variation);
            });
            beforeEach(() => {
                database = new Map();
            });
            describe("un-translated (backwards compatible)", () => {
                it("404, GET /resource/:id", async () => {
                    const requestConfig: AxiosRequestConfig = {
                        method: "get",
                        url: `/resource/${resource1.id}`,
                        headers: {
                            "Authorization": `Bearer ${authToken}`,
                        },
                    };
                    const req = superRequest(requestConfig);
                    await req.expect(404);
                });
                it("200, GET /resource", async () => {
                    database.set(resource1.id, resource1.content);
                    const requestConfig: AxiosRequestConfig = {
                        method: "get",
                        url: `/resource/${resource1.id}`,
                        headers: {
                            "Authorization": `Bearer ${authToken}`,
                        },
                    };
                    const req = superRequest(requestConfig);
                    await req.expect((res) => {
                        assert.strictEqual(res.status, 200);
                        assert.deepStrictEqual(res.body, {
                            id: resource1.id,
                            content: resource1.content,
                            query: {},
                        });
                    });
                });
                it("201, POST /resource", async () => {
                    const requestConfig: AxiosRequestConfig = {
                        method: "post",
                        url: `/resource`,
                        headers: {
                            "Authorization": `Bearer ${authToken}`,
                            "Content-type": "application/json",
                        },
                        data: resource1
                    };
                    const req = superRequest(requestConfig);
                    await req.expect((res) => {
                        assert.strictEqual(res.status, 201);
                        assert.deepStrictEqual(res.body, {
                            id: resource1.id,
                            content: resource1.content,
                            query: {},
                        });
                    });
                });
                it("200, PUT /resource", async () => {
                    database.set(resource1.id, resource1.content);
                    const newContent = "Goodbye";
                    const requestConfig: AxiosRequestConfig = {
                        method: "put",
                        url: `/resource`,
                        headers: {
                            "Authorization": `Bearer ${authToken}`,
                            "Content-type": "application/json",
                        },
                        data: {
                            ...resource1,
                            content: newContent,
                        },
                    };
                    const req = superRequest(requestConfig);
                    await req.expect((res) => {
                        assert.strictEqual(res.status, 200);
                        assert.deepStrictEqual(res.body, {
                            id: resource1.id,
                            content: newContent,
                            query: {},
                        });
                    });
                });
            });
            describe("translated", () => {
                it("404 /resource/:id", async () => {
                    const requestConfig: AxiosRequestConfig = {
                        method: "get",
                        url: `/resource/${resource1.id}`,
                        headers: {
                            "Authorization": `Bearer ${authToken}`,
                        },
                    };
                    const req = superRequest(requestConfig, true);
                    await req.expect(404);
                });
                it("200, GET /resource/:id", async () => {
                    database.set(resource1.id, resource1.content);
                    const requestConfig: AxiosRequestConfig = {
                        method: "get",
                        url: `/resource/${resource1.id}`,
                        headers: {
                            "Authorization": `Bearer ${authToken}`,
                        },
                    };
                    const req = superRequest(requestConfig, true);
                    await req.expect((res) => {
                        assert.strictEqual(res.status, 200);
                        assert.deepStrictEqual(res.body, {
                            id: resource1.id,
                            content: resource1.content,
                            query: {},
                        });
                    });
                });
                it("201, POST /resource", async () => {
                    const requestConfig: AxiosRequestConfig = {
                        method: "post",
                        url: `/resource`,
                        headers: {
                            "Authorization": `Bearer ${authToken}`,
                            "Content-type": "application/json",
                        },
                        data: resource1
                    };
                    const req = superRequest(requestConfig, true);
                    await req.expect((res) => {
                        assert.strictEqual(res.status, 201);
                        assert.deepStrictEqual(res.body, {
                            id: resource1.id,
                            content: resource1.content,
                            query: {},
                        });
                    });
                });
                it("200, PUT /resource", async () => {
                    database.set(resource1.id, resource1.content);
                    const newContent = "Goodbye";
                    const requestConfig: AxiosRequestConfig = {
                        method: "put",
                        url: `/resource`,
                        headers: {
                            "Authorization": `Bearer ${authToken}`,
                            "Content-type": "application/json",
                        },
                        data: {
                            ...resource1,
                            content: newContent,
                        },
                    };
                    const req = superRequest(requestConfig, true);
                    await req.expect((res) => {
                        assert.strictEqual(res.status, 200);
                        assert.deepStrictEqual(res.body, {
                            id: resource1.id,
                            content: newContent,
                            query: {},
                        });
                    });
                });
            });
        });
    });
});
