/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Server } from "http";

import cors from "cors";
import express from "express";
import fetch from "node-fetch";

import { delay } from "@fluidframework/core-utils";

import { initializeCustomerService } from "../src/mock-customer-service";
import { customerServicePort } from "../src/mock-customer-service-interface";
import { initializeExternalDataService, MockWebhook } from "../src/mock-external-data-service";
import { externalDataServicePort } from "../src/mock-external-data-service-interface";
import { ITaskData } from "../src/model-interface";
import { closeServer } from "./utilities";

const localServicePort = 5002;
const externalTaskListId = "task-list-1";
/**
 * @remarks
 *
 * These tests spin up their own Express server instances so we can directly test against it
 * (using supertest), rather than leaning on network calls.
 */
describe("mock-customer-service", () => {
	/**
	 * Express server instance backing our mock external data service.
	 */
	let externalDataService: Server | undefined;

	/**
	 * Express server instance backing our mock customer service.
	 */
	let customerService: Server | undefined;

	/**
	 * Datastore mapping of external resource id to its subscribers.
	 *
	 * @defaultValue A new new map will be initialized.
	 */
	let webhookCollection: Map<string, MockWebhook<ITaskData>>;

	beforeEach(async () => {
		webhookCollection = new Map<string, MockWebhook<ITaskData>>();
		externalDataService = await initializeExternalDataService({
			port: externalDataServicePort,
			webhookCollection,
		});
		customerService = await initializeCustomerService({
			port: customerServicePort,
			externalDataServiceWebhookRegistrationUrl: `http://localhost:${externalDataServicePort}/register-for-webhook`,
			fluidServiceUrl: `http://localhost:${localServicePort}/broadcast-signal`,
		});
	});

	/* eslint-disable @typescript-eslint/no-non-null-assertion */

	afterEach(async () => {
		const _externalDataService = externalDataService!;
		const _customerService = customerService!;

		externalDataService = undefined;
		customerService = undefined;

		await closeServer(_externalDataService);
		await closeServer(_customerService);
	});

	// We have omitted `@types/supertest` due to cross-package build issue.
	// So for these tests we have to live with `any`.
	it("register-for-webhook: Complete data flow", async () => {
		// Set up mock local service, which will be registered as webhook listener
		const localServiceApp = express();
		localServiceApp.use(express.json());
		localServiceApp.use(cors());

		// Bind listener
		let wasFluidNotifiedForChange = false;
		localServiceApp.post("/broadcast-signal", (_, result) => {
			wasFluidNotifiedForChange = true;
			result.send();
		});

		const localService: Server = localServiceApp.listen(localServicePort);

		try {
			// Register with the external service for notifications
			const webhookRegistrationResponse = await fetch(
				`http://localhost:${externalDataServicePort}/register-for-webhook`,
				{
					method: "POST",
					headers: {
						"Access-Control-Allow-Origin": "*",
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						url: `http://localhost:${localServicePort}/broadcast-signal?externalTaskListId=${externalTaskListId}`,
						externalTaskListId,
					}),
				},
			);

			if (!webhookRegistrationResponse.ok) {
				fail(`Webhook registration failed. Code: ${webhookRegistrationResponse.status}.`);
			}

			// Update external data
			const dataUpdateResponse = await fetch(
				`http://localhost:${externalDataServicePort}/set-tasks/${externalTaskListId}`,
				{
					method: "POST",
					headers: {
						"Access-Control-Allow-Origin": "*",
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						taskList: {
							42: {
								name: "Determine the meaning of life",
								priority: 37,
							},
						},
					}),
				},
			);

			if (!dataUpdateResponse.ok) {
				fail(`Data update failed. Code: ${dataUpdateResponse.status}.`);
			}

			// Delay for a bit to ensure time enough for our webhook listener to have been called.
			await delay(1000);

			// Verify our listener was notified of data change.
			expect(wasFluidNotifiedForChange).toBe(true);
		} catch (error) {
			fail(error);
		} finally {
			await closeServer(localService);
		}
	});
	/* eslint-enable @typescript-eslint/no-non-null-assertion */
});
