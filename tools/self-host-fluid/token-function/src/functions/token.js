// Token-minting Azure Function for the self-hosted Fluid stack.
//
// DO NOT DEPLOY AS A PRODUCTION AUTHENTICATION BOUNDARY. This unfinished prototype
// trusts caller-supplied tenant, document, and user fields and grants broad scopes.
// See ../../../README.md and ../../README.md for the required production controls.
//
// Mints a Fluid access token (HS256 JWT) using the CUSTOMER-HELD tenant key. This
// mirrors @fluidframework/azure-service-utils `generateToken` so that riddler
// (which validates with the same shared key) accepts it. The signing key never
// leaves the server side — clients call this endpoint via AzureFunctionTokenProvider.
//
// App settings (configure on the Function App; source the key from Key Vault):
//   FLUID_TENANT_KEY  (required) — the tenant's shared signing secret
//   FLUID_TENANT_ID   (optional) — default tenant id if the request omits it (default "fluid")
//
// NOTE: authLevel is "function" (requires the function key). For production put the
// customer's identity provider (e.g. Entra / Easy Auth) in front to authenticate the
// end user before a token is issued.

const { app } = require("@azure/functions");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

/**
 * Build a Fluid access token. Claims shape matches ITokenClaims / azure-service-utils
 * generateToken: { documentId, scopes, tenantId, user, iat, exp, ver, jti }, signed HS256.
 */
function generateToken(tenantId, key, scopes, documentId, user) {
	const now = Math.round(Date.now() / 1000);
	const claims = {
		documentId: documentId ?? "",
		scopes,
		tenantId,
		user: user ?? { id: crypto.randomUUID() },
		iat: now,
		exp: now + 60 * 60, // 1 hour
		ver: "1.0",
		jti: crypto.randomUUID(),
	};
	// noTimestamp: we set iat ourselves to match generateToken exactly.
	return jwt.sign(claims, key, { algorithm: "HS256", noTimestamp: true });
}

app.http("token", {
	methods: ["GET", "POST"],
	authLevel: "function",
	handler: async (request, context) => {
		const key = process.env.FLUID_TENANT_KEY;
		if (!key) {
			context.error("FLUID_TENANT_KEY app setting is not configured");
			return { status: 500, body: "Token service misconfigured." };
		}

		// TODO (production): authenticate the end user here (Entra / Easy Auth) and
		// derive tenantId/userId from the verified identity rather than trusting the query.
		const tenantId = request.query.get("tenantId") ?? process.env.FLUID_TENANT_ID ?? "fluid";
		const documentId = request.query.get("documentId") ?? "";
		const userId = request.query.get("id") ?? "anonymous";
		const userName = request.query.get("name") ?? userId;

		const scopes = ["doc:read", "doc:write", "summary:write"];
		const token = generateToken(tenantId, key, scopes, documentId, {
			id: userId,
			name: userName,
		});

		return {
			status: 200,
			headers: { "Content-Type": "text/plain" },
			body: token,
		};
	},
});
