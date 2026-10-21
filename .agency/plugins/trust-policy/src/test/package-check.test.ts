/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { bundleFromJSON } from "@sigstore/bundle";
import { TrustedRoot } from "@sigstore/protobuf-specs";
import { toSignedEntity, toTrustMaterial, Verifier } from "@sigstore/verify";
import { type BundleVerifier, TUFError } from "sigstore";
import {
	checkPackage,
	type PackageServices,
	parsePackageSpec,
	type ProvenanceVerificationServices,
	type RegistryPackage,
	type RegistryVersion,
	verifyNpmSlsaProvenance,
} from "../package-check.js";

const registry = "https://registry.npmjs.org";
const predicateType = "https://slsa.dev/provenance/v1";

function manifest(version: string, attested = true): RegistryVersion {
	return {
		name: "example",
		version,
		...(attested
			? {
					dist: {
						attestations: {
							url: `${registry}/attestations`,
							provenance: { predicateType },
						},
					},
				}
			: {}),
	};
}

function packument(): RegistryPackage {
	return {
		name: "example",
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
	data: RegistryPackage,
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
	const check = async (spec: string, data: RegistryPackage) =>
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
	earlier._npmUser = { trustedPublisher: { id: "github" } };
	assert.equal((await check("example@2.0.0", trustedPublisher)).requested.verdict, "rejected");

	// pnpm ranks a trusted publisher only when provenance is also present.
	const publisherOnly = packument();
	const unattested = publisherOnly.versions["1.0.0"];
	assert.ok(unattested);
	unattested._npmUser = { trustedPublisher: { id: "github" } };
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
				throw new TUFError({ code: "TUF_REFRESH_METADATA_ERROR", message: "offline" });
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

/**
 * Real registry responses for semver@7.7.3, captured from registry.npmjs.org, and the Sigstore public-good trusted root.
 * Together they allow genuine Sigstore verification without network access.
 */
function readFixture(name: string): unknown {
	return JSON.parse(
		readFileSync(new URL(`../../src/test/fixtures/${name}`, import.meta.url), "utf8"),
	);
}

const semverManifest = readFixture("semver-7.7.3-manifest.json") as RegistryVersion;
const semverAttestations = readFixture("semver-7.7.3-attestations.json") as {
	attestations: { predicateType: string; bundle: { dsseEnvelope: { payload: string } } }[];
};
const trustedRoot = TrustedRoot.fromJSON(readFixture("sigstore-trusted-root.json"));

/**
 * Builds a Sigstore verifier from the captured trusted root, matching the thresholds production uses.
 */
function offlineVerifier(): BundleVerifier {
	const verifier = new Verifier(toTrustMaterial(trustedRoot), {
		tlogThreshold: 1,
		ctlogThreshold: 1,
	});
	return { verify: (bundle) => verifier.verify(toSignedEntity(bundleFromJSON(bundle))) };
}

function offlineServices(
	attestations: unknown = semverAttestations,
): ProvenanceVerificationServices & {
	fetched: string[];
} {
	const fetched: string[] = [];
	return {
		fetched,
		fetcher: async (input) => {
			fetched.push(String(input));
			return Response.json(structuredClone(attestations));
		},
		getVerifier: async () => offlineVerifier(),
	};
}

const semverPin = { name: "semver", version: "7.7.3" };

test("real npm SLSA provenance verifies against Sigstore and the registry integrity", async () => {
	const fixture = offlineServices();
	const result = await verifyNpmSlsaProvenance(semverPin, semverManifest, registry, fixture);
	assert.deepEqual(
		{ verified: result.verified, fetched: fixture.fetched },
		{ verified: true, fetched: [semverManifest.dist?.attestations?.url] },
	);
});

test("provenance for a different artifact, a forged statement, or only publish attestations is rejected", async () => {
	const reject = async (
		pin: typeof semverPin,
		version: RegistryVersion,
		attestations: unknown = semverAttestations,
	): Promise<string> => {
		const result = await verifyNpmSlsaProvenance(
			pin,
			version,
			registry,
			offlineServices(attestations),
		);
		assert.equal(result.verified, false);
		return result.reason;
	};

	assert.match(await reject({ name: "semver", version: "7.7.2" }, semverManifest), /subject/);

	const otherTarball = structuredClone(semverManifest);
	assert.ok(otherTarball.dist);
	otherTarball.dist.integrity = `sha512-${Buffer.alloc(64, 1).toString("base64")}`;
	assert.match(await reject(semverPin, otherTarball), /integrity/);

	const forged = structuredClone(semverAttestations);
	for (const { bundle } of forged.attestations) {
		const statement = JSON.parse(
			Buffer.from(bundle.dsseEnvelope.payload, "base64").toString(),
		);
		statement.subject[0].digest.sha512 = "0".repeat(128);
		bundle.dsseEnvelope.payload = Buffer.from(JSON.stringify(statement)).toString("base64");
	}
	assert.match(await reject(semverPin, semverManifest, forged), /Invalid provenance/);

	const publishOnly = {
		attestations: semverAttestations.attestations.filter(
			(entry) => entry.predicateType !== predicateType,
		),
	};
	assert.match(await reject(semverPin, semverManifest, publishOnly), /publish attestations/);
});

test("provenance verification throws for operational failures and foreign attestation hosts", async () => {
	await assert.rejects(
		verifyNpmSlsaProvenance(semverPin, semverManifest, registry, {
			...offlineServices(),
			fetcher: async () => {
				throw new TypeError("fetch failed");
			},
		}),
		/fetch failed/,
	);
	await assert.rejects(
		verifyNpmSlsaProvenance(semverPin, semverManifest, registry, {
			...offlineServices(),
			getVerifier: async () => {
				throw new TUFError({ code: "TUF_REFRESH_METADATA_ERROR", message: "TUF offline" });
			},
		}),
		/TUF offline/,
	);
	await assert.rejects(
		verifyNpmSlsaProvenance(
			semverPin,
			semverManifest,
			"https://mirror.example.com",
			offlineServices(),
		),
		/registry origin/,
	);
});
