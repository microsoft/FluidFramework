/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PackageInRegistry, PackageMeta } from "@pnpm/resolving.registry.types";
import { getTrustedRoot, TUFError } from "@sigstore/tuf";
import npa from "npm-package-arg";
import npmFetch from "npm-registry-fetch";
import pacote from "pacote";
import pacoteCacheDir from "pacote/lib/util/cache-dir.js";
import semver from "semver";

/**
 * An exact registry package version.
 */
export interface PinnedVersion {
	name: string;
	version: string;
}

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
	 * Identifies the kind of check that produced the result.
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
	load: (name: string, registry: string) => Promise<PackageMeta>;
	/**
	 * Cryptographically verifies a version's provenance.
	 */
	verify: (pin: PinnedVersion, registry: string) => Promise<ProvenanceResult>;
}

/**
 * Predicate types of the SLSA build provenance that npm generates with `npm publish --provenance`.
 *
 * npm defines the same values as `SLSA_PREDICATE_V02_TYPE` and `SLSA_PREDICATE_V1_TYPE` in
 * {@link https://github.com/npm/cli/blob/ae98c62586b6fea44114f72e249e246a2981de70/workspaces/libnpmpublish/lib/provenance.js | libnpmpublish}, but does not export them.
 * {@link https://slsa.dev/spec/v1.0/provenance | SLSA} changes the URI only for a new major version, so a new value requires reviewing this verifier.
 * npm's other attestation, `https://github.com/npm/attestation/tree/main/specs/publish/v0.1`, is signed by the registry and is not build provenance.
 */
export const slsaProvenancePredicateTypes: ReadonlySet<string> = new Set([
	"https://slsa.dev/provenance/v0.2",
	"https://slsa.dev/provenance/v1",
]);

/**
 * Codes of the errors pacote throws when attestations fail verification, as opposed to operational failures.
 *
 * @remarks
 * pacote throws these codes from
 * {@link https://github.com/npm/pacote/blob/v22.0.0/lib/registry.js | lib/registry.js} but does not export them as constants.
 */
const attestationErrorCodes: ReadonlySet<string> = new Set([
	"EATTESTATIONSUBJECT",
	"EATTESTATIONVERIFY",
	"EEXPIREDSIGNATUREKEY",
	"EMISSINGSIGNATUREKEY",
]);

/**
 * Code of the error {@link verifyNpmSlsaProvenance} throws when a registry does not publish the keys needed to verify its attestations.
 */
const noSigningKeysErrorCode = "ENOSIGNINGKEYS";

/**
 * Whether an error means that verification could not complete because a registry, the network, or Sigstore's trust root was unavailable.
 * Other errors, such as malformed registry responses or bugs, are not operational and must not be reported as inconclusive.
 *
 * @remarks
 * Recognizes HTTP errors from npm-registry-fetch (`HttpError*`), network, timeout, and invalid-response errors from minipass-fetch (`FetchError`),
 * Node.js system errors, TUF errors from `@sigstore/tuf`, and registries without signing keys.
 * @param error - The thrown value.
 */
export function isOperationalError(error: unknown): boolean {
	if (error instanceof TUFError) {
		return true;
	}
	if (!(error instanceof Error)) {
		return false;
	}
	const { code, syscall } = error as { code?: unknown; syscall?: unknown };
	return (
		error.name === "FetchError" ||
		error.name.startsWith("HttpError") ||
		typeof syscall === "string" ||
		code === noSigningKeysErrorCode
	);
}

/**
 * Registry queried when none is specified.
 */
export const defaultRegistry = "https://registry.npmjs.org";

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
	// npm-package-arg accepts a leading "v" or "=", which registries never record in a version.
	const version = semver.parse(parsed.fetchSpec);
	const build = version?.build.length ? `+${version.build.join(".")}` : "";
	if (version === null || `${version.version}${build}` !== parsed.fetchSpec) {
		throw new Error(usage);
	}
	return { name: parsed.name, version: parsed.fetchSpec };
}

/**
 * Returns the trust evidence the registry reports for a version, as pnpm computes it.
 *
 * @remarks
 * Equivalent to `getTrustEvidence` in pnpm's
 * {@link https://github.com/pnpm/pnpm/blob/cbe5accc7ace6812e1770f6301d2742c91381c85/pnpm11/resolving/npm-resolver/src/trustChecks.ts | trustChecks.ts}.
 * It is not called directly because `@pnpm/resolving.npm-resolver`'s `exports` map exposes only its index, which does not export it.
 *
 * @param manifest - Registry version manifest.
 */
export function getTrustEvidence(manifest: PackageInRegistry): TrustEvidence {
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
 * The requested version and every alternative are assessed by the same function against the same policy, so an alternative passes exactly the checks the requested version failed.
 * Alternatives are not guaranteed to be API-compatible or harmless.
 * @param spec - Exact package version, such as `name@1.2.3`.
 * @param options - Policy, registry, and search options.
 * @param services - Registry and verification operations.
 */
export async function checkPackage(
	spec: string,
	options: PackageCheckOptions = {},
	services: PackageServices = createDefaultServices(),
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
	const context: AssessmentContext = { packument, policy, registry, services, errors: [] };
	const requested = await assessVersion(context, requestedManifest);
	const search =
		requested.verdict === "rejected"
			? await findAlternative(
					context,
					selectAlternativeCandidates(packument, pin.version),
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
	packument: PackageMeta;
	/**
	 * Policy applied to the requested version and to every alternative.
	 */
	policy: PackagePolicy;
	registry: string;
	services: PackageServices;
	/**
	 * Accumulates the operational errors behind inconclusive assessments.
	 */
	errors: string[];
}

/**
 * Assesses one version of the context's package against the context's policy.
 *
 * @remarks
 * Written for this plugin; neither npm nor pnpm has an equivalent that applies a choice of provenance policies to one version.
 * `npm audit signatures` verifies attestations but rejects nothing for lacking them, and pnpm applies only `no-downgrade`, during resolution.
 * Rejecting deprecated versions is stricter than npm-pick-manifest and pnpm, which only prefer non-deprecated versions when picking.
 *
 * @param context - Assessment state, including the policy.
 * @param manifest - Version manifest from the context's packument.
 */
async function assessVersion(
	context: AssessmentContext,
	manifest: PackageInRegistry,
): Promise<PackageAssessment> {
	const { packument, policy } = context;
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
			context.registry,
		);
		return {
			...base,
			verdict: checked.verified ? "accepted" : "rejected",
			provenanceVerified: checked.verified,
			reason: checked.reason,
		};
	} catch (error) {
		if (!isOperationalError(error)) {
			throw error;
		}
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
 *
 * @remarks
 * Equivalent to `failIfTrustDowngraded` in pnpm's
 * {@link https://github.com/pnpm/pnpm/blob/cbe5accc7ace6812e1770f6301d2742c91381c85/pnpm11/resolving/npm-resolver/src/trustChecks.ts | trustChecks.ts}, without its `trustPolicyExclude` and `trustPolicyIgnoreAfter` options.
 * It is not called directly because `@pnpm/resolving.npm-resolver`'s `exports` map exposes only its index, which does not export it.
 * The only public entry point that applies it, `createNpmResolutionVerifier`, adds about 15 MB of dependencies, fetches the packument itself rather than reusing the one loaded here, and reports only pass or fail without naming the earlier release.
 *
 * @param packument - The package's packument.
 * @param version - Version to assess.
 */
export function assessNoDowngrade(
	packument: PackageMeta,
	version: string,
): Pick<PackageAssessment, "verdict" | "reason"> {
	const publishedAt = Date.parse(packument.time?.[version] ?? "");
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
 *
 * @remarks
 * Equivalent to `detectStrongestTrustEvidenceBeforeDate` in pnpm's
 * {@link https://github.com/pnpm/pnpm/blob/cbe5accc7ace6812e1770f6301d2742c91381c85/pnpm11/resolving/npm-resolver/src/trustChecks.ts | trustChecks.ts}, which pnpm does not export.
 * Unlike pnpm's, this returns the version that had the evidence, so the rejection reason can name it.
 *
 * @param packument - The package's packument.
 * @param before - Exclusive upper bound on publication time, in milliseconds since the epoch.
 * @param excludePrerelease - Whether to ignore prerelease versions.
 */
function findStrongestEarlierTrustEvidence(
	packument: PackageMeta,
	before: number,
	excludePrerelease: boolean,
): { version: string; evidence: TrustEvidence } | undefined {
	let strongest: { version: string; evidence: TrustEvidence } | undefined;
	for (const [version, manifest] of Object.entries(packument.versions)) {
		if (excludePrerelease && semver.prerelease(version, true) !== null) {
			continue;
		}
		const publishedAt = Date.parse(packument.time?.[version] ?? "");
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

/**
 * Describes trust evidence for messages.
 *
 * @remarks
 * Uses the wording of `prettyPrintTrustEvidence` in pnpm's
 * {@link https://github.com/pnpm/pnpm/blob/cbe5accc7ace6812e1770f6301d2742c91381c85/pnpm11/resolving/npm-resolver/src/trustChecks.ts | trustChecks.ts}, which pnpm does not export.
 */
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
 *
 * @remarks
 * npm's {@link https://github.com/npm/npm-pick-manifest/blob/v12.0.0/lib/index.js | npm-pick-manifest} and pnpm's `pickPackageFromMeta` choose a single version for a tag or range, preferring non-deprecated releases.
 * They are not used because the search needs every candidate in order, so that each can be verified until one is accepted.
 *
 * @param packument - The package's packument.
 * @param excludedVersion - The requested version, which is never its own alternative.
 */
function selectAlternativeCandidates(
	packument: PackageMeta,
	excludedVersion: string,
): PackageInRegistry[] {
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
 * Returns the first candidate that the context's policy accepts, assessing at most `maxCandidates`.
 * Inconclusive candidates are skipped; their errors make the result incomplete.
 *
 * @remarks
 * Similar to `pickWithoutTrustDowngrade` in pnpm's
 * {@link https://github.com/pnpm/pnpm/blob/cbe5accc7ace6812e1770f6301d2742c91381c85/pnpm11/resolving/npm-resolver/src/trustChecks.ts | trustChecks.ts}, which re-picks after each rejected candidate.
 * pnpm's version is not exported, and its synchronous check cannot await the Sigstore verification that each candidate needs here.
 *
 * @param context - Assessment state, including the policy.
 * @param candidates - Candidate manifests in preference order.
 * @param maxCandidates - Maximum number of candidates to assess.
 */
async function findAlternative(
	context: AssessmentContext,
	candidates: readonly PackageInRegistry[],
	maxCandidates: number,
): Promise<Pick<PackageCheckResult, "alternative" | "candidatesChecked" | "searchTruncated">> {
	let candidatesChecked = 0;
	for (const manifest of candidates) {
		if (candidatesChecked >= maxCandidates) {
			return { alternative: null, candidatesChecked, searchTruncated: true };
		}
		candidatesChecked++;
		const candidate = await assessVersion(context, manifest);
		if (candidate.verdict === "accepted") {
			return { alternative: candidate, candidatesChecked, searchTruncated: false };
		}
	}
	return { alternative: null, candidatesChecked, searchTruncated: false };
}

/**
 * Validates a registry URL and removes its trailing slash.
 *
 * @remarks
 * npm-registry-fetch's `pickRegistry` selects a registry for a package but does not validate it, so no library equivalent is used.
 */
function normalizeRegistry(registry: string): string {
	const url = new URL(registry);
	if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
		throw new Error("Registry must be an HTTPS URL without credentials, query, or fragment.");
	}
	return url.href.replace(/\/$/, "");
}

/**
 * Registry requests that take longer than this fail, making the affected assessment inconclusive.
 */
const requestTimeoutMs = 60_000;

/**
 * Creates the production {@link PackageServices} for one {@link checkPackage} call.
 * Packuments are shared between loading and verification, and registry keys and the Sigstore trusted root are loaded once.
 */
function createDefaultServices(): PackageServices {
	// npm's TUF cache, which pacote uses by default; passing it explicitly keeps pacote and loadTrustedRoot on the same cache.
	const tufCache = pacoteCacheDir().tufcache;
	const options = {
		fullMetadata: true,
		packumentCache: new Map(),
		timeout: requestTimeoutMs,
		tufCache,
	} as const;
	let keys: Promise<RegistryKey[] | undefined> | undefined;
	let trustedRoot: Promise<unknown> | undefined;
	const verificationServices: ProvenanceVerificationServices = {
		// Same cache and forceCache as pacote's call to sigstore.verify, so this succeeds exactly when pacote's TUF step would.
		loadTrustedRoot: async () => {
			trustedRoot ??= getTrustedRoot({ cachePath: tufCache, forceCache: true });
			await trustedRoot;
		},
		manifest: async (spec, manifestOptions) =>
			(await pacote.manifest(spec, { ...options, ...manifestOptions })) as {
				_attestationBundles?: unknown;
			},
		fetchKeys: async (registry) => {
			keys ??= fetchRegistryKeys(registry);
			return keys;
		},
	};
	return {
		load: async (name, registry) => {
			const packument = await pacote.packument(name, { ...options, registry });
			// Each selected version is checked again against its requested identity before use.
			return {
				name: packument.name,
				"dist-tags": packument["dist-tags"],
				versions: packument.versions as unknown as Record<string, PackageInRegistry>,
				time: packument.time ?? {},
			};
		},
		verify: async (pin, registry) =>
			verifyNpmSlsaProvenance(pin, registry, verificationServices),
	};
}

/**
 * A registry key that signs npm's publish attestations, in the form pacote accepts.
 */
export interface RegistryKey {
	/**
	 * Key identifier that attestation signatures reference.
	 */
	keyid: string;
	/**
	 * PEM-encoded public key.
	 */
	pemkey: string;
	/**
	 * Expiry time, after which the key no longer verifies new attestations.
	 */
	expires: string | null;
}

/**
 * Fetches the registry's attestation signing keys, as npm's
 * {@link https://github.com/npm/cli/blob/ae98c62586b6fea44114f72e249e246a2981de70/lib/utils/verify-signatures.js | verify-signatures} does when TUF has no keys for the registry.
 *
 * @remarks
 * Equivalent to the fallback in `VerifySignatures.setKeys` in npm's `verify-signatures.js`.
 * It is not called directly because the `npm` package has no programmatic API.
 * npm first reads the keys from Sigstore's TUF repository through `@sigstore/tuf`, which anchors them in Sigstore's trust root; this function does not.
 * The keys verify only npm's registry-signed publish attestations, and the `cryptographic` policy accepts only keyless SLSA provenance, which is verified against Sigstore's trust root, so skipping TUF does not weaken its verdicts.
 *
 * @param registry - Normalized registry URL.
 * @returns The keys, or `undefined` if the registry does not publish any.
 */
async function fetchRegistryKeys(registry: string): Promise<RegistryKey[] | undefined> {
	let response: { keys?: { keyid: string; key: string; expires: string | null }[] };
	try {
		response = (await npmFetch.json("/-/npm/v1/keys", {
			registry,
			timeout: requestTimeoutMs,
		})) as typeof response;
	} catch (error) {
		const code = (error as { code?: unknown }).code;
		if (code === "E404" || code === "E400") {
			return undefined;
		}
		throw error;
	}
	return response.keys?.map(({ keyid, key, expires }) => ({
		keyid,
		expires,
		pemkey: `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`,
	}));
}

/**
 * Registry operations used by {@link verifyNpmSlsaProvenance}, replaceable in tests.
 */
export interface ProvenanceVerificationServices {
	/**
	 * Resolves a version manifest with pacote's `manifest`, which verifies attestations when `verifyAttestations` is set.
	 */
	manifest: (
		spec: string,
		options: { registry: string; verifyAttestations: true; [key: string]: unknown },
	) => Promise<{ _attestationBundles?: unknown }>;
	/**
	 * Returns the registry's attestation signing keys, or `undefined` if it does not publish any.
	 */
	fetchKeys: (registry: string) => Promise<RegistryKey[] | undefined>;
	/**
	 * Loads Sigstore's trusted root as pacote's verification will, throwing if it is unavailable.
	 */
	loadTrustedRoot: () => Promise<void>;
}

/**
 * Verifies npm SLSA build provenance with {@link https://github.com/npm/pacote | pacote}, as `npm install` does when attestation verification is enabled.
 *
 * pacote checks each attestation's Sigstore bundle, and that its signed subject names the requested package URL and matches the version's registry SHA-512 integrity, which installers check when they download the tarball.
 * This function additionally requires a signed statement with an SLSA provenance predicate, since pacote also accepts registry-signed publish attestations alone, which are not build provenance.
 * The SLSA statement must also be signed with a Sigstore certificate rather than a registry-supplied key; see {@link isCertificateSigned}.
 *
 * @remarks
 * npm's `npm audit signatures`
 * ({@link https://github.com/npm/cli/blob/ae98c62586b6fea44114f72e249e246a2981de70/lib/utils/verify-signatures.js | verify-signatures.js}) makes the same pacote call, but it is not used because the `npm` package has no programmatic API and the command audits only installed dependencies.
 * It also counts any verified attestation as a pass, whereas this function requires SLSA provenance.
 *
 * pacote loads Sigstore's trusted root inside the same `try` that reports signature failures, so it reports a TUF outage as `EATTESTATIONVERIFY`.
 * Loading the trusted root first makes an outage an operational error instead of an invalid attestation.
 *
 * @param pin - Requested package version.
 * @param registry - Normalized registry URL.
 * @param services - Registry operations.
 * @returns Whether the provenance verified. Operational failures, such as network or TUF errors, are thrown.
 */
export async function verifyNpmSlsaProvenance(
	pin: PinnedVersion,
	registry: string,
	services: ProvenanceVerificationServices,
): Promise<ProvenanceResult> {
	await services.loadTrustedRoot();
	const keys = await services.fetchKeys(registry);
	const url = new URL(registry);
	// pacote looks keys up by this exact key, including the trailing slash.
	const keysOption =
		keys === undefined ? {} : { [`//${url.host}${url.pathname}:_keys`]: keys };
	let manifest: { _attestationBundles?: unknown };
	try {
		manifest = await services.manifest(`${pin.name}@${pin.version}`, {
			...keysOption,
			registry,
			verifyAttestations: true,
		});
	} catch (error) {
		const code = (error as { code?: unknown }).code;
		if (typeof code !== "string" || !attestationErrorCodes.has(code)) {
			throw error;
		}
		const message = error instanceof Error ? error.message : String(error);
		if (code === "EMISSINGSIGNATUREKEY" && keys === undefined) {
			throw Object.assign(
				new Error(
					`${registry} does not publish attestation signing keys, so its publish attestations cannot be verified: ${message}`,
					{ cause: error },
				),
				{ code: noSigningKeysErrorCode },
			);
		}
		return { verified: false, reason: `Invalid attestation: ${message}` };
	}
	const bundles = Array.isArray(manifest._attestationBundles)
		? manifest._attestationBundles
		: [];
	const slsaBundles = bundles.filter((bundle) =>
		slsaProvenancePredicateTypes.has(signedPredicateType(bundle)),
	);
	if (slsaBundles.length === 0) {
		return {
			verified: false,
			reason: "No verified SLSA provenance; publish attestations alone are insufficient.",
		};
	}
	if (!slsaBundles.some((bundle) => isCertificateSigned(bundle))) {
		return {
			verified: false,
			reason:
				"SLSA provenance is signed with a registry-supplied key rather than a Sigstore certificate, which legitimate npm provenance never is.",
		};
	}
	return {
		verified: true,
		reason:
			"Sigstore provenance verified for this package version and its registry SHA-512 integrity.",
	};
}

/**
 * Returns whether an attestation's Sigstore bundle is signed with a Fulcio certificate (keyless) rather than a public key.
 *
 * @remarks
 * npm serves two kinds of attestation for a version from `/-/npm/v1/attestations/<name>@<version>`:
 *
 * - SLSA build provenance, which the publishing CI job creates and signs keylessly with a short-lived Fulcio certificate bound to its OIDC identity.
 * The bundle carries that certificate, which Sigstore validates against its trusted root.
 *
 * - The publish attestation, which the registry creates at upload and signs with its long-lived key.
 * Its bundle carries only a public key hint, and pacote verifies it with the key of that `keyid` from the registry's `/-/npm/v1/keys`.
 *
 * pacote selects the registry key for any bundle whose DSSE signature has a `keyid`, regardless of predicate type.
 * Because the keys come from the same registry as the attestations, a malicious registry could publish its own key, sign a forged SLSA statement with it, and pass pacote's verification.
 * The registry never signs build provenance, so a key-signed SLSA bundle is never legitimate, even with npm's genuine key.
 * Requiring a certificate therefore blocks the forgery without checking the key against Sigstore's TUF repository.
 *
 * sigstore-js chooses the verification key from the bundle's `verificationMaterial`, using the certificate for `x509CertificateChain` or `certificate`, and the supplied key for `publicKey`.
 *
 * @param attestation - Attestation whose bundle pacote has verified.
 */
function isCertificateSigned(attestation: unknown): boolean {
	const material = (
		attestation as { bundle?: { verificationMaterial?: unknown } } | null | undefined
	)?.bundle?.verificationMaterial;
	if (typeof material !== "object" || material === null) {
		return false;
	}
	const { publicKey, certificate, x509CertificateChain } = material as Record<string, unknown>;
	return (
		publicKey === undefined &&
		(certificate !== undefined || x509CertificateChain !== undefined)
	);
}

/**
 * Returns the predicate type of the in-toto statement an attestation's DSSE envelope signs.
 * The registry's top-level `predicateType` is not signed, so it is not trusted.
 *
 * @remarks
 * pacote decodes the same statement in
 * {@link https://github.com/npm/pacote/blob/v22.0.0/lib/registry.js | lib/registry.js} to check its subject, but returns only the raw bundles.
 * `sigstore.verify` returns the signer's identity, not the statement, so no library exposes the signed predicate type.
 *
 * @param attestation - Attestation whose bundle pacote has verified.
 */
function signedPredicateType(attestation: unknown): string {
	const payload = (
		attestation as { bundle?: { dsseEnvelope?: { payload?: unknown } } } | null | undefined
	)?.bundle?.dsseEnvelope?.payload;
	if (typeof payload !== "string") {
		return "";
	}
	try {
		const statement: unknown = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
		const predicateType = (statement as { predicateType?: unknown } | null)?.predicateType;
		return typeof predicateType === "string" ? predicateType : "";
	} catch {
		return "";
	}
}
