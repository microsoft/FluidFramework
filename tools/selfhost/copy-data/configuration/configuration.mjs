/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export class ConfigurationError extends Error {
	constructor(messages) {
		super(messages.join("\n"));
		this.name = "ConfigurationError";
		this.messages = messages;
	}
}

function isString(value) {
	return typeof value === "string" && value.trim() !== "" && !value.includes("<");
}

function requireString(value, name, errors) {
	if (!isString(value)) errors.push(`${name} must be a non-placeholder string`);
}

async function readJson(filePath, name, errors) {
	let text;
	try {
		text = await readFile(filePath, "utf8");
	} catch {
		errors.push(`Unable to read ${name}`);
		return undefined;
	}

	try {
		return JSON.parse(text);
	} catch {
		errors.push(`${name} is not valid JSON`);
		return undefined;
	}
}

function validateInventory(inventory, config, errors, warnings) {
	if (!inventory || typeof inventory !== "object" || !inventory.tenants || typeof inventory.tenants !== "object") {
		errors.push("Inventory must contain tenants");
		return;
	}
	if (!Array.isArray(inventory.errors) || inventory.errors.length > 0) {
		errors.push("Inventory contains unreadable source servers");
	}

	const azureFluidRelayTenants = config.azureFluidRelayTenants;
	if (!azureFluidRelayTenants || typeof azureFluidRelayTenants !== "object") {
		errors.push("azureFluidRelayTenants must be an object");
		return;
	}

	for (const [tenantId, tenant] of Object.entries(inventory.tenants)) {
		if (!isString(tenant?.selfHostTenantId)) {
			warnings.push(`Inventory tenant ${tenantId} has no selfHostTenantId; using the Azure Fluid Relay tenant ID`);
		}
		if (!Array.isArray(tenant?.documents) || tenant.documents.length === 0) {
			errors.push(`Inventory tenant ${tenantId} must contain documents`);
		}
		const azureFluidRelayTenant = azureFluidRelayTenants[tenantId];
		if (!azureFluidRelayTenant || typeof azureFluidRelayTenant !== "object") {
			errors.push(`azureFluidRelayTenants must include inventory tenant ${tenantId}`);
			continue;
		}
		requireString(azureFluidRelayTenant.azureFluidRelayEndpoint, `azureFluidRelayTenants.${tenantId}.azureFluidRelayEndpoint`, errors);
		requireString(azureFluidRelayTenant.azureFluidRelayResourceGroup, `azureFluidRelayTenants.${tenantId}.azureFluidRelayResourceGroup`, errors);
		requireString(azureFluidRelayTenant.azureFluidRelayServerName, `azureFluidRelayTenants.${tenantId}.azureFluidRelayServerName`, errors);
	}

	for (const tenantId of Object.keys(azureFluidRelayTenants)) {
		if (!(tenantId in inventory.tenants)) {
			errors.push(`azureFluidRelayTenants.${tenantId} is not in the inventory`);
		}
	}
}

function validateSelfHost(selfHost, errors) {
	requireString(selfHost?.alfredEndpoint, "selfHost.alfredEndpoint", errors);
	requireString(selfHost?.historianEndpoint, "selfHost.historianEndpoint", errors);
	requireString(selfHost?.subscriptionId, "selfHost.subscriptionId", errors);
	requireString(selfHost?.resourceGroup, "selfHost.resourceGroup", errors);
	requireString(selfHost?.aksName, "selfHost.aksName", errors);
	requireString(selfHost?.contact, "selfHost.contact", errors);
}

/** Load and validate the non-secret inputs for transfer phases. */
export async function loadConfiguration(configPath) {
	const resolvedConfigPath = path.resolve(configPath);
	const readErrors = [];
	const config = await readJson(resolvedConfigPath, "configuration file", readErrors);
	if (config === undefined) throw new ConfigurationError(readErrors);

	const errors = [];
	const warnings = [];
	requireString(config?.inventoryPath, "inventoryPath", errors);
	requireString(config?.selfHostNamespace, "selfHostNamespace", errors);
	requireString(config?.resultsDirectory, "resultsDirectory", errors);
	validateSelfHost(config?.selfHost, errors);
	if (errors.length > 0) throw new ConfigurationError(errors);

	const configDirectory = path.dirname(resolvedConfigPath);
	const inventoryPath = path.resolve(configDirectory, config.inventoryPath);
	const inventory = await readJson(inventoryPath, "inventory file", errors);

	if (inventory !== undefined) validateInventory(inventory, config, errors, warnings);
	if (errors.length > 0) throw new ConfigurationError(errors);

	return { config, configDirectory, inventory, inventoryPath, warnings };
}
