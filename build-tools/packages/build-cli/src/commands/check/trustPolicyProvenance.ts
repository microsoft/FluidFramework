/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createRequire } from "node:module";

/**
 * Sigstore-verified provenance enrichment used by `flub check trustPolicy`.
 *
 * Split out of `trustPolicy.ts` so the npm-attestation fetch + bundle
 * verification + SLSA in-toto parsing can be exercised independently of
 * the pnpm-driven audit loop. The `trustPolicy` command depends on this
 * module; this module has no knowledge of pnpm, the audit workspace, or
 * the trust-downgrade violation shape beyond what its public API exposes.
 */

/**
 * Minimal runtime interface for the `sigstore` package's verify API.
 *
 * `sigstore` is loaded via `createRequire` rather than a static `import`
 * so TypeScript does not pull its transitive `.d.ts` graph into our
 * program. That graph (`@sigstore/core`, `@sigstore/sign`,
 * `@sigstore/tuf`, `make-fetch-happen`, `@sigstore/rekor-types`) has
 * type errors against this repo's `@types/node` baseline that we
 * cannot fix from here.
 */
interface SigstoreModule {
	verify(bundle: SigstoreBundle): Promise<SigstoreSigner>;
}

/** Subset of `@sigstore/bundle`'s `SerializedBundle` we actually read. */
interface SigstoreBundle {
	dsseEnvelope?: { payload?: string };
}

/** Subset of `@sigstore/verify`'s `Signer` we actually read. */
interface SigstoreSigner {
	identity?: {
		subjectAlternativeName?: string;
		extensions?: { issuer?: string };
	};
}

const sigstore = createRequire(import.meta.url)("sigstore") as SigstoreModule;

/**
 * Verified provenance metadata extracted from a Sigstore SLSA bundle
 * served by the npm registry's attestations endpoint.
 *
 * All fields except `verificationError` are populated only after the
 * bundle has been cryptographically verified via `sigstore.verify`
 * (which checks the Fulcio-issued certificate chain, the Rekor inclusion
 * proof, and the DSSE signature). A missing field means the bundle did
 * not carry that piece of metadata, not that it failed verification —
 * verification failures land on `verificationError` instead and leave
 * the rest of the fields undefined.
 */
export interface ProvenanceDetails {
	/** Signing identity from the Fulcio certificate's SAN + issuer extension. */
	signerIdentity?: { issuer?: string; subject?: string };
	/** Source repository URL (e.g. `https://github.com/owner/repo`). */
	sourceRepo?: string;
	/** Git ref the build ran on (e.g. `refs/tags/v1.2.3`). */
	sourceRef?: string;
	/** Git commit SHA the build ran on. */
	commit?: string;
	/** Path of the build workflow file (e.g. `.github/workflows/release.yml`). */
	workflowPath?: string;
	/** SLSA builder ID (e.g. `https://github.com/actions/runner/github-hosted`). */
	builderId?: string;
	/** URL of the build run that produced the artifact. */
	runUrl?: string;
	/**
	 * `true` if the SLSA statement's subject digest matches the registry
	 * manifest's `dist.integrity`. `false` if they disagree (a strong signal
	 * the registry tarball does not match what was attested). `undefined` if
	 * the comparison could not be performed (algorithm mismatch, etc.).
	 */
	subjectDigestVerified?: boolean;
	/**
	 * Populated when fetching or verifying the bundle failed. The other
	 * fields are left undefined in that case.
	 */
	verificationError?: string;
}

/**
 * Subset of the npm registry's attestation envelope. Each entry carries a
 * `predicateType` identifying the in-toto statement kind, plus the raw
 * Sigstore bundle. We care about the SLSA provenance entry; the npm
 * publish-attestation entry (predicateType
 * `https://github.com/npm/attestation/...`) is ignored.
 */
interface RegistryAttestation {
	predicateType: string;
	bundle: SigstoreBundle;
}

interface RegistryAttestationsResponse {
	attestations?: RegistryAttestation[];
}

/** SLSA v1 in-toto statement subset. Other predicate types share the envelope. */
interface InTotoStatement {
	subject?: { name?: string; digest?: Record<string, string> }[];
	predicateType?: string;
	predicate?: {
		buildDefinition?: {
			externalParameters?: {
				workflow?: { ref?: string; repository?: string; path?: string };
			};
			resolvedDependencies?: {
				uri?: string;
				digest?: Record<string, string>;
			}[];
		};
		runDetails?: {
			builder?: { id?: string };
			metadata?: { invocationId?: string };
		};
	};
}

/**
 * Fetches the SLSA provenance attestation for `name@version` from the npm
 * registry, verifies the Sigstore bundle, and extracts the source-repo,
 * workflow, and signer-identity fields useful for auditing a downgrade.
 *
 * Always returns a `ProvenanceDetails`. On failure it returns one with only
 * `verificationError` set; the caller renders that alongside the other
 * violation fields so a single bad attestation can't abort the audit.
 *
 * Network access is hardcoded to `https://registry.npmjs.org`. The
 * attestations endpoint is npm-public-only; private/scoped registries
 * (Artifactory, ADO, GitHub Packages) do not implement it. If the lookup
 * 404s we report that explicitly so the user knows it's a registry-API
 * limitation, not a verification failure.
 *
 * @param manifest - Optional registry manifest for the same `(name, version)`.
 * When provided, its `dist.integrity` is compared against the attested
 * subject digest and the result reported on `subjectDigestVerified`.
 * @param verbose - Verbose logging callback (no-op by default).
 */
export async function fetchAndVerifyProvenance(
	name: string,
	version: string,
	manifest?: { dist?: { integrity?: string } },
	verbose: (msg: string) => void = () => {},
): Promise<ProvenanceDetails> {
	try {
		verbose(`    fetching attestations for ${name}@${version}`);
		const url = `https://registry.npmjs.org/-/npm/v1/attestations/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
		const res = await fetch(url);
		if (res.status === 404) {
			return { verificationError: "no attestations served (registry returned 404)" };
		}
		if (!res.ok) {
			return { verificationError: `HTTP ${res.status} fetching ${url}` };
		}
		const body = (await res.json()) as RegistryAttestationsResponse;
		const slsa = body.attestations?.find((a) =>
			a.predicateType?.startsWith("https://slsa.dev/provenance/"),
		);
		if (slsa === undefined) {
			return { verificationError: "no SLSA provenance entry in registry attestations" };
		}
		// `verify` (no payload overload) checks the Fulcio cert chain, the
		// Rekor inclusion proof, and the DSSE signature against the embedded
		// statement. It does not need the tarball because the statement is
		// inside the DSSE envelope.
		const signer = await sigstore.verify(slsa.bundle);
		const statement = parseInTotoStatement(slsa.bundle);
		if (statement === undefined) {
			return { verificationError: "verified bundle but could not parse in-toto statement" };
		}
		const wf = statement.predicate?.buildDefinition?.externalParameters?.workflow;
		const builder = statement.predicate?.runDetails?.builder?.id;
		const runUrl = statement.predicate?.runDetails?.metadata?.invocationId;
		// Find the resolved-dependency entry that points at the source repo;
		// SLSA v1 GitHub builders put the source there with a `gitCommit` digest.
		const sourceDep = statement.predicate?.buildDefinition?.resolvedDependencies?.find(
			(d) => d.digest?.gitCommit !== undefined,
		);
		return {
			signerIdentity: {
				issuer: signer.identity?.extensions?.issuer,
				subject: signer.identity?.subjectAlternativeName,
			},
			sourceRepo: wf?.repository,
			sourceRef: wf?.ref,
			commit: sourceDep?.digest?.gitCommit,
			workflowPath: wf?.path,
			builderId: builder,
			runUrl,
			subjectDigestVerified:
				manifest === undefined ? undefined : compareSubjectDigest(manifest, statement),
		};
	} catch (err) {
		return { verificationError: err instanceof Error ? err.message : String(err) };
	}
}

/**
 * Decodes the DSSE envelope payload from a Sigstore bundle as a UTF-8 JSON
 * in-toto statement. Returns `undefined` if the bundle has no DSSE envelope
 * (e.g. a `messageSignature`-style bundle, which is not used for npm
 * provenance) or if the payload doesn't parse as JSON.
 */
function parseInTotoStatement(bundle: SigstoreBundle): InTotoStatement | undefined {
	const env = bundle.dsseEnvelope;
	if (env?.payload === undefined) return undefined;
	try {
		return JSON.parse(Buffer.from(env.payload, "base64").toString("utf8")) as InTotoStatement;
	} catch {
		return undefined;
	}
}

/**
 * Compares the in-toto statement's first subject digest against the
 * registry manifest's `dist.integrity`. Returns `true` if they agree
 * (the tarball matches what was attested), `false` if they disagree
 * (a strong red flag), and `undefined` if the comparison can't be made
 * because the algorithms differ or either side is missing.
 *
 * `dist.integrity` is `<algo>-<base64>`; the SLSA digest is hex.
 */
function compareSubjectDigest(
	manifest: { dist?: { integrity?: string } },
	statement: InTotoStatement,
): boolean | undefined {
	const integrity = manifest.dist?.integrity;
	const subjectDigest = statement.subject?.[0]?.digest;
	if (integrity === undefined || subjectDigest === undefined) return undefined;
	const dashIdx = integrity.indexOf("-");
	if (dashIdx <= 0) return undefined;
	const algo = integrity.slice(0, dashIdx);
	const expectedBase64 = integrity.slice(dashIdx + 1);
	const actualHex = subjectDigest[algo];
	if (actualHex === undefined) return undefined;
	let actualBase64: string;
	try {
		actualBase64 = Buffer.from(actualHex, "hex").toString("base64");
	} catch {
		return undefined;
	}
	return actualBase64 === expectedBase64;
}

/**
 * Emits a human-readable rendering of {@link ProvenanceDetails} as one
 * `key: value` line per populated field, prefixed by `indent`. Skipped
 * fields produce no output. On verification failure only the error line
 * is printed so the report stays compact.
 */
export function renderProvenanceDetails(
	indent: string,
	details: ProvenanceDetails,
	emit: (line: string) => void,
): void {
	if (details.verificationError !== undefined) {
		emit(`${indent}provenance: ${details.verificationError}`);
		return;
	}
	emit(`${indent}provenance (verified):`);
	if (details.sourceRepo !== undefined) {
		const refSuffix = details.sourceRef === undefined ? "" : ` @ ${details.sourceRef}`;
		emit(`${indent}  source: ${details.sourceRepo}${refSuffix}`);
	}
	if (details.commit !== undefined) {
		emit(`${indent}  commit: ${details.commit}`);
	}
	if (details.workflowPath !== undefined) {
		emit(`${indent}  workflow: ${details.workflowPath}`);
	}
	if (details.builderId !== undefined) {
		emit(`${indent}  builder: ${details.builderId}`);
	}
	if (details.runUrl !== undefined) {
		emit(`${indent}  run: ${details.runUrl}`);
	}
	if (details.signerIdentity?.subject !== undefined) {
		const issuerSuffix =
			details.signerIdentity.issuer === undefined
				? ""
				: ` (issuer: ${details.signerIdentity.issuer})`;
		emit(`${indent}  signer: ${details.signerIdentity.subject}${issuerSuffix}`);
	}
	if (details.subjectDigestVerified === false) {
		emit(`${indent}  WARNING: attested subject digest does not match registry tarball`);
	}
}
