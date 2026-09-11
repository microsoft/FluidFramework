/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
	const directory = await mkdtemp(path.join(os.tmpdir(), "copy-data-config-"));
	try {
		await writeJson(directory, "inventory.json", {
			tenants: { azureFluidRelayTenant: { selfHostTenantId: "selfHostTenant", documents: ["document"] } },
			errors: [],
		});
		await writeJson(directory, "config.json", {
			inventoryPath: "inventory.json",
			selfHostNamespace: "default",
			resultsDirectory: "results",
			selfHost: { alfredEndpoint: "https://self-host.example", historianEndpoint: "https://self-host.example", subscriptionId: "subscription", resourceGroup: "resource-group", aksName: "aks", contact: "owner@example.com" },
			azureFluidRelayTenants: {
				azureFluidRelayTenant: {
					azureFluidRelayEndpoint: "https://azure-fluid-relay.fluidrelay.azure.com",
					azureFluidRelaySubscriptionId: "azure-fluid-relay-subscription",
					azureFluidRelayResourceGroup: "azure-fluid-relay-resource-group",
					azureFluidRelayServerName: "azure-fluid-relay-server",
				},
			},
		});

		const result = await loadConfiguration(path.join(directory, "config.json"));
		assert.equal(result.inventory.tenants.azureFluidRelayTenant.selfHostTenantId, "selfHostTenant");
		assert.deepEqual(result.warnings, []);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("uses the Azure Fluid Relay tenant ID when selfHostTenantId is missing", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "copy-data-config-"));
	try {
		await writeJson(directory, "inventory.json", { tenants: { azureFluidRelayTenant: { documents: ["document"] } }, errors: [] });
		await writeJson(directory, "config.json", { inventoryPath: "inventory.json", selfHostNamespace: "default", resultsDirectory: "results", selfHost: { alfredEndpoint: "https://self-host.example", historianEndpoint: "https://self-host.example", subscriptionId: "subscription", resourceGroup: "resource-group", aksName: "aks", contact: "owner@example.com" }, azureFluidRelayTenants: { azureFluidRelayTenant: { azureFluidRelayEndpoint: "https://azure-fluid-relay.fluidrelay.azure.com", azureFluidRelaySubscriptionId: "azure-fluid-relay-subscription", azureFluidRelayResourceGroup: "azure-fluid-relay-resource-group", azureFluidRelayServerName: "azure-fluid-relay-server" } } });

		const result = await loadConfiguration(path.join(directory, "config.json"));
		assert.deepEqual(result.warnings, ["Inventory tenant azureFluidRelayTenant has no selfHostTenantId; using the Azure Fluid Relay tenant ID"]);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("rejects an Azure Fluid Relay tenant missing from the inventory", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "copy-data-config-"));
	try {
		await writeJson(directory, "inventory.json", { tenants: { azureFluidRelayTenant: { selfHostTenantId: "selfHostTenant", documents: ["document"] } }, errors: [] });
		await writeJson(directory, "config.json", { inventoryPath: "inventory.json", selfHostNamespace: "default", resultsDirectory: "results", selfHost: { alfredEndpoint: "https://self-host.example", historianEndpoint: "https://self-host.example", subscriptionId: "subscription", resourceGroup: "resource-group", aksName: "aks", contact: "owner@example.com" }, azureFluidRelayTenants: {} });

		await assert.rejects(loadConfiguration(path.join(directory, "config.json")), (error) => {
			assert.ok(error instanceof ConfigurationError);
			return error.message.includes("azureFluidRelayTenants must include inventory tenant azureFluidRelayTenant");
		});
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
