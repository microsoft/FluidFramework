/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Server } from 'http';

import request from "supertest";

import { initializeCustomerService } from '../src/mock-customer-service';
import { customerServicePort } from '../src/mock-customer-service-interface';
import { closeServer } from './utilities';

/* eslint-disable @typescript-eslint/no-non-null-assertion */

describe("mock-customer-service", () => {
    /**
     * Express server instance backing our service.
     *
     * @remarks
     *
     * These tests spin up their own Express server instance so we can directly test against it
     * (using supertest), rather than leaning on network calls.
     */
    let customerService: Server | undefined;

    beforeEach(async () => {
        customerService = await initializeCustomerService({
            port: customerServicePort,
        });
    });

    afterEach(async () => {
        const _customerService = customerService!;
        customerService = undefined;

        await closeServer(_customerService);
    });

    // We have omitted `@types/supertest` due to cross-package build issue.
    // So for these tests we have to live with `any`.
    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

    it("register-for-webhook: Registering valid URI succeeds", async () => {
        await request(customerService!).post("/register-for-webhook").send({ url: "https://www.fluidframework.com" }).expect(200);
    });

    it("register-for-webhook: Registering invalid URI fails", async () => {
        await request(customerService!).post("/register-for-webhook").send({ url: "I am not a URI" }).expect(400);
    });

    /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
});

/* eslint-enable @typescript-eslint/no-non-null-assertion */
