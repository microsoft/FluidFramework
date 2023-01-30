/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Server } from "http";

import cors from "cors";
import express from "express";
import fetch from "node-fetch";

import { delay } from "@fluidframework/common-utils";

import { customerServicePort } from "../src/mock-service-interface";

describe("mockCustomerService", () => {
	it("register-for-webhook", async () => {
		// Set up mock local service, which will be registered as webhook listener
		const localServicePort = 5328;
		const localServiceApp = express();
		localServiceApp.use(express.json());
		localServiceApp.use(cors());

		// Bind listener
		let wasHookNotifiedForChange = false;
		localServiceApp.post("/task-list-hook", (request, result) => {
			console.log("TEST: Webhook called!");
			wasHookNotifiedForChange = true;
			result.send();
		});

		const server: Server = localServiceApp.listen(localServicePort);

		try {
			// Register with the external service for notifications
			const webhookRegistrationResponse = await fetch(
				`http://localhost:${customerServicePort}/register-for-webhook`,
				{
					method: "POST",
					headers: {
						"Access-Control-Allow-Origin": "*",
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						url: `http://localhost:${localServicePort}/task-list-hook`,
					}),
				},
			);

			if (!webhookRegistrationResponse.ok) {
				fail(`Webhook registration failed. Code: ${webhookRegistrationResponse.status}.`);
			}

			const newData = {
				42: {
					name: "Determine meaning of life",
					priority: 37,
				},
			};
			// Update external data
			const dataUpdateResponse = await fetch(
				`http://localhost:${customerServicePort}/set-tasks`,
				{
					method: "POST",
					headers: {
						"Access-Control-Allow-Origin": "*",
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ taskList: newData }),
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
			await new Promise<void>((resolve) => {
				server.close(() => {
					console.log("TEST: Closing local server.");
					resolve();
				});
			});
		}
	});
});
