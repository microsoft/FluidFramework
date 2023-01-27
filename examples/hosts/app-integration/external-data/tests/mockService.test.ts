/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Server } from "http";

import request from "supertest";

import { ExternalDataSource, initializeCustomerService } from "../src/mock-service";
import { TaskData } from "../src/model-interface";

/* eslint-disable @typescript-eslint/no-non-null-assertion */

describe("mockCustomerService", () => {
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
	let server: Server | undefined;

	beforeEach(async () => {
		externalDataSource = new ExternalDataSource();
		server = await initializeCustomerService({
			externalDataSource,
			port: 5326, // A different port than the default to ensure we don't conflict with background service
		});
	});

	afterEach(async () => {
		await new Promise<void>((resolve, reject) => {
			const _server = server!;
			server = undefined;
			externalDataSource!.debugResetData();

			_server.close(() => {
				resolve();
			});
		});
	});

	// We have omitted `@types/supertest` due to cross-package build issue.
	// So for these tests we have to live with `any`.
	/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

	it("fetch-tasks: Ensure server yields the data we expect", async () => {
		const expectedData = await externalDataSource!.fetchData().then((data) => {
			return JSON.parse(data.body.toString()) as object;
		});
		await request(server!).get("/fetch-tasks").expect(200, expectedData);
	});

	it("set-tasks: Ensure external data is updated with provided data", async () => {
		const newData = {
			42: {
				name: "Determine meaning of life",
				priority: 37,
			},
		};

		await request(server!).post("/set-tasks").send({ taskList: newData }).expect(200);
		const externalData = await externalDataSource!.fetchData();
		const parsed = JSON.parse(externalData.body.toString()).taskList as TaskData;
		expect(parsed).toEqual(newData);
	});

	it("set-tasks: Ensure server rejects update with no data", async () => {
		const oldData = await externalDataSource!.fetchData();
		await request(server!).post("/set-tasks").send().expect(400);

		const externalData = await externalDataSource!.fetchData();
		expect(externalData).toEqual(oldData); // Sanity check that we didn't blow away data
	});

	it("set-tasks: Ensure server rejects update with malformed data", async () => {
		const oldData = await externalDataSource!.fetchData();
		await request(server!)
			.post("/set-tasks")
			.send({ tasks: "42:Determine meaning of life:37" })
			.expect(400);

		const externalData = await externalDataSource!.fetchData();
		expect(externalData).toEqual(oldData); // Sanity check that we didn't blow away data
	});

	it("register-for-webhook: Registering valid URI succeeds", async () => {
		await request(server!)
			.post("/register-for-webhook")
			.send({ url: "https://www.fluidframework.com" })
			.expect(200);
	});

	it("register-for-webhook: Registering invalid URI fails", async () => {
		await request(server!)
			.post("/register-for-webhook")
			.send({ url: "I am not a URI" })
			.expect(400);
	});

	/* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
});

/* eslint-enable @typescript-eslint/no-non-null-assertion */
