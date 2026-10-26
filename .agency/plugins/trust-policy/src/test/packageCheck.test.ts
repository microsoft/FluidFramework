/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type {
	PackageInRegistry,
	PackageMeta,
	PackageMetaWithTime,
} from "@pnpm/resolving.registry.types";
import { TUFError } from "@sigstore/tuf";
import npmFetch from "npm-registry-fetch";
import {
	checkPackage,
	isOperationalError,
	type PackageServices,
	parsePackageSpec,
	type ProvenanceVerificationServices,
	type RegistryKey,
	verifyNpmSlsaProvenance,
} from "../packageCheck.js";

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

test("alternatives must pass the requested policy, not only cryptographic verification", async () => {
	// 1.0.0 has a trusted publisher; 2.0.0 and 3.0.0 have only provenance, a downgrade from 1.0.0.
	const data = packument();
	data.versions = {
		"1.0.0": {
			...manifest("1.0.0"),
			_npmUser: { trustedPublisher: { id: "github", oidcConfigId: "oidc" } },
		},
		"2.0.0": manifest("2.0.0"),
		"3.0.0": manifest("3.0.0"),
	};
	data.time = { "1.0.0": "2020-01-01", "2.0.0": "2020-02-01", "3.0.0": "2020-03-01" };

	const result = await checkPackage(
		"example@2.0.0",
		{ policy: "no-downgrade" },
		services(data),
	);
	assert.equal(result.requested.verdict, "rejected");
	// 3.0.0 is newer but is also a downgrade, so the search skips it.
	assert.equal(result.alternative?.version, "1.0.0");
	assert.equal(result.candidatesChecked, 2);

	const recheck = await checkPackage(
		"example@1.0.0",
		{ policy: "no-downgrade" },
		services(data),
	);
	assert.equal(recheck.requested.verdict, "accepted");
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
	// no-downgrade never verifies signatures; services() fails any verification attempt.
	const check = async (spec: string, data: PackageMeta) =>
		checkPackage(spec, { policy: "no-downgrade" }, services(data));

	const republished = packument();
	republished.time["1.0.0"] = "2020-03-15";
	const downgrade = await check("example@1.0.0", republished);
	assert.equal(downgrade.requested.verdict, "rejected");
	assert.match(downgrade.requested.reason, /provenance attestation.*no trust evidence/);
	assert.equal(downgrade.alternative?.version, "2.0.0");
	assert.equal(downgrade.alternative?.provenanceVerified, false);

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

/**
 * A Node.js system error, as the network stack throws for a refused connection.
 */
function connectionRefused(): Error {
	return Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), {
		code: "ECONNREFUSED",
		syscall: "connect",
	});
}

test("operational verification failures are inconclusive, never accepted or rejected", async () => {
	const offline: PackageServices["verify"] = async () => {
		throw connectionRefused();
	};
	const result = await checkPackage("example@1.1.0", {}, services(packument(), offline));
	assert.equal(result.requested.verdict, "inconclusive");
	assert.match(result.requested.reason, /could not complete/);
	// An inconclusive version is not known to be bad, so no alternative is suggested.
	assert.equal(result.candidatesChecked, 0);
	assert.equal(result.auditIncomplete, true);
	assert.ok(result.errors.some((error) => error.includes("ECONNREFUSED")));

	// Inconclusive candidates are skipped but leave the search incomplete.
	const flaky = await checkPackage(
		"example@1.0.0",
		{},
		services(packument(), async (pin) => {
			if (pin.version === "2.0.0") {
				throw new TUFError({
					code: "TUF_REFRESH_METADATA_ERROR",
					message: "TUF metadata refresh failed: offline",
				});
			}
			return { verified: true, reason: "verified" };
		}),
	);
	assert.equal(flaky.alternative?.version, "1.1.0");
	assert.equal(flaky.auditIncomplete, true);
});

test("malformed responses and bugs during verification fail the check instead of being inconclusive", async () => {
	for (const error of [
		new TypeError("Cannot read properties of undefined"),
		new SyntaxError("bad"),
	]) {
		await assert.rejects(
			checkPackage(
				"example@1.1.0",
				{},
				services(packument(), async () => {
					throw error;
				}),
			),
			error,
		);
	}
});

test("operational errors are recognized from the libraries that throw them", async (t) => {
	const server = createServer((_request, response) => {
		response.writeHead(404).end("{}");
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	t.after(() => server.close());
	const local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const thrown = async (url: string): Promise<unknown> =>
		npmFetch.json(url, { retry: { retries: 0 } }).then(
			() => assert.fail("Request should fail"),
			(error: unknown) => error,
		);

	const httpError = await thrown(`${local}/missing`);
	assert.equal((httpError as { code?: unknown }).code, "E404");
	assert.equal(isOperationalError(httpError), true);
	server.close();
	const refused = await thrown(`${local}/missing`);
	assert.equal((refused as { name?: unknown }).name, "FetchError");
	assert.equal(isOperationalError(refused), true);
	assert.equal(isOperationalError(connectionRefused()), true);
	assert.equal(
		isOperationalError(new TUFError({ code: "TUF_FIND_TARGET_ERROR", message: "offline" })),
		true,
	);

	for (const error of [
		new TypeError("bug"),
		new SyntaxError("bad"),
		new Error("plain"),
		"text",
	]) {
		assert.equal(isOperationalError(error), false);
	}
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
 * Its bundle is signed with a Fulcio certificate unless other verification material is given.
 */
function attestation(
	signedPredicateType: string,
	listedPredicateType = signedPredicateType,
	verificationMaterial: unknown = { certificate: { rawBytes: "CERT" } },
) {
	const statement = { predicateType: signedPredicateType };
	return {
		predicateType: listedPredicateType,
		bundle: {
			verificationMaterial,
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
		loadTrustedRoot: async () => {},
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

test("SLSA provenance signed with a registry-supplied key is rejected", async () => {
	// A malicious registry can serve its own key at /-/npm/v1/keys and sign a forged SLSA statement, which pacote accepts.
	const keySigned = attestation(predicateType, predicateType, {
		publicKey: { hint: "SHA256:key" },
	});
	for (const bundles of [
		[keySigned],
		[
			attestation(publishPredicateType, publishPredicateType, {
				publicKey: { hint: "SHA256:key" },
			}),
			keySigned,
		],
		[attestation(predicateType, predicateType, {})],
	]) {
		const result = await verifyNpmSlsaProvenance(semverPin, registry, pacoteStub({ bundles }));
		assert.equal(result.verified, false);
		assert.match(result.reason, /registry-supplied key/);
	}
	const chain = attestation(predicateType, predicateType, {
		x509CertificateChain: { certificates: [{ rawBytes: "CERT" }] },
	});
	const accepted = await verifyNpmSlsaProvenance(
		semverPin,
		registry,
		pacoteStub({ bundles: [keySigned, chain] }),
	);
	assert.equal(accepted.verified, true);
});

test("provenance verification throws for operational failures and registries without signing keys", async () => {
	await assert.rejects(
		verifyNpmSlsaProvenance(semverPin, registry, pacoteStub(new TypeError("fetch failed"))),
		/fetch failed/,
	);
	// pacote would report a trusted root outage as EATTESTATIONVERIFY, so it must surface before pacote runs.
	const offline = {
		...pacoteStub({ bundles: [attestation(predicateType)] }),
		loadTrustedRoot: async () => {
			throw new TUFError({ code: "TUF_REFRESH_METADATA_ERROR", message: "offline" });
		},
	};
	await assert.rejects(verifyNpmSlsaProvenance(semverPin, registry, offline), (error) =>
		isOperationalError(error),
	);
	assert.deepEqual(offline.calls, []);
	const noKeys = {
		...pacoteStub(attestationError("EMISSINGSIGNATUREKEY", "no key")),
		fetchKeys: async () => undefined,
	};
	await assert.rejects(verifyNpmSlsaProvenance(semverPin, registry, noKeys), (error) => {
		assert.match(String(error), /does not publish attestation signing keys/);
		return isOperationalError(error);
	});
	assert.deepEqual(noKeys.calls[0]?.[1], { registry, verifyAttestations: true });
	const missingKey = await verifyNpmSlsaProvenance(
		semverPin,
		registry,
		pacoteStub(attestationError("EMISSINGSIGNATUREKEY", "unknown keyid")),
	);
	assert.equal(missingKey.verified, false);
});
