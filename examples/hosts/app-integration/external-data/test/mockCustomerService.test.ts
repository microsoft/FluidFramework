/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Server } from 'http';

import request from "supertest";
import { ExternalDataSource } from '../src/externalData';

// The mock service is not intended to be directly visible to other parts of the app sample.
// eslint-disable-next-line import/no-internal-modules
import { initializeCustomerService } from "../src/mock-customer-service";

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

            _server.close((error) => {
                if (error) {
                    reject(error)
                } else {
                    resolve();
                }
            });
        });
    });

    it("fetch-tasks", async () => {
        const expectedData = await externalDataSource!.fetchData();
        await request(server!).get("/fetch-tasks").expect(200, {taskList: expectedData});
    });

    it("set-tasks", async () => {
        const newData = "42:Determine meaning of life:37";
        await request(server!).post("/set-tasks").send({taskList: newData}).expect(200);

        const externalData = await externalDataSource!.fetchData();
        expect(externalData).toEqual(newData);
    });

    it("set-tasks (400: no data provided)", async () => {
        const oldData = await externalDataSource!.fetchData();
        await request(server!).post("/set-tasks").send().expect(400);

        const externalData = await externalDataSource!.fetchData();
        expect(externalData).toEqual(oldData); // Sanity check that we didn't blow away data
    });

    it("set-tasks (400: Bad key)", async () => {
        const oldData = await externalDataSource!.fetchData();
        await request(server!).post("/set-tasks").send({tasks: "42:Determine meaning of life:37"}).expect(400);

        const externalData = await externalDataSource!.fetchData();
        expect(externalData).toEqual(oldData); // Sanity check that we didn't blow away data
    });
});
