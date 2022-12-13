/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Server } from 'http';

import request from "supertest";

// The mock service is not intended to be directly visible to other parts of the app sample.
// eslint-disable-next-line import/no-internal-modules
import { initializeCustomerService } from "../src/mock-customer-service";



describe("mockCustomerService", () => {
    let server: Server | undefined;

    beforeEach(async () => {
        server = await initializeCustomerService();
    });

    afterEach(() => {
        server?.close();
        server = undefined;
    });

    it("", (done) => {
        request(server!).get("/").expect(200, "Hello World!", done);
    });
});
