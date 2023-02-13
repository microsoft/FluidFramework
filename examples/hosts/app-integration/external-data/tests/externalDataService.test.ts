/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Server } from "http";

import cors from "cors";
import express from "express";
import fetch from "node-fetch";
import request from "supertest";

import { delay } from "@fluidframework/common-utils";

import { externalDataServicePort } from "../src/mock-external-data-service-interface";
import {
	ExternalDataSource,
	initializeExternalDataService,
} from "../src/mock-external-data-service";
import { assertValidTaskData, TaskData } from "../src/model-interface";
import { closeServer } from "./utilities";

describe("mock-external-data-service", () => {
	/**
	 * External data source backing our service.
	 */
	let externalDataSource: ExternalDataSource | undefined;

	/**
	 * Express server instance backing our service.
	 *
	 * @remarks
	 *
	 * These tests spin up their own Express server instance so we can directly test against it
	 * (using supertest), rather than leaning on network calls.
	 */
	let externalDataService: Server | undefined;

	beforeEach(async () => {
		externalDataSource = new ExternalDataSource();
		externalDataService = await initializeExternalDataService({
			port: externalDataServicePort,
			externalDataSource,
		});
	});

	/* eslint-disable @typescript-eslint/no-non-null-assertion */

	afterEach(async () => {
		externalDataSource = undefined;

		const _externalDataService = externalDataService!;
		externalDataService = undefined;

		await closeServer(_externalDataService);
	});

	async function getCurrentExternalData(): Promise<TaskData> {
		const fetchResponse = await externalDataSource!.fetchData();
		const responseBody = JSON.parse(fetchResponse.body.toString()) as Record<
			string | number | symbol,
			unknown
		>;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		return assertValidTaskData((responseBody as any).taskList);
	}

	// We have omitted `@types/supertest` due to cross-package build issue.
	// So for these tests we have to live with `any`.
	/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

	it("fetch-tasks: Ensure server yields the data we expect", async () => {
		const expectedData = await getCurrentExternalData();
		await request(externalDataService!)
			.get("/fetch-tasks")
			.expect(200, { taskList: expectedData });
	});

	it("set-tasks: Ensure external data is updated with provided data", async () => {
		const newData: TaskData = {
			42: {
				name: "Determine meaning of life",
				priority: 37,
			},
		};
		await request(externalDataService!)
			.post("/set-tasks")
			.send({ taskList: newData })
			.expect(200);

		const currentData = await getCurrentExternalData();
		expect(currentData).toEqual(newData);
	});

	it("set-tasks: Ensure server rejects update with no data", async () => {
		const oldData = await getCurrentExternalData();
		await request(externalDataService!).post("/set-tasks").send().expect(400);

		const currentData = await getCurrentExternalData();
		expect(currentData).toEqual(oldData); // Sanity check that we didn't blow away data
	});

	it("set-tasks: Ensure server rejects update with malformed data", async () => {
		const oldData = await getCurrentExternalData();
		await request(externalDataService!)
			.post("/set-tasks")
			.send({ tasks: "42:Determine meaning of life:37" })
			.expect(400);

		const currentData = await getCurrentExternalData();
		expect(currentData).toEqual(oldData); // Sanity check that we didn't blow away data
	});

	it("register-for-webhook: Registering valid URI succeeds", async () => {
		await request(externalDataService!)
			.post("/register-for-webhook")
			.send({ url: "https://www.fluidframework.com" })
			.expect(200);
	});

	it("register-for-webhook: Registering invalid URI fails", async () => {
		await request(externalDataService!)
			.post("/register-for-webhook")
			.send({ url: "I am not a URI" })
			.expect(400);
	});

	/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
	/* eslint-enable @typescript-eslint/no-non-null-assertion */
});

describe("mock-external-data-service: webhook", () => {
	let externalDataService: Server | undefined;

	beforeEach(async () => {
		externalDataService = await initializeExternalDataService({
			port: externalDataServicePort,
		});
	});

	/* eslint-disable @typescript-eslint/no-non-null-assertion */

	afterEach(async () => {
		const _externalDataService = externalDataService!;
		externalDataService = undefined;

		await closeServer(_externalDataService);
	});

	it("register-for-webhook", async () => {
		// Set up mock local service, which will be registered as webhook listener
		const localServicePort = 5002;
		const localServiceApp = express();
		localServiceApp.use(express.json());
		localServiceApp.use(cors());

		// Bind listener
		let wasHookNotifiedForChange = false;
		localServiceApp.post("/broadcast-signal", (_, result) => {
			wasHookNotifiedForChange = true;
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
						url: `http://localhost:${localServicePort}/broadcast-signal`,
					}),
				},
			);

			if (!webhookRegistrationResponse.ok) {
				fail(`Webhook registration failed. Code: ${webhookRegistrationResponse.status}.`);
			}

			// Update external data
			const dataUpdateResponse = await fetch(
				`http://localhost:${externalDataServicePort}/set-tasks`,
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
			expect(wasHookNotifiedForChange).toBe(true);
		} finally {
			await closeServer(localService);
		}
	});

	/* eslint-enable @typescript-eslint/no-non-null-assertion */
});
