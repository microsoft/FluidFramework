/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { WebApi } from "azure-devops-node-api";
import { unzipSync } from "fflate";

/**
 * The decompressed contents of a downloaded ADO pipeline artifact, keyed by file path
 * relative to the artifact's top-level folder. ADO wraps every artifact's content in a
 * top-level folder named after the artifact; the prefix is stripped here so consumers
 * see a flat path map.
 */
export type ArtifactContents = { [path: string]: Uint8Array };

/**
 * Downloads an ADO pipeline artifact, decompresses it, and returns its contents as a
 * flat `path -> bytes` map. Paths are relative to the artifact's top-level folder
 * (i.e. the `<artifactName>/` prefix is stripped).
 */
export async function downloadArtifact(
	adoApi: WebApi,
	project: string,
	buildId: number,
	artifactName: string,
): Promise<ArtifactContents> {
	const buildApi = await adoApi.getBuildApi();

	// IMPORTANT
	// getArtifactContentZip() in the azure-devops-node-api package tries to download pipeline artifacts using an
	// API version (in the http request's accept header) that isn't supported by the artifact download endpoint.
	// One way of getting around that is by temporarily removing the API version that the package adds, to force
	// it to use a supported one. Restore via try/finally so a thrown download doesn't leak the override into
	// subsequent ADO calls on the same buildApi.
	// See https://github.com/microsoft/azure-devops-node-api/issues/432 for more details.
	const originalCreateAcceptHeader = buildApi.createAcceptHeader;
	let artifactStream: NodeJS.ReadableStream;
	try {
		buildApi.createAcceptHeader = (type: string): string => type;
		artifactStream = await buildApi.getArtifactContentZip(project, buildId, artifactName);
	} finally {
		buildApi.createAcceptHeader = originalCreateAcceptHeader;
	}

	const unzipped = unzipSync(await readStreamAsUint8Array(artifactStream));

	// ADO wraps the artifact contents in a top-level folder named after the artifact.
	// Strip that prefix so callers see paths relative to the artifact root.
	const prefix = `${artifactName}/`;
	const result: ArtifactContents = {};
	for (const [path, bytes] of Object.entries(unzipped)) {
		if (path.startsWith(prefix)) {
			result[path.slice(prefix.length)] = bytes;
		}
	}
	assert(
		Object.keys(result).length > 0,
		`downloadArtifact could not find the folder ${artifactName}`,
	);

	return result;
}

async function readStreamAsUint8Array(stream: NodeJS.ReadableStream): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		stream.on("data", (chunk: Buffer) => chunks.push(chunk));
		stream.once("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
		stream.once("error", reject);
	});
}
