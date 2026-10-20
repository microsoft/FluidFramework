/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createHash } from "node:crypto";
import semver from "semver";
import {
	verify,
	VerificationError,
	PolicyError,
	ValidationError,
	type Bundle,
	type VerifyOptions,
} from "sigstore";
import { addPinned, isRecord, type PinnedVersion } from "./lockfiles.js";

export type PackagePolicy = "cryptographic" | "metadata" | "no-downgrade";

export interface RegistryVersion {
	name: string;
	version: string;
	deprecated?: string;
	dist?: {
		tarball?: string;
		integrity?: string;
		attestations?: { url?: string; provenance?: { predicateType?: string } };
	};
	_npmUser?: { trustedPublisher?: unknown };
}

export interface RegistryPackage {
	name: string;
	versions: Record<string, RegistryVersion>;
	time: Record<string, string>;
}

export interface ProvenanceResult {
	verified: boolean;
	reason: string;
}

export interface PackageAssessment {
	name: string;
	version: string;
	accepted: boolean;
	provenanceVerified: boolean;
	reason: string;
}

export interface PackageCheckResult {
	mode: "package";
	policy: PackagePolicy;
	requested: PackageAssessment;
	alternative: PackageAssessment | null;
	candidatesChecked: number;
	searchTruncated: boolean;
	auditIncomplete: boolean;
	errors: string[];
	disclaimer: string;
}

interface PackageCheckOptions {
	policy?: PackagePolicy;
	registry?: string;
	maxCandidates?: number;
}

interface PackageServices {
	load: (name: string, registry: string) => Promise<RegistryPackage>;
	verify: (
		pin: PinnedVersion,
		manifest: RegistryVersion,
		registry: string,
	) => Promise<ProvenanceResult>;
}

const provenanceTypes = new Set([
	"https://slsa.dev/provenance/v0.2",
	"https://slsa.dev/provenance/v1",
]);

export function parsePackageSpec(spec: string): PinnedVersion {
	const match = /^(@[^/@]+\/[^/@]+|[^/@]+)@([^@]+)$/.exec(spec);
	if (!match)
		throw new Error("Use an exact registry package version: name@1.2.3 or @scope/name@1.2.3.");
	const result = new Map<string, PinnedVersion>();
	addPinned(result, match[1] ?? "", match[2]);
	const pin = [...result.values()][0];
	if (!pin || semver.valid(pin.version) === null)
		throw new Error(`Invalid exact version: ${spec}`);
	return pin;
}

/**
 * Checks one exact package version and, if rejected, searches newest stable nondeprecated
 * provenance-bearing releases. Alternatives are verified cryptographically unless metadata
 * policy was explicitly selected. They are not guaranteed API-compatible or harmless.
 */
export async function checkPackage(
	spec: string,
	options: PackageCheckOptions = {},
	services: PackageServices = { load: loadRegistryPackage, verify: verifyProvenance },
): Promise<PackageCheckResult> {
	const pin = parsePackageSpec(spec);
	const policy = options.policy ?? "cryptographic";
	const registry = normalizeRegistry(options.registry ?? "https://registry.npmjs.org");
	const maxCandidates = options.maxCandidates ?? 20;
	if (!Number.isInteger(maxCandidates) || maxCandidates < 1) {
		throw new Error("maxCandidates must be a positive integer.");
	}
	const packument = await services.load(pin.name, registry);
	const requested = packument.versions[pin.version];
	if (packument.name !== pin.name || !requested)
		throw new Error(`Package version not found: ${spec}`);
	const errors: string[] = [];
	async function assess(
		manifest: RegistryVersion,
		selectedPolicy: PackagePolicy,
	): Promise<PackageAssessment> {
		const base = { name: pin.name, version: manifest.version, provenanceVerified: false };
		if (manifest.name !== pin.name || packument.versions[manifest.version] !== manifest) {
			throw new Error(
				`Registry manifest identity mismatch for ${pin.name}@${manifest.version}.`,
			);
		}
		if (manifest.deprecated)
			return { ...base, accepted: false, reason: `Deprecated: ${manifest.deprecated}` };
		if (selectedPolicy === "no-downgrade") {
			const targetTime = Date.parse(packument.time[manifest.version] ?? "");
			if (!Number.isFinite(targetTime))
				throw new Error(`Missing publication time for ${manifest.version}.`);
			const targetRank = trustRank(manifest);
			for (const [version, previous] of Object.entries(packument.versions)) {
				if (
					semver.valid(version) === null ||
					(!semver.prerelease(pin.version) && semver.prerelease(version))
				)
					continue;
				const published = Date.parse(packument.time[version] ?? "");
				if (!Number.isFinite(published))
					throw new Error(`Missing publication time for ${version}.`);
				if (published < targetTime && trustRank(previous) > targetRank) {
					return {
						...base,
						accepted: false,
						reason: `Trust evidence is weaker than earlier release ${version}.`,
					};
				}
			}
			return {
				...base,
				accepted: true,
				reason: "No decrease in registry-reported trust evidence; provenance may be absent.",
			};
		}
		if (!hasProvenance(manifest))
			return { ...base, accepted: false, reason: "No registry-reported provenance." };
		if (selectedPolicy === "metadata")
			return {
				...base,
				accepted: true,
				reason: "Registry reports provenance; signature and artifact were not verified.",
			};
		try {
			const checked = await services.verify(
				{ name: pin.name, version: manifest.version },
				manifest,
				registry,
			);
			return {
				...base,
				accepted: checked.verified,
				provenanceVerified: checked.verified,
				reason: checked.reason,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			errors.push(`${pin.name}@${manifest.version}: ${message}`);
			return {
				...base,
				accepted: false,
				reason: `Verification could not complete: ${message}`,
			};
		}
	}
	const assessment = await assess(requested, policy);
	let alternative: PackageAssessment | null = null;
	let candidatesChecked = 0;
	let searchTruncated = false;
	if (!assessment.accepted) {
		const candidates = Object.entries(packument.versions)
			.filter(
				([version, manifest]) =>
					version !== pin.version &&
					semver.valid(version) !== null &&
					semver.prerelease(version) === null &&
					!manifest.deprecated &&
					hasProvenance(manifest),
			)
			.sort(([left], [right]) => semver.rcompare(left, right));
		for (const [, manifest] of candidates) {
			if (candidatesChecked >= maxCandidates) {
				searchTruncated = true;
				break;
			}
			candidatesChecked++;
			const candidate = await assess(
				manifest,
				policy === "metadata" ? "metadata" : "cryptographic",
			);
			if (candidate.accepted) {
				alternative = candidate;
				break;
			}
		}
	}
	return {
		mode: "package",
		policy,
		requested: assessment,
		alternative,
		candidatesChecked,
		searchTruncated,
		auditIncomplete: errors.length > 0 || searchTruncated,
		errors,
		disclaimer:
			"Provenance verifies publishing/build evidence, not absence of malware or vulnerabilities. Alternatives may require breaking API changes. No package is downloaded into the target project or installed.",
	};
}

function hasProvenance(manifest: RegistryVersion): boolean {
	return provenanceTypes.has(manifest.dist?.attestations?.provenance?.predicateType ?? "");
}

function trustRank(manifest: RegistryVersion): number {
	if (manifest._npmUser?.trustedPublisher) return 2;
	return hasProvenance(manifest) ? 1 : 0;
}

function normalizeRegistry(registry: string): string {
	const url = new URL(registry);
	if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
		throw new Error("Registry must be an HTTPS URL without credentials, query, or fragment.");
	}
	return url.href.replace(/\/$/, "");
}

async function fetchChecked(url: string, fetcher: typeof fetch): Promise<Response> {
	const response = await fetcher(url, {
		signal: AbortSignal.timeout(60_000),
		redirect: "error",
	});
	if (!response.ok)
		throw new Error(`Registry request failed: HTTP ${response.status} for ${url}`);
	return response;
}

async function loadRegistryPackage(name: string, registry: string): Promise<RegistryPackage> {
	const response = await fetchChecked(`${registry}/${encodeURIComponent(name)}`, fetch);
	const data: unknown = await response.json();
	if (!isRecord(data) || data.name !== name || !isRecord(data.versions)) {
		throw new Error(`Invalid registry metadata for ${name}.`);
	}
	// Each selected version is checked again against its requested identity before use.
	return {
		name,
		versions: data.versions as Record<string, RegistryVersion>,
		time: isRecord(data.time) ? (data.time as Record<string, string>) : {},
	};
}

/**
 * Verifies npm's SLSA provenance using Sigstore's trusted roots and transparency log,
 * then binds the signed PURL and SHA-512 subject to the actual downloaded tarball.
 * Registry publish attestations alone are not build provenance.
 */
export async function verifyProvenance(
	pin: PinnedVersion,
	manifest: RegistryVersion,
	registry: string,
	fetcher: typeof fetch = fetch,
	verifyBundle: (bundle: Bundle, options: VerifyOptions) => Promise<unknown> = verify,
): Promise<ProvenanceResult> {
	const attestationUrl = manifest.dist?.attestations?.url;
	const tarballUrl = manifest.dist?.tarball;
	if (!attestationUrl || !tarballUrl)
		return { verified: false, reason: "Missing attestation or tarball URL." };
	for (const address of [attestationUrl, tarballUrl]) {
		const url = new URL(address);
		if (
			url.protocol !== "https:" ||
			url.origin !== new URL(registry).origin ||
			url.username ||
			url.password
		) {
			throw new Error("Attestation and tarball URLs must use the HTTPS registry origin.");
		}
	}
	const data: unknown = await (await fetchChecked(attestationUrl, fetcher)).json();
	if (!isRecord(data) || !Array.isArray(data.attestations))
		throw new Error("Malformed registry attestation response.");
	const provenance = data.attestations.filter(
		(entry: unknown): entry is Record<string, unknown> =>
			isRecord(entry) &&
			typeof entry.predicateType === "string" &&
			provenanceTypes.has(entry.predicateType),
	);
	if (provenance.length === 0)
		return {
			verified: false,
			reason: "No SLSA provenance bundle; publish attestations alone are insufficient.",
		};
	let digest: string | undefined;
	for (const entry of provenance) {
		const bundle = entry.bundle;
		if (!isRecord(bundle) || !isRecord(bundle.dsseEnvelope))
			return { verified: false, reason: "Malformed provenance bundle." };
		const envelope = bundle.dsseEnvelope;
		const material = bundle.verificationMaterial;
		if (
			!isRecord(material) ||
			(!isRecord(material.certificate) && !isRecord(material.x509CertificateChain))
		) {
			return {
				verified: false,
				reason: "Provenance must include a Sigstore signing certificate.",
			};
		}
		if (
			envelope.payloadType !== "application/vnd.in-toto+json" ||
			typeof envelope.payload !== "string"
		)
			return { verified: false, reason: "Missing signed statement." };
		try {
			// Sigstore validates bundle structure, certificate, signatures, and log inclusion.
			await verifyBundle(bundle as Bundle, { tlogThreshold: 1, ctLogThreshold: 1 });
		} catch (error) {
			if (
				error instanceof VerificationError ||
				error instanceof PolicyError ||
				error instanceof ValidationError
			) {
				return { verified: false, reason: `Invalid provenance: ${error.message}` };
			}
			throw error;
		}
		const statement: unknown = JSON.parse(
			Buffer.from(envelope.payload, "base64").toString("utf8"),
		);
		if (
			!isRecord(statement) ||
			(statement._type !== "https://in-toto.io/Statement/v1" &&
				statement._type !== "https://in-toto.io/Statement/v0.1") ||
			statement.predicateType !== entry.predicateType ||
			!Array.isArray(statement.subject) ||
			statement.subject.length !== 1
		) {
			return {
				verified: false,
				reason: "Signed statement is not the expected SLSA provenance.",
			};
		}
		const subject: unknown = statement.subject[0];
		const purl = `pkg:npm/${pin.name.replace("@", "%40")}@${pin.version}`;
		if (
			!isRecord(subject) ||
			subject.name !== purl ||
			!isRecord(subject.digest) ||
			typeof subject.digest.sha512 !== "string" ||
			!/^[a-f0-9]{128}$/i.test(subject.digest.sha512)
		) {
			return {
				verified: false,
				reason:
					"Signed package identity or SHA-512 subject does not match the requested package.",
			};
		}
		const subjectDigest = subject.digest.sha512.toLowerCase();
		if (digest !== undefined && digest !== subjectDigest)
			return { verified: false, reason: "Provenance subjects disagree." };
		digest = subjectDigest;
	}
	const response = await fetchChecked(tarballUrl, fetcher);
	if (!response.body) throw new Error("Missing tarball body.");
	const hash = createHash("sha512");
	let size = 0;
	for await (const chunk of response.body) {
		size += chunk.length;
		if (size > 256 * 1024 * 1024)
			throw new Error("Tarball exceeds the 256 MiB verification limit.");
		hash.update(chunk);
	}
	if (hash.digest("hex") !== digest)
		return {
			verified: false,
			reason: "Downloaded tarball does not match the signed SHA-512 digest.",
		};
	return {
		verified: true,
		reason:
			"Sigstore provenance and the requested package/version/tarball SHA-512 were verified.",
	};
}
