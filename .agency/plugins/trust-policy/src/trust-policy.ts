#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { redact } from "@npmcli/redact";
import { Command, Flags, execute } from "@oclif/core";
import semver from "semver";
import {
	checkPackage,
	defaultRegistry,
	type PackageCheckResult,
	type Verdict,
} from "./packageCheck.js";
import {
	azureArtifactsReason,
	describeUnreachableEndpoints,
	type EndpointAccess,
	formatEndpointAccess,
	isAzureArtifactsRegistry,
	npmRegistryEndpoint,
	probeEndpoints,
	sigstoreTufEndpoint,
} from "./registryAccess.js";

/**
 * Checks whether one exact package version has trustworthy provenance and, if not, suggests an attested alternative.
 */
export default class CheckTrustPolicyCommand extends Command {
	static readonly summary = "Verify a package version's provenance before installing it.";
	static readonly description =
		"Check one exact name@version against a cryptographic (default), registry-metadata, or no-downgrade provenance policy, and suggest an attested alternative when it is rejected. Provenance does not establish that package code is harmless.";
	static readonly enableJsonFlag = true;
	static readonly flags = {
		package: Flags.string({
			description: "Exact name@version to check.",
			required: true,
		}),
		policy: Flags.string({
			description: "Policy to apply (default: cryptographic).",
			options: ["cryptographic", "metadata", "no-downgrade"] as const,
		}),
		registry: Flags.string({
			description: "HTTPS registry to query (default: https://registry.npmjs.org).",
		}),
		"max-candidates": Flags.integer({
			description: "Maximum alternative releases to check (default: 20).",
			min: 1,
		}),
		"registry-check": Flags.boolean({
			description:
				"Probe the registry and Sigstore endpoints the check needs and report whether they are reachable. Probes are diagnostic only and do not stop the check.",
			default: true,
			allowNo: true,
		}),
		quiet: Flags.boolean({
			description: "Disable logging.",
			default: false,
		}),
	} as const;

	public async run(): Promise<PackageCheckResult & { endpointAccess?: EndpointAccess[] }> {
		const { flags } = await this.parse(CheckTrustPolicyCommand);
		if (flags.registry !== undefined && isAzureArtifactsRegistry(flags.registry)) {
			this.error(
				`--registry ${redact(flags.registry)} is an Azure Artifacts feed. ${azureArtifactsReason} Omit --registry to use https://registry.npmjs.org, or pass a registry that serves npm attestations.`,
			);
		}
		const policy = flags.policy ?? "cryptographic";
		if (policy !== "cryptographic" && policy !== "metadata" && policy !== "no-downgrade") {
			this.error(`Unsupported package policy: ${policy}`);
		}
		let endpointAccess: EndpointAccess[] | undefined;
		if (flags["registry-check"]) {
			const needed = [
				npmRegistryEndpoint(
					flags.registry ?? defaultRegistry,
					"package metadata and attestations",
				),
			];
			if (policy === "cryptographic") {
				needed.push(sigstoreTufEndpoint("Sigstore trusted root for verification"));
			}
			endpointAccess = await probeEndpoints(needed);
			if (!flags.quiet) {
				this.log("Network access (from Node.js):");
				for (const line of formatEndpointAccess(endpointAccess)) {
					this.log(line);
				}
				const warning = describeUnreachableEndpoints(endpointAccess);
				if (warning !== undefined) {
					this.logToStderr(warning);
				}
			}
		}
		const result = await checkPackage(flags.package, {
			policy,
			...(flags.registry === undefined ? {} : { registry: flags.registry }),
			...(flags["max-candidates"] === undefined
				? {}
				: { maxCandidates: flags["max-candidates"] }),
		});
		if (!flags.quiet) {
			this.log(
				`${flags.package}: ${describeVerdict(result.requested.verdict)} (${result.policy})`,
			);
			this.log(result.requested.reason);
			if (result.alternative) {
				this.log(
					`Alternative: ${result.alternative.name}@${result.alternative.version} — ${result.alternative.reason}`,
				);
			} else if (result.requested.verdict === "rejected") {
				this.log("No acceptable alternative found within the search limit.");
			}
			if (result.auditIncomplete) {
				this.logToStderr(
					`WARNING: Incomplete verification or alternative search. ${result.errors.join("; ")}`,
				);
			}
			this.log(result.disclaimer);
		}
		if (
			!this.jsonEnabled() &&
			(result.requested.verdict !== "accepted" || result.auditIncomplete)
		) {
			this.exit(1);
		}
		return endpointAccess === undefined ? result : { ...result, endpointAccess };
	}
}

function describeVerdict(verdict: Verdict): string {
	switch (verdict) {
		case "accepted": {
			return "meets policy";
		}
		case "rejected": {
			return "does not meet policy";
		}
		default: {
			return "INCONCLUSIVE, verification could not complete";
		}
	}
}

/**
 * Whether this module is the process entry point.
 * `import.meta.main` is undefined before Node.js 22.18 and 24.2, so fall back to comparing paths rather than silently doing nothing.
 */
function isEntryPoint(): boolean {
	const entry = process.argv[1];
	return (
		import.meta.main ??
		(entry !== undefined && realpathSync(entry) === fileURLToPath(import.meta.url))
	);
}

if (isEntryPoint()) {
	// npm only warns about unsupported engines unless engine-strict is set, so check at run time too.
	const { engines } = JSON.parse(
		readFileSync(new URL("../package.json", import.meta.url), "utf8"),
	) as { engines: { node: string } };
	if (semver.satisfies(process.versions.node, engines.node)) {
		// Not awaited: oclif imports this module to load the command, which would wait on its own evaluation.
		void execute({ dir: import.meta.url });
	} else {
		console.error(
			`check-trust-policy requires Node.js ${engines.node}; this is Node.js ${process.versions.node}.`,
		);
		process.exitCode = 1;
	}
}
