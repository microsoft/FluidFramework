/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

/**
 * ==========================================================================================
 * THIS IS THE FILE TO EDIT.
 * ==========================================================================================
 *
 * Everything else in this service is plumbing: verify the caller, shape the claims, sign, and
 * respond. This file is the one policy decision — given a verified Entra identity, may this
 * user touch this document, and with what permissions?
 *
 * The default answer is deliberately coarse: any user who successfully authenticated against
 * the configured Entra tenant gets read/write on every document in that tenant. That is a
 * reasonable starting point for a single-organisation deployment where every employee is
 * already trusted, and it is a poor fit for anything else. Replace `authorize` with a rule
 * that reflects your own access model.
 *
 * Fluid's shared-key design bounds what is achievable here. The tenant key authorizes at
 * tenant-membership level, and this service is the only place a per-document decision can be
 * enforced, because riddler validates the signature but not who was entitled to request it.
 * A user who obtains a token for a document can use it until it expires.
 */

const ScopeType = {
	DocRead: "doc:read",
	DocWrite: "doc:write",
	SummaryWrite: "summary:write",
};

/** Full collaboration: read, write, and produce summaries. */
const READ_WRITE_SCOPES = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];

/** Observer access. The client can load and follow a document but cannot submit ops. */
const READ_ONLY_SCOPES = [ScopeType.DocRead];

/**
 * Decide whether a verified user may obtain a token, and which scopes it carries.
 *
 * WARNING when serving more than one tenant: this default grants every authenticated user
 * access to *every* tenant in `allowedTenants`. It checks that the tenant is one this service
 * serves, not that this particular user belongs to it. That is fine when tenants are
 * partitions inside one organisation (per-team, or dev/staging/prod) where everyone is already
 * trusted with all of them. It provides no isolation between tenants that represent different
 * groups of people — use `tenantScopedAuthorize` below for that.
 *
 * @param request - `{ principal, tenantId, documentId, config }`.
 *   `principal` is the Easy Auth verified identity: `{ id, name, tenantId, roles, scopes }`.
 *   `documentId` is `""` when the client is asking for a tenant-scoped token, which happens
 *   when creating a new container before its id exists.
 * @returns `{ allowed, scopes, reason }`. `reason` is surfaced to the caller on denial, so
 *   keep it free of internal detail.
 */
function authorize({ principal, tenantId, documentId, config }) {
	// The service can only sign for tenants whose key it holds. Requests for anything else are
	// refused rather than silently signed with the wrong key.
	if (!config.allowedTenants.includes(tenantId)) {
		return {
			allowed: false,
			scopes: [],
			reason: `Tenant "${tenantId}" is not served by this token service.`,
		};
	}

	void principal;
	void documentId;

	return { allowed: true, scopes: READ_WRITE_SCOPES };
}

// Lets the startup path notice that a multi-tenant deployment is still on the tenant-blind
// default and say so, rather than leaving it to be discovered.
authorize.isDefaultPolicy = true;

/**
 * Alternative policy: grant access per tenant, from Entra app roles.
 *
 * This is the one to reach for when tenants represent different groups of people. Define app
 * roles named `Fluid.<tenantId>.Writer` and `Fluid.<tenantId>.Reader` on the App Registration
 * and assign them in the enterprise application; a user with no role for the tenant they ask
 * for is refused, so tenants are isolated from each other.
 *
 * To adopt it, export this as `authorize` in place of the default above.
 */
function tenantScopedAuthorize({ principal, tenantId, documentId, config }) {
	if (!config.allowedTenants.includes(tenantId)) {
		return {
			allowed: false,
			scopes: [],
			reason: `Tenant "${tenantId}" is not served by this token service.`,
		};
	}

	void documentId;

	if (principal.roles.includes(`Fluid.${tenantId}.Writer`)) {
		return { allowed: true, scopes: READ_WRITE_SCOPES };
	}
	if (principal.roles.includes(`Fluid.${tenantId}.Reader`)) {
		return { allowed: true, scopes: READ_ONLY_SCOPES };
	}

	// Deliberately the same wording whether the tenant exists or the user simply lacks a role,
	// so this cannot be used to enumerate which tenants a deployment serves.
	return {
		allowed: false,
		scopes: [],
		reason: "Account has not been granted access to this tenant.",
	};
}

/**
 * Alternative policy: derive scopes from Entra app roles.
 *
 * Assign `FluidCollaborator` and `FluidReader` as app roles on the App Registration, grant
 * them to users or groups in the enterprise application, and Easy Auth surfaces them in the
 * `roles` claim. Users holding neither role are refused, so access becomes something granted
 * in Entra rather than implied by having an account.
 *
 * To adopt it, export this as `authorize` in place of the default above.
 */
function roleBasedAuthorize({ principal, tenantId, documentId, config }) {
	if (!config.allowedTenants.includes(tenantId)) {
		return {
			allowed: false,
			scopes: [],
			reason: `Tenant "${tenantId}" is not served by this token service.`,
		};
	}

	void documentId;

	if (principal.roles.includes("FluidCollaborator")) {
		return { allowed: true, scopes: READ_WRITE_SCOPES };
	}
	if (principal.roles.includes("FluidReader")) {
		return { allowed: true, scopes: READ_ONLY_SCOPES };
	}

	return {
		allowed: false,
		scopes: [],
		reason: "Account has not been granted access to this application.",
	};
}

/**
 * The policies this service ships with, selectable by name so a deployment can switch without
 * a code change. Replacing one of these -- or adding your own here -- remains the intended way
 * to express an access model this file does not cover.
 */
const POLICIES = {
	/** Any authenticated user, every served tenant, full collaboration. */
	default: authorize,
	/** Access granted per tenant via `Fluid.<tenantId>.Writer` / `.Reader` app roles. */
	"tenant-scoped": tenantScopedAuthorize,
	/** Access granted service-wide via `FluidCollaborator` / `FluidReader` app roles. */
	"role-based": roleBasedAuthorize,
};

/**
 * Resolve a policy by name.
 *
 * @throws Error naming the valid values, so a typo in configuration fails at startup rather
 *   than silently falling back to the most permissive policy.
 */
function selectPolicy(name) {
	const policy = POLICIES[name];
	if (!policy) {
		throw new Error(
			`Unknown authorization policy "${name}". Valid values: ${Object.keys(POLICIES).join(", ")}.`,
		);
	}
	return policy;
}

module.exports = {
	READ_ONLY_SCOPES,
	READ_WRITE_SCOPES,
	ScopeType,
	authorize,
	roleBasedAuthorize,
	tenantScopedAuthorize,
	POLICIES,
	selectPolicy,
};
