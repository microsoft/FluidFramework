/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { VerificationError } from "sigstore";
import {
	checkPackage,
	parsePackageSpec,
	verifyProvenance,
	type RegistryPackage,
	type RegistryVersion,
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

test("exact package specs support scopes and reject ranges, tags, and arbitrary URLs", () => {
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
	]) {
		assert.throws(() => parsePackageSpec(spec));
	}
});

test("cryptographic default rejects missing provenance and verifies newest stable alternative", async () => {
	const verified: string[] = [];
	const result = await checkPackage(
		"example@1.0.0",
		{},
		{
			load: async () => packument(),
			verify: async (pin) => {
				verified.push(pin.version);
				return { verified: true, reason: "verified" };
			},
		},
	);
	assert.equal(result.policy, "cryptographic");
	assert.equal(result.requested.accepted, false);
	assert.equal(result.alternative?.version, "2.0.0");
	assert.equal(result.alternative?.provenanceVerified, true);
	assert.deepEqual(verified, ["2.0.0"]);
	assert.equal(result.auditIncomplete, false);
});

test("metadata is opt-in and never claims cryptographic verification", async () => {
	const result = await checkPackage(
		"example@1.1.0",
		{ policy: "metadata" },
		{
			load: async () => packument(),
			verify: async () => {
				throw new Error("Must not verify in metadata mode");
			},
		},
	);
	assert.equal(result.requested.accepted, true);
	assert.equal(result.requested.provenanceVerified, false);
	assert.equal(result.alternative, null);
});

test("no-downgrade uses publication order, trusted-publisher evidence, and excludes stable-to-prerelease comparison", async () => {
	const data = packument();
	const target = data.versions["1.0.0"];
	assert.ok(target);
	data.time["1.0.0"] = "2020-03-15";
	const result = await checkPackage(
		"example@1.0.0",
		{ policy: "no-downgrade" },
		{
			load: async () => data,
			verify: async () => ({ verified: true, reason: "verified" }),
		},
	);
	assert.equal(result.requested.accepted, false);
	assert.ok(result.alternative?.provenanceVerified);
	const old = await checkPackage(
		"example@1.0.0",
		{ policy: "no-downgrade" },
		{
			load: async () => packument(),
			verify: async () => {
				throw new Error("Not needed");
			},
		},
	);
	assert.equal(old.requested.accepted, true);
	assert.equal(old.requested.provenanceVerified, false);
	const withPublisher = packument();
	const previous = withPublisher.versions["1.1.0"];
	assert.ok(previous);
	previous._npmUser = { trustedPublisher: { id: "github" } };
	const downgrade = await checkPackage(
		"example@2.0.0",
		{ policy: "no-downgrade" },
		{
			load: async () => withPublisher,
			verify: async () => ({ verified: true, reason: "verified" }),
		},
	);
	assert.equal(downgrade.requested.accepted, false);
	const prereleaseOnly = packument();
	prereleaseOnly.time["3.0.0-beta.1"] = "2019-01-01";
	delete prereleaseOnly.versions["1.1.0"];
	delete prereleaseOnly.versions["2.0.0"];
	const stable = await checkPackage(
		"example@1.0.0",
		{ policy: "no-downgrade" },
		{
			load: async () => prereleaseOnly,
			verify: async () => ({ verified: true, reason: "verified" }),
		},
	);
	assert.equal(stable.requested.accepted, true);
});

test("deprecated and invalid candidates are skipped and search exhaustion is explicit", async () => {
	const data = packument();
	const newest = data.versions["2.0.0"];
	assert.ok(newest);
	newest.deprecated = "Do not use";
	const result = await checkPackage(
		"example@1.0.0",
		{},
		{
			load: async () => data,
			verify: async () => ({ verified: false, reason: "bad signature" }),
		},
	);
	assert.equal(result.alternative, null);
	assert.equal(result.candidatesChecked, 1);
	assert.equal(result.auditIncomplete, false);
	const limited = await checkPackage(
		"example@1.0.0",
		{ maxCandidates: 1 },
		{
			load: async () => packument(),
			verify: async () => ({ verified: false, reason: "bad signature" }),
		},
	);
	assert.equal(limited.searchTruncated, true);
	assert.equal(limited.auditIncomplete, true);
});

test("network verification failures are incomplete, never interpreted as missing provenance", async () => {
	const result = await checkPackage(
		"example@1.1.0",
		{},
		{
			load: async () => packument(),
			verify: async () => {
				throw new Error("network offline");
			},
		},
	);
	assert.equal(result.requested.accepted, false);
	assert.equal(result.auditIncomplete, true);
	assert.ok(result.errors.some((error) => error.includes("network offline")));
});

test("malformed identities, unknown packages, and missing dates fail explicitly", async () => {
	const data = packument();
	const target = data.versions["1.1.0"];
	assert.ok(target);
	target.name = "other";
	const services = {
		load: async () => data,
		verify: async () => ({ verified: true, reason: "" }),
	};
	await assert.rejects(checkPackage("example@1.1.0", {}, services), /identity/);
	await assert.rejects(checkPackage("example@9.0.0", {}, services), /not found/);
	delete data.time["1.0.0"];
	await assert.rejects(
		checkPackage("example@1.0.0", { policy: "no-downgrade" }, services),
		/publication time/,
	);
});

function cryptoFixture(
	options: { subject?: string; tarball?: string; predicate?: string } = {},
) {
	const tarball = Buffer.from("test package bytes");
	const digest = createHash("sha512").update(tarball).digest("hex");
	const statement = {
		_type: "https://in-toto.io/Statement/v1",
		predicateType: options.predicate ?? predicateType,
		subject: [
			{ name: options.subject ?? "pkg:npm/example@1.0.0", digest: { sha512: digest } },
		],
	};
	const bundle = {
		verificationMaterial: { certificate: { rawBytes: "test-certificate" } },
		dsseEnvelope: {
			payloadType: "application/vnd.in-toto+json",
			payload: Buffer.from(JSON.stringify(statement)).toString("base64"),
		},
	};
	const m = manifest("1.0.0");
	assert.ok(m.dist);
	m.dist.tarball = `${registry}/example/-/example-1.0.0.tgz`;
	const fetched: string[] = [];
	const fetcher: typeof fetch = async (input) => {
		fetched.push(String(input));
		return String(input).endsWith("attestations")
			? Response.json({ attestations: [{ predicateType, bundle }] })
			: new Response(options.tarball === undefined ? tarball : Buffer.from(options.tarball));
	};
	return { manifest: m, fetcher, fetched };
}

test("cryptographic verification binds the signed package name, version, predicate, and downloaded artifact", async () => {
	const fixture = cryptoFixture();
	let verified = false;
	const result = await verifyProvenance(
		{ name: "example", version: "1.0.0" },
		fixture.manifest,
		registry,
		fixture.fetcher,
		async (_bundle, options) => {
			assert.equal(options.tlogThreshold, 1);
			verified = true;
		},
	);
	assert.ok(verified);
	assert.ok(result.verified);
	assert.equal(fixture.fetched.length, 2);
	for (const options of [
		{ subject: "pkg:npm/other@1.0.0" },
		{ subject: "pkg:npm/example@2.0.0" },
		{ tarball: "tampered" },
		{ predicate: "https://example.com/not-provenance" },
	]) {
		const bad = cryptoFixture(options);
		assert.equal(
			(
				await verifyProvenance(
					{ name: "example", version: "1.0.0" },
					bad.manifest,
					registry,
					bad.fetcher,
					async () => {},
				)
			).verified,
			false,
		);
	}
});

test("invalid signatures are rejected and operational errors remain failures", async () => {
	const fixture = cryptoFixture();
	const result = await verifyProvenance(
		{ name: "example", version: "1.0.0" },
		fixture.manifest,
		registry,
		fixture.fetcher,
		async () => {
			throw new VerificationError({ code: "SIGNATURE_ERROR", message: "tampered signature" });
		},
	);
	assert.equal(result.verified, false);
	assert.match(result.reason, /tampered signature/);
	assert.equal(fixture.fetched.length, 1);
	await assert.rejects(
		verifyProvenance(
			{ name: "example", version: "1.0.0" },
			fixture.manifest,
			registry,
			fixture.fetcher,
			async () => {
				throw new Error("TUF offline");
			},
		),
		/TUF offline/,
	);
});

test("cryptographic mode refuses third-party fetch destinations and publish-only attestations", async () => {
	const fixture = cryptoFixture();
	assert.ok(fixture.manifest.dist);
	fixture.manifest.dist.tarball = "https://other.example.com/package.tgz";
	await assert.rejects(
		verifyProvenance(
			{ name: "example", version: "1.0.0" },
			fixture.manifest,
			registry,
			fixture.fetcher,
		),
		/registry origin/,
	);
	const onlyPublish = cryptoFixture();
	const result = await verifyProvenance(
		{ name: "example", version: "1.0.0" },
		onlyPublish.manifest,
		registry,
		async () =>
			Response.json({ attestations: [{ predicateType: "npm-publish", bundle: {} }] }),
		async () => {},
	);
	assert.equal(result.verified, false);
});
