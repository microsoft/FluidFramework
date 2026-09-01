/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Tenant id / contact validation and normalization.
//
// Riddler itself performs NO validation on the tenant id: `POST /api/tenants/:id` inserts
// whatever string arrives straight into the Mongo `_id` of the tenants collection. The id then
// flows into a gitrest repository name (a real directory on the snapshot volume) and into URL
// paths on alfred, nexus and historian, so it has to be constrained here instead.
//
// Some hosted Fluid services apply the equivalent normalization (escapeHTML + reject-on-mismatch)
// and lowercase every id/email at their own routing layer. This is the same idea with an explicit
// allowlist, which is stricter and easier to reason about than escaping.

"use strict";

// Lowercase alphanumerics plus internal dashes. Deliberately excludes "." and "/" (path
// traversal into the gitrest volume), whitespace, and anything needing URL escaping.
//
// Underscores are also excluded, even though gitrest and riddler would accept them. The id ends
// up as a directory name on the snapshot volume, a URL path segment, and potentially an Azure
// resource name (Key Vault object names, for example, allow only alphanumerics and dashes).
// Restricting ids to the intersection of what all of those accept keeps a single id valid
// everywhere; dashes already cover the naming need.
const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const TENANT_ID_MIN = 3;
const TENANT_ID_MAX = 64;

// Reserved because they collide with existing riddler/alfred/historian route segments or with
// operational names the stack already uses.
const RESERVED_TENANT_IDS = new Set([
	"api",
	"deltas",
	"documents",
	"healthz",
	"repos",
	"tenants",
	"git",
	"admin",
	"null",
	"undefined",
]);

class ValidationError extends Error {
	constructor(message) {
		super(message);
		this.name = "ValidationError";
	}
}

/**
 * Validate and normalize a tenant id.
 * Normalization is lowercasing only -- an id that needs any other change is rejected rather
 * than silently rewritten, so the caller always knows exactly what id was created.
 * @param {unknown} rawTenantId
 * @returns {string} the normalized tenant id
 */
function normalizeTenantId(rawTenantId) {
	if (typeof rawTenantId !== "string" || rawTenantId.trim() === "") {
		throw new ValidationError("Tenant id is required.");
	}
	const trimmed = rawTenantId.trim();
	const normalized = trimmed.toLowerCase();

	if (normalized.length < TENANT_ID_MIN || normalized.length > TENANT_ID_MAX) {
		throw new ValidationError(
			`Tenant id must be ${TENANT_ID_MIN}-${TENANT_ID_MAX} characters (got ${normalized.length}).`,
		);
	}
	if (!TENANT_ID_PATTERN.test(normalized)) {
		throw new ValidationError(
			`Invalid tenant id "${trimmed}". Use lowercase letters, digits and dashes; ` +
				"it must start and end with a letter or digit.",
		);
	}
	if (RESERVED_TENANT_IDS.has(normalized)) {
		throw new ValidationError(`Tenant id "${normalized}" is reserved.`);
	}
	return normalized;
}

/**
 * Validate and normalize the tenant admin contact.
 * This is ownership metadata, not an authentication principal -- it is stored so an operator can
 * answer "who owns this tenant". Only a light structural check is applied.
 * @param {unknown} rawContact
 * @returns {string} the normalized contact
 */
function normalizeContact(rawContact) {
	if (typeof rawContact !== "string" || rawContact.trim() === "") {
		throw new ValidationError("Tenant admin contact is required (use --contact).");
	}
	const normalized = rawContact.trim().toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
		throw new ValidationError(
			`Invalid tenant admin contact "${rawContact.trim()}". Expected an email address.`,
		);
	}
	return normalized;
}

module.exports = {
	ValidationError,
	normalizeTenantId,
	normalizeContact,
	TENANT_ID_MIN,
	TENANT_ID_MAX,
	RESERVED_TENANT_IDS,
};
