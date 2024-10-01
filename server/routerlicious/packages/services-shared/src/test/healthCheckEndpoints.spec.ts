/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import request from "supertest";
import express from "express";
import { createHealthCheckEndpoints } from "../healthCheckEndpoints";
import { StartupChecker } from "../startupChecker";
import { TestReadinessCheck } from "@fluidframework/server-test-utils";

describe("Health Check Endpoints", () => {
	let app: express.Express;
	let supertest: request.SuperTest<request.Test>;
	let readinessCheck: TestReadinessCheck;

	const setupApp = (useReadinessCheck = false) => {
		app = express();
		readinessCheck = useReadinessCheck ? new TestReadinessCheck() : undefined;
		const healthCheckEndpoints = createHealthCheckEndpoints("testService", readinessCheck);
		StartupChecker.getInstance()["isReady"] = false;
		app.use(healthCheckEndpoints);
		supertest = request(app);
	};

	[true, false].forEach((useReadinessCheck) => {
		describe(`Health Check Endpoints ${
			useReadinessCheck ? "using readiness check" : "not using readiness check"
		}`, () => {
			beforeEach(() => {
				setupApp(useReadinessCheck);
			});
			it("should return 200 for /startup when startup is complete", async () => {
				StartupChecker.getInstance().setReady();
				const req = supertest.get("/startup");
				await req.expect(200);
			});
			it("should return 500 for /startup when startup is not complete", async () => {
				const req = supertest.get("/startup");
				await req.expect(500);
			});
			it("should return 200 for /ping", async () => {
				const req = supertest.get("/ping");
				await req.expect(200);
			});
			if (useReadinessCheck) {
				it("should return 503 for /ready when readiness check fails", async () => {
					const req = supertest.get("/ready");
					await req.expect(503);
				});
				it("should return 503 for /ready when readiness throws an exception", async () => {
					readinessCheck.setThrowException();
					const req = supertest.get("/ready");
					await req.expect(503);
				});
				it("should return 200 for /ready when readiness check is successful", async () => {
					readinessCheck.setReady();
					const req = supertest.get("/ready");
					await req.expect(200);
				});
			} else {
				it("should return 404 for /ready when readiness check is not used", async () => {
					const req = supertest.get("/ready");
					await req.expect(404);
				});
			}
		});
	});
});
