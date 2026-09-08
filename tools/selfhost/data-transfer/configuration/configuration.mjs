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

	const sourceTenants = config.sourceTenants;
	if (!sourceTenants || typeof sourceTenants !== "object") {
		errors.push("sourceTenants must be an object");
		return;
	}

	for (const [tenantId, tenant] of Object.entries(inventory.tenants)) {
		if (!isString(tenant?.selfHostTenantId)) {
			warnings.push(`Inventory tenant ${tenantId} has no selfHostTenantId; using the Azure Fluid Relay tenant ID`);
		}
		if (!Array.isArray(tenant?.documents) || tenant.documents.length === 0) {
			errors.push(`Inventory tenant ${tenantId} must contain documents`);
		}
		const sourceTenant = sourceTenants[tenantId];
		if (!sourceTenant || typeof sourceTenant !== "object") {
			errors.push(`sourceTenants must include inventory tenant ${tenantId}`);
			continue;
		}
		requireString(sourceTenant.sourceFluidRelayEndpoint, `sourceTenants.${tenantId}.sourceFluidRelayEndpoint`, errors);
		requireString(sourceTenant.sourceResourceGroup, `sourceTenants.${tenantId}.sourceResourceGroup`, errors);
		requireString(sourceTenant.sourceServerName, `sourceTenants.${tenantId}.sourceServerName`, errors);
	}

	for (const tenantId of Object.keys(sourceTenants)) {
		if (!(tenantId in inventory.tenants)) {
			errors.push(`sourceTenants.${tenantId} is not in the inventory`);
		}
	}
}

function validateTargetParameters(parameters, errors) {
	requireString(parameters?.subscriptionId, "Target deployment subscriptionId", errors);
	requireString(parameters?.resourceGroup, "Target deployment resourceGroup", errors);
	requireString(parameters?.aks?.name, "Target deployment aks.name", errors);
	requireString(parameters?.cosmos?.clusterName, "Target deployment cosmos.clusterName", errors);
	requireString(parameters?.storage?.accountName, "Target deployment storage.accountName", errors);
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
	requireString(config?.targetDeploymentParametersPath, "targetDeploymentParametersPath", errors);
	requireString(config?.targetNamespace, "targetNamespace", errors);
	requireString(config?.resultsDirectory, "resultsDirectory", errors);
	if (errors.length > 0) throw new ConfigurationError(errors);

	const configDirectory = path.dirname(resolvedConfigPath);
	const inventoryPath = path.resolve(configDirectory, config.inventoryPath);
	const targetParametersPath = path.resolve(configDirectory, config.targetDeploymentParametersPath);
	const [inventory, targetDeploymentParameters] = await Promise.all([
		readJson(inventoryPath, "inventory file", errors),
		readJson(targetParametersPath, "target deployment parameters", errors),
	]);

	if (inventory !== undefined) validateInventory(inventory, config, errors, warnings);
	if (targetDeploymentParameters !== undefined) validateTargetParameters(targetDeploymentParameters, errors);
	if (errors.length > 0) throw new ConfigurationError(errors);

	return { config, inventory, targetDeploymentParameters, inventoryPath, targetParametersPath, warnings };
}
