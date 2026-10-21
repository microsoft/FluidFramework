/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import npa from "npm-package-arg";
import semver from "semver";
import {
	type BundleVerifier,
	createVerifier,
	PolicyError,
	ValidationError,
	VerificationError,
} from "sigstore";
import ssri from "ssri";
import { isRecord, type PinnedVersion, toPinnedVersion } from "./lockfiles.js";

/**
 * How single-package mode decides whether a version is trustworthy.
 *
 * - `cryptographic`: the version must have SLSA provenance that verifies against Sigstore and binds to the registry's integrity hash.
 * - `metadata`: the registry must report SLSA provenance. Nothing is verified.
 * - `no-downgrade`: the version's trust evidence must not be weaker than any earlier release's, as pnpm's `trustPolicy: no-downgrade` evaluates it.
 */
export type PackagePolicy = "cryptographic" | "metadata" | "no-downgrade";

/**
 * Outcome of evaluating a package version against a {@link PackagePolicy}.
 *
 * `inconclusive` means the evaluation could not complete, for example because the network or the Sigstore trust root was unavailable.
 * It must be treated as a failure: an unreachable endpoint can hide an untrusted package.
 */
export type Verdict = "accepted" | "rejected" | "inconclusive";

/**
 * Trust evidence the registry reports for a version, ordered from weakest to strongest.
 *
 * Mirrors `getTrustEvidence` and `TRUST_RANK` in pnpm's trust checks so that single-package `no-downgrade` agrees with pnpm audits.
 * See {@link https://github.com/pnpm/pnpm/blob/cbe5accc7ace6812e1770f6301d2742c91381c85/pnpm11/resolving/npm-resolver/src/trustChecks.ts | trustChecks.ts}.
 */
export enum TrustEvidence {
	/**
	 * The registry reports no trust evidence.
	 */
	None = 0,
	/**
	 * The registry reports a provenance attestation (`dist.attestations.provenance`).
	 */
	Provenance = 1,
	/**
	 * The version was published by an npm trusted publisher (`_npmUser.trustedPublisher`) and has a provenance attestation.
	 */
	TrustedPublisher = 2,
	/**
	 * A maintainer approved the version through npm staged publishing (`_npmUser.approver`).
	 */
	StagedPublish = 3,
}

/**
 * The subset of a registry version manifest (one entry of a packument's `versions`) that trust checks read.
 */
export interface RegistryVersion {
	/**
	 * Package name.
	 */
	name: string;
	/**
	 * Exact version.
	 */
	version: string;
	/**
	 * Deprecation message, present when the version is deprecated.
	 */
	deprecated?: string;
	/**
	 * Distribution metadata.
	 */
	dist?: {
		/**
		 * URL of the package tarball.
		 */
		tarball?: string;
		/**
		 * Subresource Integrity hash of the tarball, which installers verify on download.
		 */
		integrity?: string;
		/**
		 * Attestations the registry stores for this version.
		 */
		attestations?: {
			/**
			 * URL of the registry's attestations endpoint for this version.
			 */
			url?: string;
			/**
			 * Present when the version has a provenance attestation.
			 */
			provenance?: {
				/**
				 * The attestation's in-toto predicate type.
				 */
				predicateType?: string;
			};
		};
	};
	/**
	 * The npm account that published the version.
	 */
	_npmUser?: {
		/**
		 * Present when the version was published by an npm trusted publisher.
		 */
		trustedPublisher?: unknown;
		/**
		 * Present when a maintainer approved a staged publish.
		 */
		approver?: unknown;
	};
}

/**
 * The subset of a registry packument (all versions of a package) that trust checks read.
 */
export interface RegistryPackage {
	/**
	 * Package name.
	 */
	name: string;
	/**
	 * Version manifests, keyed by version.
	 */
	versions: Record<string, RegistryVersion>;
	/**
	 * ISO 8601 publication times, keyed by version.
	 */
	time: Record<string, string>;
}

/**
 * Result of cryptographically verifying a version's provenance.
 * Operational failures, such as network errors, are thrown instead of returned.
 */
export interface ProvenanceResult {
	/**
	 * Whether the provenance verified.
	 */
	verified: boolean;
	/**
	 * Why the provenance did or did not verify.
	 */
	reason: string;
}

/**
 * Evaluation of one package version against a policy.
 */
export interface PackageAssessment {
	/**
	 * Package name.
	 */
	name: string;
	/**
	 * Exact version.
	 */
	version: string;
	/**
	 * Whether the version meets the policy.
	 */
	verdict: Verdict;
	/**
	 * Whether Sigstore provenance was cryptographically verified. Only the `cryptographic` policy sets this.
	 */
	provenanceVerified: boolean;
	/**
	 * Explanation of the verdict.
	 */
	reason: string;
}

/**
 * Result of checking one package version and, if it is rejected, searching for an alternative.
 */
export interface PackageCheckResult {
	/**
	 * Distinguishes single-package results from audit results.
	 */
	mode: "package";
	/**
	 * The policy that was applied.
	 */
	policy: PackagePolicy;
	/**
	 * Assessment of the requested version.
	 */
	requested: PackageAssessment;
	/**
	 * The newest acceptable stable release, or `null` if none was found or no search ran.
	 */
	alternative: PackageAssessment | null;
	/**
	 * How many alternative releases were assessed.
	 */
	candidatesChecked: number;
	/**
	 * Whether the alternative search stopped at the candidate limit.
	 */
	searchTruncated: boolean;
	/**
	 * Whether any assessment was inconclusive or the search was truncated.
	 */
	auditIncomplete: boolean;
	/**
	 * Operational errors behind inconclusive assessments.
	 */
	errors: string[];
	/**
	 * What the result does not establish.
	 */
	disclaimer: string;
}

/**
 * Options for {@link checkPackage}.
 */
export interface PackageCheckOptions {
	/**
	 * Policy to apply. Defaults to `cryptographic`.
	 */
	policy?: PackagePolicy;
	/**
	 * HTTPS registry URL. Defaults to `https://registry.npmjs.org`.
	 */
	registry?: string;
	/**
	 * Maximum number of alternative releases to assess. Defaults to 20.
	 */
	maxCandidates?: number;
}

/**
 * Registry and verification operations used by {@link checkPackage}, replaceable in tests.
 */
export interface PackageServices {
	/**
	 * Loads a package's packument.
	 */
	load: (name: string, registry: string) => Promise<RegistryPackage>;
	/**
	 * Cryptographically verifies a version's provenance.
	 */
	verify: (
		pin: PinnedVersion,
		manifest: RegistryVersion,
		registry: string,
	) => Promise<ProvenanceResult>;
}

/**
 * Network and Sigstore dependencies of {@link verifyNpmSlsaProvenance}, replaceable in tests.
 */
export interface ProvenanceVerificationServices {
	/**
	 * Fetch implementation used for the attestations endpoint.
	 */
	fetcher: typeof fetch;
	/**
	 * Returns a Sigstore bundle verifier backed by a trusted root.
	 */
	getVerifier: () => Promise<BundleVerifier>;
}

/**
 * Predicate types of the SLSA build provenance that npm generates with `npm publish --provenance`.
 *
 * npm defines the same values as `SLSA_PREDICATE_V02_TYPE` and `SLSA_PREDICATE_V1_TYPE` in
 * {@link https://github.com/npm/cli/blob/latest/workspaces/libnpmpublish/lib/provenance.js | libnpmpublish}, but does not export them.
 * {@link https://slsa.dev/spec/v1.0/provenance | SLSA} changes the URI only for a new major version, so a new value requires reviewing this verifier.
 * npm's other attestation, `https://github.com/npm/attestation/tree/main/specs/publish/v0.1`, is signed by the registry and is not build provenance.
 */
export const slsaProvenancePredicateTypes: ReadonlySet<string> = new Set([
	"https://slsa.dev/provenance/v0.2",
	"https://slsa.dev/provenance/v1",
]);

/**
 * {@link https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md | in-toto Statement} types npm signs, and the DSSE payload type that carries them.
 */
const inTotoStatementTypes: ReadonlySet<string> = new Set([
	"https://in-toto.io/Statement/v0.1",
	"https://in-toto.io/Statement/v1",
]);
const inTotoPayloadType = "application/vnd.in-toto+json";

const defaultRegistry = "https://registry.npmjs.org";

const disclaimer =
	"Provenance verifies publishing/build evidence, not absence of malware or vulnerabilities. Alternatives may require breaking API changes. No package is downloaded into the target project or installed.";

/**
 * Parses an exact registry package version, such as `name@1.2.3` or `@scope/name@1.2.3`.
 * Ranges, tags, aliases, and URLs are rejected.
 * @param spec - Package specifier.
 */
export function parsePackageSpec(spec: string): PinnedVersion {
	const usage = "Use an exact registry package version: name@1.2.3 or @scope/name@1.2.3.";
	let parsed: npa.Result;
	try {
		parsed = npa(spec);
	} catch (error) {
		throw new Error(`${usage} ${error instanceof Error ? error.message : String(error)}`, {
			cause: error,
		});
	}
	if (parsed.type !== "version" || parsed.name === null || parsed.fetchSpec === null) {
		throw new Error(usage);
	}
	return toPinnedVersion(parsed.name, parsed.fetchSpec);
}

/**
 * Returns the trust evidence the registry reports for a version, as pnpm computes it.
 * @param manifest - Registry version manifest.
 */
export function getTrustEvidence(manifest: RegistryVersion): TrustEvidence {
	if (manifest._npmUser?.approver) {
		return TrustEvidence.StagedPublish;
	}
	const provenance = manifest.dist?.attestations?.provenance;
	if (manifest._npmUser?.trustedPublisher && provenance) {
		return TrustEvidence.TrustedPublisher;
	}
	return provenance ? TrustEvidence.Provenance : TrustEvidence.None;
}

/**
 * Checks one exact package version and, if it is rejected, searches the newest stable, non-deprecated, provenance-bearing releases for an alternative.
 * Alternatives are verified cryptographically unless the `metadata` policy was selected.
 * They are not guaranteed to be API-compatible or harmless.
 * @param spec - Exact package version, such as `name@1.2.3`.
 * @param options - Policy, registry, and search options.
 * @param services - Registry and verification operations.
 */
export async function checkPackage(
	spec: string,
	options: PackageCheckOptions = {},
	services: PackageServices = {
		load: loadRegistryPackage,
		verify: (pin, manifest, registry) =>
			verifyNpmSlsaProvenance(pin, manifest, registry, defaultVerificationServices),
	},
): Promise<PackageCheckResult> {
	const pin = parsePackageSpec(spec);
	const policy = options.policy ?? "cryptographic";
	const registry = normalizeRegistry(options.registry ?? defaultRegistry);
	const maxCandidates = options.maxCandidates ?? 20;
	if (!Number.isInteger(maxCandidates) || maxCandidates < 1) {
		throw new Error("maxCandidates must be a positive integer.");
	}
	const packument = await services.load(pin.name, registry);
	const requestedManifest = packument.versions[pin.version];
	if (packument.name !== pin.name || requestedManifest === undefined) {
		throw new Error(`Package version not found: ${spec}`);
	}
	const context: AssessmentContext = { packument, registry, services, errors: [] };
	const requested = await assessVersion(context, requestedManifest, policy);
	const search =
		requested.verdict === "rejected"
			? await findAlternative(
					context,
					selectAlternativeCandidates(packument, pin.version),
					// Alternatives always need provenance; no-downgrade alone could suggest an unattested release.
					policy === "metadata" ? "metadata" : "cryptographic",
					maxCandidates,
				)
			: { alternative: null, candidatesChecked: 0, searchTruncated: false };
	return {
		mode: "package",
		policy,
		requested,
		...search,
		auditIncomplete: context.errors.length > 0 || search.searchTruncated,
		errors: context.errors,
		disclaimer,
	};
}

/**
 * State shared by the assessments of one {@link checkPackage} call.
 */
interface AssessmentContext {
	packument: RegistryPackage;
	registry: string;
	services: PackageServices;
	/**
	 * Accumulates the operational errors behind inconclusive assessments.
	 */
	errors: string[];
}

/**
 * Assesses one version of the context's package against a policy.
 * @param context - Assessment state.
 * @param manifest - Version manifest from the context's packument.
 * @param policy - Policy to apply.
 */
async function assessVersion(
	context: AssessmentContext,
	manifest: RegistryVersion,
	policy: PackagePolicy,
): Promise<PackageAssessment> {
	const { packument } = context;
	if (manifest.name !== packument.name || packument.versions[manifest.version] !== manifest) {
		throw new Error(
			`Registry manifest identity mismatch for ${packument.name}@${manifest.version}.`,
		);
	}
	const base = { name: packument.name, version: manifest.version, provenanceVerified: false };
	if (manifest.deprecated) {
		return { ...base, verdict: "rejected", reason: `Deprecated: ${manifest.deprecated}` };
	}
	if (policy === "no-downgrade") {
		return { ...base, ...assessNoDowngrade(packument, manifest.version) };
	}
	if (
		!slsaProvenancePredicateTypes.has(
			manifest.dist?.attestations?.provenance?.predicateType ?? "",
		)
	) {
		return { ...base, verdict: "rejected", reason: "No registry-reported SLSA provenance." };
	}
	if (policy === "metadata") {
		return {
			...base,
			verdict: "accepted",
			reason: "Registry reports provenance; signature and artifact were not verified.",
		};
	}
	try {
		const checked = await context.services.verify(
			{ name: packument.name, version: manifest.version },
			manifest,
			context.registry,
		);
		return {
			...base,
			verdict: checked.verified ? "accepted" : "rejected",
			provenanceVerified: checked.verified,
			reason: checked.reason,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		context.errors.push(`${packument.name}@${manifest.version}: ${message}`);
		return {
			...base,
			verdict: "inconclusive",
			reason: `Verification could not complete: ${message}`,
		};
	}
}

/**
 * Applies pnpm's `no-downgrade` rule: a version is rejected if a release published before it has stronger {@link TrustEvidence}.
 * Earlier releases without a publication time are skipped, and prereleases are ignored when the version is stable, as in pnpm.
 * @param packument - The package's packument.
 * @param version - Version to assess.
 */
export function assessNoDowngrade(
	packument: RegistryPackage,
	version: string,
): Pick<PackageAssessment, "verdict" | "reason"> {
	const publishedAt = Date.parse(packument.time[version] ?? "");
	const manifest = packument.versions[version];
	if (!Number.isFinite(publishedAt) || manifest === undefined) {
		throw new Error(`Missing publication time for ${packument.name}@${version}.`);
	}
	const current = getTrustEvidence(manifest);
	const earlier = findStrongestEarlierTrustEvidence(
		packument,
		publishedAt,
		semver.prerelease(version, true) === null,
	);
	if (earlier !== undefined && earlier.evidence > current) {
		return {
			verdict: "rejected",
			reason: `Trust downgrade: earlier release ${earlier.version} had ${describeTrustEvidence(earlier.evidence)}, but this version has ${describeTrustEvidence(current)}.`,
		};
	}
	return {
		verdict: "accepted",
		reason: `No trust downgrade: this version has ${describeTrustEvidence(current)}${current === TrustEvidence.None ? ", which no earlier release exceeds" : ""}.`,
	};
}

/**
 * Finds the strongest trust evidence among releases published before a given time.
 * @param packument - The package's packument.
 * @param before - Exclusive upper bound on publication time, in milliseconds since the epoch.
 * @param excludePrerelease - Whether to ignore prerelease versions.
 */
function findStrongestEarlierTrustEvidence(
	packument: RegistryPackage,
	before: number,
	excludePrerelease: boolean,
): { version: string; evidence: TrustEvidence } | undefined {
	let strongest: { version: string; evidence: TrustEvidence } | undefined;
	for (const [version, manifest] of Object.entries(packument.versions)) {
		if (excludePrerelease && semver.prerelease(version, true) !== null) {
			continue;
		}
		const publishedAt = Date.parse(packument.time[version] ?? "");
		if (!(publishedAt < before)) {
			continue;
		}
		const evidence = getTrustEvidence(manifest);
		if (evidence > (strongest?.evidence ?? TrustEvidence.None)) {
			strongest = { version, evidence };
		}
	}
	return strongest;
}

function describeTrustEvidence(evidence: TrustEvidence): string {
	switch (evidence) {
		case TrustEvidence.StagedPublish: {
			return "staged publish";
		}
		case TrustEvidence.TrustedPublisher: {
			return "trusted publisher";
		}
		case TrustEvidence.Provenance: {
			return "provenance attestation";
		}
		default: {
			return "no trust evidence";
		}
	}
}

/**
 * Lists stable, non-deprecated releases with registry-reported SLSA provenance, newest first.
 * @param packument - The package's packument.
 * @param excludedVersion - The requested version, which is never its own alternative.
 */
function selectAlternativeCandidates(
	packument: RegistryPackage,
	excludedVersion: string,
): RegistryVersion[] {
	return Object.entries(packument.versions)
		.filter(
			([version, manifest]) =>
				version !== excludedVersion &&
				semver.valid(version) !== null &&
				semver.prerelease(version) === null &&
				!manifest.deprecated &&
				slsaProvenancePredicateTypes.has(
					manifest.dist?.attestations?.provenance?.predicateType ?? "",
				),
		)
		.sort(([left], [right]) => semver.rcompare(left, right))
		.map(([, manifest]) => manifest);
}

/**
 * Returns the first candidate that a policy accepts, assessing at most `maxCandidates`.
 * Inconclusive candidates are skipped; their errors make the result incomplete.
 * @param context - Assessment state.
 * @param candidates - Candidate manifests in preference order.
 * @param policy - Policy to apply.
 * @param maxCandidates - Maximum number of candidates to assess.
 */
async function findAlternative(
	context: AssessmentContext,
	candidates: readonly RegistryVersion[],
	policy: PackagePolicy,
	maxCandidates: number,
): Promise<Pick<PackageCheckResult, "alternative" | "candidatesChecked" | "searchTruncated">> {
	let candidatesChecked = 0;
	for (const manifest of candidates) {
		if (candidatesChecked >= maxCandidates) {
			return { alternative: null, candidatesChecked, searchTruncated: true };
		}
		candidatesChecked++;
		const candidate = await assessVersion(context, manifest, policy);
		if (candidate.verdict === "accepted") {
			return { alternative: candidate, candidatesChecked, searchTruncated: false };
		}
	}
	return { alternative: null, candidatesChecked, searchTruncated: false };
}

function normalizeRegistry(registry: string): string {
	const url = new URL(registry);
	if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
		throw new Error("Registry must be an HTTPS URL without credentials, query, or fragment.");
	}
	return url.href.replace(/\/$/, "");
}

async function fetchJson(url: string, fetcher: typeof fetch): Promise<unknown> {
	const response = await fetcher(url, {
		signal: AbortSignal.timeout(60_000),
		redirect: "error",
	});
	if (!response.ok) {
		throw new Error(`Registry request failed: HTTP ${response.status} for ${url}`);
	}
	return response.json();
}

async function loadRegistryPackage(name: string, registry: string): Promise<RegistryPackage> {
	const data = await fetchJson(`${registry}/${encodeURIComponent(name)}`, fetch);
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

let defaultVerifier: Promise<BundleVerifier> | undefined;

/**
 * Production {@link ProvenanceVerificationServices}: global fetch, and a Sigstore verifier whose trusted root is fetched once through Sigstore's TUF repository.
 */
export const defaultVerificationServices: ProvenanceVerificationServices = {
	fetcher: fetch,
	getVerifier: async () => {
		defaultVerifier ??= createVerifier({ tlogThreshold: 1, ctLogThreshold: 1 }).catch(
			(error: unknown) => {
				// Allow a later attempt to retry after a transient TUF failure.
				defaultVerifier = undefined;
				throw error;
			},
		);
		return defaultVerifier;
	},
};

/**
 * Verifies npm SLSA build provenance the way npm's
 * {@link https://github.com/npm/pacote/blob/main/lib/registry.js | pacote} does for `npm install` with attestation verification.
 *
 * Each SLSA provenance bundle must pass Sigstore verification (Fulcio certificate chain, signature, and transparency log inclusion).
 * Its signed in-toto statement must name the requested package URL, and its SHA-512 subject must match the version's registry `dist.integrity`, which installers check when they download the tarball.
 * Registry-signed publish attestations alone are not build provenance.
 *
 * @param pin - Requested package version.
 * @param manifest - The version's registry manifest.
 * @param registry - Normalized registry URL. Attestations must be served from its origin.
 * @param services - Network and Sigstore dependencies.
 * @returns Whether the provenance verified. Operational failures, such as network or TUF errors, are thrown.
 */
export async function verifyNpmSlsaProvenance(
	pin: PinnedVersion,
	manifest: RegistryVersion,
	registry: string,
	services: ProvenanceVerificationServices,
): Promise<ProvenanceResult> {
	const attestationUrl = manifest.dist?.attestations?.url;
	if (attestationUrl === undefined) {
		return { verified: false, reason: "Missing attestations URL." };
	}
	const url = new URL(attestationUrl);
	if (url.protocol !== "https:" || url.origin !== new URL(registry).origin || url.username) {
		throw new Error("Attestations URL must use the HTTPS registry origin.");
	}
	const integrity = ssri.parse(manifest.dist?.integrity ?? "", { strict: true });
	if (integrity.sha512 === undefined) {
		return { verified: false, reason: "Registry integrity has no SHA-512 hash." };
	}
	const data = await fetchJson(attestationUrl, services.fetcher);
	if (!isRecord(data) || !Array.isArray(data.attestations)) {
		throw new Error("Malformed registry attestation response.");
	}
	const provenance = data.attestations.filter(
		(entry: unknown): entry is Record<string, unknown> =>
			isRecord(entry) &&
			typeof entry.predicateType === "string" &&
			slsaProvenancePredicateTypes.has(entry.predicateType),
	);
	if (provenance.length === 0) {
		return {
			verified: false,
			reason: "No SLSA provenance bundle; publish attestations alone are insufficient.",
		};
	}
	const verifier = await services.getVerifier();
	// `toPurl` exists in npm-package-arg but is missing from @types/npm-package-arg.
	const { toPurl } = npa as typeof npa & { toPurl: (arg: npa.Result) => string };
	const purl = toPurl(npa.resolve(pin.name, pin.version));
	for (const entry of provenance) {
		try {
			verifier.verify(entry.bundle as Parameters<BundleVerifier["verify"]>[0]);
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
		const failure = checkSignedStatement(entry, purl, integrity);
		if (failure !== undefined) {
			return { verified: false, reason: failure };
		}
	}
	return {
		verified: true,
		reason:
			"Sigstore provenance verified for this package version and its registry SHA-512 integrity.",
	};
}

/**
 * Checks that a Sigstore-verified provenance attestation's statement describes the expected artifact.
 * @param entry - Attestation entry whose bundle has already been verified.
 * @param purl - Expected package URL of the subject.
 * @param integrity - Registry integrity the subject digest must match.
 * @returns A failure reason, or `undefined` if the statement matches.
 */
function checkSignedStatement(
	entry: Record<string, unknown>,
	purl: string,
	integrity: ssri.IntegrityMap,
): string | undefined {
	const envelope = isRecord(entry.bundle) ? entry.bundle.dsseEnvelope : undefined;
	if (
		!isRecord(envelope) ||
		envelope.payloadType !== inTotoPayloadType ||
		typeof envelope.payload !== "string"
	) {
		return "Provenance bundle does not sign an in-toto statement.";
	}
	let statement: unknown;
	try {
		statement = JSON.parse(Buffer.from(envelope.payload, "base64").toString("utf8"));
	} catch {
		return "Signed statement is not valid JSON.";
	}
	if (
		!isRecord(statement) ||
		typeof statement._type !== "string" ||
		!inTotoStatementTypes.has(statement._type) ||
		statement.predicateType !== entry.predicateType ||
		!Array.isArray(statement.subject) ||
		statement.subject.length !== 1
	) {
		return "Signed statement is not the expected SLSA provenance.";
	}
	const subject: unknown = statement.subject[0];
	if (!isRecord(subject) || subject.name !== purl) {
		return `Signed subject does not name ${purl}.`;
	}
	const sha512 = isRecord(subject.digest) ? subject.digest.sha512 : undefined;
	if (typeof sha512 !== "string" || !/^[\da-f]{128}$/i.test(sha512)) {
		return "Signed subject has no SHA-512 digest.";
	}
	if (integrity.match(ssri.fromHex(sha512.toLowerCase(), "sha512")) === false) {
		return "Signed SHA-512 digest does not match the registry integrity.";
	}
	return undefined;
}
