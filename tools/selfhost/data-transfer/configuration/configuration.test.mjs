import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ConfigurationError, loadConfiguration } from "./configuration.mjs";

async function writeJson(directory, name, value) {
	await writeFile(path.join(directory, name), JSON.stringify(value), "utf8");
}

test("loads a complete configuration", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "data-transfer-config-"));
	try {
		await writeJson(directory, "inventory.json", {
			tenants: { source: { selfHostTenantId: "target", documents: ["document"] } },
			errors: [],
		});
		await writeJson(directory, "config.json", {
			inventoryPath: "inventory.json",
			targetNamespace: "default",
			resultsDirectory: "results",
			target: { historianEndpoint: "https://target.example", subscriptionId: "subscription", resourceGroup: "resource-group", aksName: "aks", contact: "owner@example.com" },
			sourceTenants: {
				source: {
					sourceFluidRelayEndpoint: "https://source.fluidrelay.azure.com",
					sourceResourceGroup: "source-resource-group",
					sourceServerName: "source-server",
				},
			},
		});

		const result = await loadConfiguration(path.join(directory, "config.json"));
		assert.equal(result.inventory.tenants.source.selfHostTenantId, "target");
		assert.deepEqual(result.warnings, []);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("uses the source tenant ID when selfHostTenantId is missing", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "data-transfer-config-"));
	try {
		await writeJson(directory, "inventory.json", { tenants: { source: { documents: ["document"] } }, errors: [] });
		await writeJson(directory, "config.json", { inventoryPath: "inventory.json", targetNamespace: "default", resultsDirectory: "results", target: { historianEndpoint: "https://target.example", subscriptionId: "subscription", resourceGroup: "resource-group", aksName: "aks", contact: "owner@example.com" }, sourceTenants: { source: { sourceFluidRelayEndpoint: "https://source.fluidrelay.azure.com", sourceResourceGroup: "source-resource-group", sourceServerName: "source-server" } } });

		const result = await loadConfiguration(path.join(directory, "config.json"));
		assert.deepEqual(result.warnings, ["Inventory tenant source has no selfHostTenantId; using the Azure Fluid Relay tenant ID"]);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("rejects a source tenant missing from the inventory", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "data-transfer-config-"));
	try {
		await writeJson(directory, "inventory.json", { tenants: { source: { selfHostTenantId: "target", documents: ["document"] } }, errors: [] });
		await writeJson(directory, "config.json", { inventoryPath: "inventory.json", targetNamespace: "default", resultsDirectory: "results", target: { historianEndpoint: "https://target.example", subscriptionId: "subscription", resourceGroup: "resource-group", aksName: "aks", contact: "owner@example.com" }, sourceTenants: {} });

		await assert.rejects(loadConfiguration(path.join(directory, "config.json")), (error) => {
			assert.ok(error instanceof ConfigurationError);
			return error.message.includes("sourceTenants must include inventory tenant source");
		});
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
