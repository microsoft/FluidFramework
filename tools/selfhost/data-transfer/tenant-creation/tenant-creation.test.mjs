import assert from "node:assert/strict";
import test from "node:test";
import { createMissingTenants } from "./tenant-creation.mjs";

const config = {
	targetNamespace: "default",
	target: { subscriptionId: "subscription", resourceGroup: "resource-group", aksName: "aks", contact: "owner@example.com" },
};

test("creates only missing target tenants", async () => {
	const calls = [];
	const execute = async (_file, argumentsList) => {
		calls.push(argumentsList);
		if (argumentsList.at(-1) === "list") return { stdout: JSON.stringify([{ id: "existing" }]) };
		return { stdout: JSON.stringify({ tenantId: "missing", key1: "secret", key2: "secret" }) };
	};
	const created = await createMissingTenants(config, {
		tenants: { sourceOne: { selfHostTenantId: "existing" }, sourceTwo: { selfHostTenantId: "missing" } },
	}, execute);

	assert.deepEqual(created, ["missing"]);
	assert.deepEqual(calls[1].slice(-4), ["create", "missing", "--contact", "owner@example.com"]);
});
