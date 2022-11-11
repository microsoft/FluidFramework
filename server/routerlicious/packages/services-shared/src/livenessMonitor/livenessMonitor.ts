/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChecker, ILivenessMonitor } from "@fluidframework/server-services-core";
import { LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";
import { Router } from "express";
import { handleResponse } from "../http";

export class LivenessMonitor implements ILivenessMonitor {
	private static instance: LivenessMonitor;
	private readonly checkerMap: Map<string, () => Promise<void>> = new Map();

	public static getInstance(checkList: IChecker[]): LivenessMonitor {
		if (!this.instance) {
			this.instance = new LivenessMonitor(checkList);
		}
		return this.instance;
	}

	public constructor(
		checkList: IChecker[],
	) {
		checkList.forEach((checker) => {
			this.checkerMap.set(checker.checkerName, checker.checker);
		});
	}

	registerChecker(checker: IChecker): void {
		this.checkerMap.set(checker.checkerName, checker.checker);
	}

	unregisterChecker(name: string): void {
		this.checkerMap.delete(name);
	}

	public async check(): Promise<void> {
		const metric = Lumberjack.newLumberMetric(LumberEventName.LivenessMonitor);
		try {
			for (const [checkerName, checker] of this.checkerMap) {
				Lumberjack.info(`Running checker ${checkerName}`);
				await checker();
			}
			metric.success("livenessCheck failed");
		} catch (err) {
			metric.error("livenessCheck failed", err);
			throw err;
		}
	}
}

export function livenessRoutes(livenessMonitor: ILivenessMonitor): Router {
	const router: Router = Router();
	router.get("/live", (req, res) => {
		const checkP = livenessMonitor.check();
		handleResponse(checkP, res, false, 500);
	});
	return router;
}
