/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type {
	PackageInRegistry,
	PackageMeta,
	PackageMetaWithTime,
} from "@pnpm/resolving.registry.types";
import {
	checkPackage,
	type PackageServices,
	parsePackageSpec,
	type ProvenanceVerificationServices,
	type RegistryKey,
	verifyNpmSlsaProvenance,
} from "../package-check.js";

const registry = "https://registry.npmjs.org";
const predicateType = "https://slsa.dev/provenance/v1";

function manifest(version: string, attested = true): PackageInRegistry {
	return {
		name: "example",
		version,
		dist: {
			shasum: "",
			tarball: `https://registry.npmjs.org/example/-/example-${version}.tgz`,
			...(attested ? { attestations: { provenance: { predicateType } } } : {}),
		},
	};
}

function packument(): PackageMetaWithTime {
	return {
		name: "example",
		"dist-tags": {},
		versions: {
			"1.0.0": manifest("1.0.0", false),
			"1.1.0": manifest("1.1.0"),
			"2.0.0": manifest("2.0.0"),
			"3.0.0-beta.1": manifest("3.0.0-beta.1"),
		},
		time: {
			"1.0.0": "2020-01-01",
			"1.1.0": "2020-02-01",
			"2.0.0": "2020-03-01",
			"3.0.0-beta.1": "2020-04-01",
		},
	};
}

function services(
	data: PackageMeta,
	verify: PackageServices["verify"] = async () => {
		throw new Error("Must not verify");
	},
): PackageServices {
	return { load: async () => data, verify };
}

test("exact package specs support scopes and reject ranges, tags, aliases, and URLs", () => {
	assert.deepEqual(parsePackageSpec("@scope/name@1.2.3"), {
		name: "@scope/name",
		version: "1.2.3",
	});
	for (const spec of [
		"example",
		"example@latest",
		"example@^1",
		"https://example.com",
		"example@1.02.3",
		"example@v1.2.3",
		"alias@npm:example@1.2.3",
		"Invalid Name@1.2.3",
	]) {
		assert.throws(() => parsePackageSpec(spec), /exact registry package version|Invalid/);
	}
});

test("cryptographic default rejects missing provenance and verifies newest stable alternative", async () => {
	const verified: string[] = [];
	const result = await checkPackage(
		"example@1.0.0",
		{},
		services(packument(), async (pin) => {
			verified.push(pin.version);
			return { verified: true, reason: "verified" };
		}),
	);
	assert.equal(result.policy, "cryptographic");
	assert.equal(result.requested.verdict, "rejected");
	assert.equal(result.alternative?.version, "2.0.0");
	assert.equal(result.alternative?.provenanceVerified, true);
	assert.deepEqual(verified, ["2.0.0"]);
	assert.equal(result.auditIncomplete, false);
});

test("metadata is opt-in and never claims cryptographic verification", async () => {
	const result = await checkPackage(
		"example@1.1.0",
		{ policy: "metadata" },
		services(packument()),
	);
	assert.equal(result.requested.verdict, "accepted");
	assert.equal(result.requested.provenanceVerified, false);
	assert.equal(result.alternative, null);
});

test("no-downgrade follows pnpm: publication order, trust evidence ranking, and prerelease exclusion", async () => {
	const check = async (spec: string, data: PackageMeta) =>
		checkPackage(
			spec,
			{ policy: "no-downgrade" },
			services(data, async () => ({ verified: true, reason: "verified" })),
		);

	const republished = packument();
	republished.time["1.0.0"] = "2020-03-15";
	const downgrade = await check("example@1.0.0", republished);
	assert.equal(downgrade.requested.verdict, "rejected");
	assert.match(downgrade.requested.reason, /provenance attestation.*no trust evidence/);
	assert.ok(downgrade.alternative?.provenanceVerified);

	const first = await check("example@1.0.0", packument());
	assert.equal(first.requested.verdict, "accepted");
	assert.equal(first.requested.provenanceVerified, false);

	const trustedPublisher = packument();
	const earlier = trustedPublisher.versions["1.1.0"];
	assert.ok(earlier);
	earlier._npmUser = { trustedPublisher: { id: "github", oidcConfigId: "oidc" } };
	assert.equal((await check("example@2.0.0", trustedPublisher)).requested.verdict, "rejected");

	// pnpm ranks a trusted publisher only when provenance is also present.
	const publisherOnly = packument();
	const unattested = publisherOnly.versions["1.0.0"];
	assert.ok(unattested);
	unattested._npmUser = { trustedPublisher: { id: "github", oidcConfigId: "oidc" } };
	assert.equal((await check("example@1.1.0", publisherOnly)).requested.verdict, "accepted");

	const staged = packument();
	const approved = staged.versions["1.1.0"];
	assert.ok(approved);
	approved._npmUser = { approver: { name: "maintainer" } };
	assert.match(
		(await check("example@2.0.0", staged)).requested.reason,
		/staged publish.*provenance attestation/,
	);

	const prereleaseOnly = packument();
	prereleaseOnly.time["3.0.0-beta.1"] = "2019-01-01";
	delete prereleaseOnly.versions["1.1.0"];
	delete prereleaseOnly.versions["2.0.0"];
	assert.equal((await check("example@1.0.0", prereleaseOnly)).requested.verdict, "accepted");

	// pnpm skips earlier releases without a publication time.
	const undated = packument();
	undated.time["1.0.0"] = "2020-03-15";
	delete undated.time["1.1.0"];
	delete undated.time["2.0.0"];
	assert.equal((await check("example@1.0.0", undated)).requested.verdict, "accepted");
});

test("deprecated and invalid candidates are skipped and search exhaustion is explicit", async () => {
	const data = packument();
	const newest = data.versions["2.0.0"];
	assert.ok(newest);
	newest.deprecated = "Do not use";
	const rejectAll: PackageServices["verify"] = async () => ({
		verified: false,
		reason: "bad signature",
	});
	const result = await checkPackage("example@1.0.0", {}, services(data, rejectAll));
	assert.equal(result.alternative, null);
	assert.equal(result.candidatesChecked, 1);
	assert.equal(result.auditIncomplete, false);
	const limited = await checkPackage(
		"example@1.0.0",
		{ maxCandidates: 1 },
		services(packument(), rejectAll),
	);
	assert.equal(limited.searchTruncated, true);
	assert.equal(limited.auditIncomplete, true);
});

test("operational verification failures are inconclusive, never accepted or rejected", async () => {
	const offline: PackageServices["verify"] = async () => {
		throw new TypeError("fetch failed");
	};
	const result = await checkPackage("example@1.1.0", {}, services(packument(), offline));
	assert.equal(result.requested.verdict, "inconclusive");
	assert.match(result.requested.reason, /could not complete/);
	// An inconclusive version is not known to be bad, so no alternative is suggested.
	assert.equal(result.candidatesChecked, 0);
	assert.equal(result.auditIncomplete, true);
	assert.ok(result.errors.some((error) => error.includes("fetch failed")));

	// Inconclusive candidates are skipped but leave the search incomplete.
	const flaky = await checkPackage(
		"example@1.0.0",
		{},
		services(packument(), async (pin) => {
			if (pin.version === "2.0.0") {
				throw new Error("TUF metadata refresh failed: offline");
			}
			return { verified: true, reason: "verified" };
		}),
	);
	assert.equal(flaky.alternative?.version, "1.1.0");
	assert.equal(flaky.auditIncomplete, true);
});

test("malformed identities, unknown packages, and missing dates fail explicitly", async () => {
	const data = packument();
	const target = data.versions["1.1.0"];
	assert.ok(target);
	target.name = "other";
	const loaded = services(data, async () => ({ verified: true, reason: "" }));
	await assert.rejects(checkPackage("example@1.1.0", {}, loaded), /identity/);
	await assert.rejects(checkPackage("example@9.0.0", {}, loaded), /not found/);
	delete data.time["1.0.0"];
	await assert.rejects(
		checkPackage("example@1.0.0", { policy: "no-downgrade" }, loaded),
		/publication time/,
	);
});

const semverPin = { name: "semver", version: "7.7.3" };
const publishPredicateType = "https://github.com/npm/attestation/tree/main/specs/publish/v0.1";
const registryKeys: RegistryKey[] = [{ keyid: "SHA256:key", pemkey: "PEM", expires: null }];

/**
 * Builds an attestation as pacote returns it, whose signed statement has the given predicate type.
 */
function attestation(signedPredicateType: string, listedPredicateType = signedPredicateType) {
	const statement = { predicateType: signedPredicateType };
	return {
		predicateType: listedPredicateType,
		bundle: {
			dsseEnvelope: { payload: Buffer.from(JSON.stringify(statement)).toString("base64") },
		},
	};
}

/**
 * Stubs pacote's manifest with a result or error, recording the options it receives.
 */
function pacoteStub(
	outcome: { bundles: unknown[] } | Error,
): ProvenanceVerificationServices & { calls: [string, Record<string, unknown>][] } {
	const calls: [string, Record<string, unknown>][] = [];
	return {
		calls,
		fetchKeys: async () => registryKeys,
		manifest: async (spec, options) => {
			calls.push([spec, options]);
			if (outcome instanceof Error) {
				throw outcome;
			}
			return { _attestationBundles: outcome.bundles };
		},
	};
}

function attestationError(code: string, message: string): Error {
	return Object.assign(new Error(message), { code });
}

test("provenance verifies when pacote verifies a signed SLSA provenance attestation", async () => {
	const stub = pacoteStub({
		bundles: [attestation(publishPredicateType), attestation(predicateType)],
	});
	const result = await verifyNpmSlsaProvenance(semverPin, registry, stub);
	assert.equal(result.verified, true);
	assert.deepEqual(stub.calls, [
		[
			"semver@7.7.3",
			{ registry, verifyAttestations: true, "//registry.npmjs.org/:_keys": registryKeys },
		],
	]);
});

test("publish attestations alone, relabeled attestations, and pacote verification failures are rejected", async () => {
	const reject = async (outcome: { bundles: unknown[] } | Error): Promise<string> => {
		const result = await verifyNpmSlsaProvenance(semverPin, registry, pacoteStub(outcome));
		assert.equal(result.verified, false);
		return result.reason;
	};
	assert.match(
		await reject({ bundles: [attestation(publishPredicateType)] }),
		/publish attestations/,
	);
	// The registry's listed predicate type is unsigned, so only the signed statement counts.
	assert.match(
		await reject({ bundles: [attestation(publishPredicateType, predicateType)] }),
		/publish attestations/,
	);
	for (const code of ["EATTESTATIONVERIFY", "EATTESTATIONSUBJECT", "EEXPIREDSIGNATUREKEY"]) {
		assert.match(await reject(attestationError(code, "bad")), /Invalid attestation: bad/);
	}
});

test("provenance verification throws for operational failures and registries without signing keys", async () => {
	await assert.rejects(
		verifyNpmSlsaProvenance(semverPin, registry, pacoteStub(new TypeError("fetch failed"))),
		/fetch failed/,
	);
	const noKeys = {
		...pacoteStub(attestationError("EMISSINGSIGNATUREKEY", "no key")),
		fetchKeys: async () => undefined,
	};
	await assert.rejects(
		verifyNpmSlsaProvenance(semverPin, registry, noKeys),
		/does not publish attestation signing keys/,
	);
	assert.deepEqual(noKeys.calls[0]?.[1], { registry, verifyAttestations: true });
	const missingKey = await verifyNpmSlsaProvenance(
		semverPin,
		registry,
		pacoteStub(attestationError("EMISSINGSIGNATUREKEY", "unknown keyid")),
	);
	assert.equal(missingKey.verified, false);
});
