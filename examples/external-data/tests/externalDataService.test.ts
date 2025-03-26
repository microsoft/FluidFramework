/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Server } from "node:http";

import cors from "cors";
import express from "express";
import request from "supertest";

import {
	ExternalDataSource,
	MockWebhook,
	initializeExternalDataService,
} from "../src/mock-external-data-service/index.js";
import { externalDataServicePort } from "../src/mock-external-data-service-interface/index.js";
import { ITaskData, assertValidTaskData } from "../src/model-interface/index.js";

import { closeServer, delay } from "./utilities.js";

const externalTaskListId = "task-list-1";

const newData: ITaskData = {
	42: {
		name: "Determine meaning of life",
		priority: 37,
	},
};

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

	/**
	 * Datastore mapping of external resource id to its subscribers.
	 *
	 * @defaultValue A new new map will be initialized.
	 */
	let webhookCollection: Map<string, MockWebhook<ITaskData>>;

	beforeEach(async () => {
		externalDataSource = new ExternalDataSource();
		webhookCollection = new Map<string, MockWebhook<ITaskData>>();
		externalDataService = await initializeExternalDataService({
			port: externalDataServicePort,
			externalDataSource,
			webhookCollection,
		});
	});

	/* eslint-disable @typescript-eslint/no-non-null-assertion */

	afterEach(async () => {
		externalDataSource = undefined;

		const _externalDataService = externalDataService!;
		externalDataService = undefined;

		await closeServer(_externalDataService);
	});

	async function getCurrentExternalData(): Promise<ITaskData> {
		const fetchResponse = await externalDataSource!.fetchData(externalTaskListId);
		const responseText = await fetchResponse.text();
		const responseBody = JSON.parse(responseText) as Record<string | number | symbol, unknown>;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		return assertValidTaskData((responseBody as any).taskList);
	}

	// We have omitted `@types/supertest` due to cross-package build issue.
	// So for these tests we have to live with `any`.
	/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
	it("fetch-tasks: Ensure server yields the data we expect", async () => {
		const expectedData = await getCurrentExternalData();
		await request(externalDataService!)
			.get(`/fetch-tasks/${externalTaskListId}`)
			.expect(200, { taskList: expectedData });
	});

	// TODO: figure out a way to mock the webhookCollection or instantiate in the tests so that this test passes
	it("set-tasks: Ensure external data is updated with provided data", async () => {
		await request(externalDataService!)
			.post(`/set-tasks/${externalTaskListId}`)
			.send({ taskList: newData })
			.expect(200);

		const currentData = await getCurrentExternalData();
		expect(currentData).toEqual(newData);
	});

	it("set-tasks: Ensure server rejects update with no data", async () => {
		const oldData = await getCurrentExternalData();
		await request(externalDataService!)
			.post(`/set-tasks/${externalTaskListId}`)
			.send()
			.expect(400);

		const currentData = await getCurrentExternalData();
		expect(currentData).toEqual(oldData); // Sanity check that we didn't blow away data
	});

	it("set-tasks: Ensure server rejects update with malformed data", async () => {
		const oldData = await getCurrentExternalData();
		await request(externalDataService!)
			.post(`/set-tasks/${externalTaskListId}`)
			.send({ tasks: "42:Determine meaning of life:37" })
			.expect(400);

		const currentData = await getCurrentExternalData();
		expect(currentData).toEqual(oldData); // Sanity check that we didn't blow away data
	});

	it("register-for-webhook: Registering valid URI succeeds", async () => {
		await request(externalDataService!)
			.post(`/register-for-webhook`)
			.send({ url: "https://www.fluidframework.com", externalTaskListId })
			.expect(200);
	});

	it("register-for-webhook: Registering invalid URI fails", async () => {
		// missing url
		await request(externalDataService!)
			.post(`/register-for-webhook`)
			.send({ externalTaskListId })
			.expect(400);
		// invalid uri
		await request(externalDataService!)
			.post(`/register-for-webhook`)
			.send({ url: "I am not a URI", externalTaskListId })
			.expect(400);
		// invalid data type
		await request(externalDataService!)
			.post(`/register-for-webhook`)
			.send({ url: 123, externalTaskListId })
			.expect(400);
	});

	it("register-for-webhook: Registering missing/invalid externalTaskListId fails", async () => {
		// missing externalTaskListId
		await request(externalDataService!)
			.post(`/register-for-webhook`)
			.send({ url: "https://www.fluidframework.com" })
			.expect(400);
		// invalid data type
		await request(externalDataService!)
			.post(`/register-for-webhook`)
			.send({ url: "https://www.fluidframework.com", externalTaskListId: 123 })
			.expect(400);
	});

	it("unregister-webhook: Unregistering from an existing webhook with a valid URI succeeds", async () => {
		await request(externalDataService!)
			.post(`/register-for-webhook`)
			.send({ url: "https://www.fluidframework.com", externalTaskListId })
			.expect(200);

		await request(externalDataService!)
			.post(`/unregister-webhook`)
			.send({ url: "https://www.fluidframework.com", externalTaskListId })
			.expect(200);
	});

	it("unregister-webhook: Unregistering from an webhook that doesn't exist fails", async () => {
		await request(externalDataService!)
			.post(`/unregister-webhook`)
			.send({ url: "https://www.thefirstSubscriber.com", externalTaskListId })
			.expect(400);
	});

	it("unregister-webhook: Unregistering from an webhook that exists but the provided subscriber is not subscribed to succeeds", async () => {
		await request(externalDataService!)
			.post(`/register-for-webhook`)
			.send({ url: "https://www.thefirstSubscriber.com", externalTaskListId })
			.expect(200);

		await request(externalDataService!)
			.post(`/unregister-webhook`)
			.send({ url: "https://www.theSecondSubscriber.com", externalTaskListId })
			.expect(200);
	});

	it("unregister-webhook: Invalid request with missing/invalid url fails", async () => {
		// invalid url
		await request(externalDataService!)
			.post(`/unregister-webhook`)
			.send({ url: "not a url", externalTaskListId })
			.expect(400);
		// missing url
		await request(externalDataService!).post(`/unregister-webhook`).send({}).expect(400);
		// invalid data type
		await request(externalDataService!)
			.post(`/unregister-webhook`)
			.send({ url: 123, externalTaskListId })
			.expect(400);
	});

	it("unregister-webhook: Invalid request with missing/invalid externalTaskListId fails", async () => {
		// missing externalTaskListId
		await request(externalDataService!)
			.post(`/unregister-webhook`)
			.send({ url: "https://www.thefirstSubscriber.com" })
			.expect(400);
		// invalid externalTaskListId data type
		await request(externalDataService!)
			.post(`/unregister-webhook`)
			.send({ url: "https://www.thefirstSubscriber.com", externalTaskListId: 123 })
			.expect(400);
	});

	/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
	/* eslint-enable @typescript-eslint/no-non-null-assertion */
});

describe("mock-external-data-service: webhook", () => {
	let externalDataService: Server | undefined;
	let webhookCollection: Map<string, MockWebhook<ITaskData>>;

	beforeEach(async () => {
		webhookCollection = new Map<string, MockWebhook<ITaskData>>();
		externalDataService = await initializeExternalDataService({
			port: externalDataServicePort,
			webhookCollection,
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
			expect(wasHookNotifiedForChange).toBe(true);
		} finally {
			await closeServer(localService);
		}
	});

	/* eslint-enable @typescript-eslint/no-non-null-assertion */
});
