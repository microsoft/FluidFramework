/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ConfigurationError, loadConfiguration } from "./configuration.mjs";
import { safeErrorMessage } from "./errors.mjs";

const execFileAsync = promisify(execFile);

export async function checkDependencies(
	load = () => import("@fluidframework/server-services-client"),
) {
	try {
		await load();
	} catch (error) {
		if (error?.code !== "ERR_MODULE_NOT_FOUND" && error?.code !== "MODULE_NOT_FOUND")
			throw error;
		throw new ConfigurationError([
			"Copy dependencies are missing. Run `pnpm install --ignore-workspace` from tools/selfhost/copy-data before creating tenants or copying documents.",
		]);
	}
}

/** Check each running Alfred replica without changing the caller's Kubernetes context. */
export async function verifyDeployment(config, execute = execFileAsync) {
	const directory = await mkdtemp(path.join(os.tmpdir(), "selfhost-copy-preflight-"));
	const kubeconfig = path.join(directory, "kubeconfig");
	const run = async (command, args) => {
		try {
			return await execute(command, args, { maxBuffer: 8 * 1024 * 1024, timeout: 120_000 });
		} catch (error) {
			throw new ConfigurationError([
				error?.code === "ENOENT"
					? `${command} is required for the migration deployment check.`
					: `Migration deployment check failed while running ${command}. Verify Azure sign-in, AKS access, and that Alfred is running; no tenants or documents were created by this check.`,
			]);
		}
	};
	try {
		await run("az", [
			"aks",
			"get-credentials",
			"--subscription",
			config.selfHost.subscriptionId,
			"--resource-group",
			config.selfHost.resourceGroup,
			"--name",
			config.selfHost.aksName,
			"--file",
			kubeconfig,
			"--overwrite-existing",
		]);
		const kubectlArgs = ["--kubeconfig", kubeconfig, "--namespace", config.selfHostNamespace];
		const { stdout } = await run("kubectl", [
			...kubectlArgs,
			"get",
			"pods",
			"--selector",
			"app=routerlicious,component=alfred,release=fluid",
			"--output",
			"json",
		]);
		let pods;
		try {
			pods = JSON.parse(stdout).items;
		} catch {
			throw new ConfigurationError(["Unable to parse the Alfred pod list."]);
		}
		if (!Array.isArray(pods) || pods.length === 0)
			throw new ConfigurationError([
				"No Alfred replicas were found in the selected namespace.",
			]);
		for (const pod of pods) {
			if (
				typeof pod.metadata?.name !== "string" ||
				pod.metadata.deletionTimestamp ||
				pod.status?.phase !== "Running" ||
				!pod.status.containerStatuses?.length ||
				!pod.status.containerStatuses.every((container) => container.ready)
			) {
				throw new ConfigurationError([
					"Wait for every Alfred replica to finish starting or rolling out before copying.",
				]);
			}
			// Use the pod's file and environment providers, but print only this non-secret flag.
			const expression =
				'const nconf = require(require.resolve("nconf",{paths:["./packages/routerlicious"]})); nconf.env({separator:"__",parseValues:true}).file({file:"packages/routerlicious/config/config.json"}); process.stdout.write(JSON.stringify(nconf.get("alfred:enforceServerGeneratedDocumentId")) ?? "null");';
			const result = await run("kubectl", [
				...kubectlArgs,
				"exec",
				pod.metadata.name,
				"--container",
				"fluid-alfred",
				"--",
				"node",
				"-e",
				expression,
			]);
			if (result.stdout.trim() !== "false")
				throw new ConfigurationError([
					"Every Alfred replica must explicitly set alfred.enforceServerGeneratedDocumentId to false. Apply the selfhost Helm values and complete the rollout before copying; the setting controls document IDs, not tenant IDs.",
				]);
		}
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
	console.log("Migration deployment check passed: all Alfred replicas preserve document IDs.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		await checkDependencies();
		const args = process.argv.slice(2);
		if (args.length !== 2 || args[0] !== "--config")
			throw new ConfigurationError(["Usage: node check-deployment.mjs --config <path>"]);
		const { config } = await loadConfiguration(args[1]);
		await verifyDeployment(config);
	} catch (error) {
		console.error(`Migration preflight failed: ${safeErrorMessage(error)}`);
		process.exitCode = 1;
	}
}
