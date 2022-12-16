/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// The mock service is not intended to be directly visible to other parts of the app sample.
/* eslint-disable import/no-internal-modules */

import { Server } from 'http';

import express from "express";
import request from "supertest";

import { ExternalDataSource } from '../src/externalData';
import { initializeCustomerService } from "../src/mock-customer-service";

/* eslint-enable import/no-internal-modules */

describe("mockCustomerService", () => {
    let externalDataSource: ExternalDataSource | undefined;
    let server: Server | undefined; // Initialized before each test

    beforeAll(() => {
        externalDataSource = new ExternalDataSource();
    })

    beforeEach(async () => {
        server = await initializeCustomerService();
    });

    afterEach(async () => {
        return new Promise<void>((resolve, reject) => {
            const _server = server!;
            server = undefined;
            externalDataSource!.debugResetData();

            _server.close(() => {
                resolve();
            });
        });
    });

    it("fetch-tasks: Ensure server yields the data we expect", async () => {
        const expectedData = await externalDataSource!.fetchData();
        await request(server!).get("/fetch-tasks").expect(200, {taskList: expectedData});
    });

    it("set-tasks: Ensure external data is updated with provided data", async () => {
        const newData = "42:Determine meaning of life:37";
        await request(server!).post("/set-tasks").send({taskList: newData}).expect(200);

        const externalData = await externalDataSource!.fetchData();
        expect(externalData).toEqual(newData);
    });

    it("set-tasks: Ensure server rejects update with no data", async () => {
        const oldData = await externalDataSource!.fetchData();
        await request(server!).post("/set-tasks").send().expect(400);

        const externalData = await externalDataSource!.fetchData();
        expect(externalData).toEqual(oldData); // Sanity check that we didn't blow away data
    });

    it("set-tasks: Ensure server rejects update with malformed data", async () => {
        const oldData = await externalDataSource!.fetchData();
        await request(server!).post("/set-tasks").send({tasks: "42:Determine meaning of life:37"}).expect(400);

        const externalData = await externalDataSource!.fetchData();
        expect(externalData).toEqual(oldData); // Sanity check that we didn't blow away data
    });

    it("register-for-webhook", async () => {
        // Set up mock local service, which will be registered as webhook listener
        const localServicePort = 5328;
        const localServiceApp = express();

        let wasHookNotifiedForChange = false;

        localServiceApp.get("/task-list-hook", (request, result) => {
            wasHookNotifiedForChange = true;
        });

        const localServer = localServiceApp.listen(localServicePort);

        try {
            // Register our local service URL with customer service for webhook subscription
            const localServiceListenerUrl = `http://localhost:${localServicePort}/task-list-hook`;
            await request(server!).post("/register-for-webhook").send({ url: localServiceListenerUrl }).expect(200);

            // Submit data change to customer service
            await request(server!).post("/set-tasks").send({taskList: "42:Determine meaning of life:37"}).expect(200);

            // Verify that our subscriber was notified to the changes.
            await setTimeout(() => {
                expect(wasHookNotifiedForChange).toBe(true);
            }, 10000);
        } finally {
            await new Promise<void>((resolve) => {
                localServer.close(() => {
                    resolve();
                });
            });
        }

    })
});
