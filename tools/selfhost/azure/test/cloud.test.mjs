/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const helper = path.resolve(import.meta.dirname, "../../azure-cloud.sh");
const clouds = [
	{
		name: "AzureCloud",
		arm: "https://management.azure.com/",
		authority: "https://login.microsoftonline.com",
		portal: "https://portal.azure.com",
		graph: "https://graph.microsoft.com/",
		acr: ".azurecr.io",
		vault: ".vault.azure.net",
		csi: "AzurePublicCloud",
	},
	{
		name: "AzureUSGovernment",
		arm: "https://management.usgovcloudapi.net/",
		authority: "https://login.microsoftonline.us",
		portal: "https://portal.azure.us",
		graph: "https://graph.microsoft.us/",
		acr: ".azurecr.us",
		vault: ".vault.usgovcloudapi.net",
		csi: "AzureUSGovernmentCloud",
	},
	{
		name: "AzureChinaCloud",
		arm: "https://management.chinacloudapi.cn",
		authority: "https://login.chinacloudapi.cn",
		portal: "https://portal.azure.cn",
		graph: "https://microsoftgraph.chinacloudapi.cn",
		acr: ".azurecr.cn",
		vault: ".vault.azure.cn",
		csi: "AzureChinaCloud",
	},
];

function runCloud(metadata, exit = 0) {
	return spawnSync(
		"bash",
		[
			"-c",
			`
set -euo pipefail
. "$1"
az() { printf '%s' "$CLOUD"; return "$CLOUD_EXIT"; }
load_azure_cloud
printf '%s\\n' "$AZURE_CLOUD_NAME" "$AZURE_RESOURCE_MANAGER" "$AZURE_AUTHORITY_HOST" \
  "$AZURE_PORTAL_URL" "$AZURE_MICROSOFT_GRAPH_RESOURCE" "$AZURE_ACR_SUFFIX" \
  "$AZURE_KEYVAULT_DNS_SUFFIX" "$AZURE_CSI_CLOUD_NAME"
`,
			"_",
			helper,
		],
		{
			encoding: "utf8",
			env: { ...process.env, CLOUD: JSON.stringify(metadata), CLOUD_EXIT: String(exit) },
		},
	);
}

for (const cloud of clouds) {
	test(`${cloud.name} uses its own ARM, identity, registry, vault, and CSI endpoints`, () => {
		const result = runCloud({
			name: cloud.name,
			endpoints: {
				resourceManager: cloud.arm,
				activeDirectory: cloud.authority,
				portal: cloud.portal,
				microsoftGraphResourceId: cloud.graph,
			},
			suffixes: { acrLoginServerEndpoint: cloud.acr, keyvaultDns: cloud.vault },
		});
		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(result.stdout.trim().split("\n"), [
			cloud.name,
			cloud.arm.replace(/\/$/, ""),
			cloud.authority,
			cloud.portal,
			cloud.graph.replace(/\/$/, ""),
			cloud.acr,
			cloud.vault.slice(1),
			cloud.csi,
		]);
	});

	for (const version of ["v1", "v2"]) {
		test(`${cloud.name} discovers the ${version} issuer instead of guessing its hostname`, () => {
			const result = spawnSync(
				"bash",
				[
					"-c",
					`
set -euo pipefail
. "$1"
AZURE_AUTHORITY_HOST="$2"
curl() { printf '%s\\n' "$*" >&2; printf '%s' "$DISCOVERY"; }
azure_token_issuer test-tenant "$3"
`,
					"_",
					helper,
					cloud.authority,
					version,
				],
				{
					encoding: "utf8",
					env: {
						...process.env,
						DISCOVERY: JSON.stringify({ issuer: `${cloud.authority}/discovered-issuer/` }),
					},
				},
			);
			assert.equal(result.status, 0, result.stderr);
			assert.equal(result.stdout.trim(), `${cloud.authority}/discovered-issuer/`);
			assert.ok(
				result.stderr.includes(
					`${cloud.authority}/test-tenant${version === "v2" ? "/v2.0" : ""}/.well-known/openid-configuration`,
				),
			);
		});
	}
}

test("missing and failed cloud metadata queries cannot select commercial defaults", () => {
	for (const metadata of [{}, { name: "AzureUSGovernment" }, null]) {
		const result = runCloud(metadata);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /incomplete cloud endpoint metadata/);
	}
	assert.notEqual(runCloud({}, 1).status, 0);
});

test("issuer discovery rejects missing issuers and transport failures", () => {
	for (const body of ["{}", '{"issuer":null}', '{"issuer":"http://insecure.example"}']) {
		const result = spawnSync(
			"bash",
			[
				"-c",
				'set -o pipefail; . "$1"; AZURE_AUTHORITY_HOST=https://login.example; curl() { printf "%s" "$DISCOVERY"; }; azure_token_issuer tenant v2',
				"_",
				helper,
			],
			{ encoding: "utf8", env: { ...process.env, DISCOVERY: body } },
		);
		assert.notEqual(result.status, 0, body);
	}
	const result = spawnSync("bash", [
		"-c",
		'set -o pipefail; . "$1"; AZURE_AUTHORITY_HOST=https://login.example; curl() { return 1; }; azure_token_issuer tenant v1',
		"_",
		helper,
	]);
	assert.notEqual(result.status, 0);
});
