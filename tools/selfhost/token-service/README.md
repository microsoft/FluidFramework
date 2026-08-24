# Fluid token service — reference implementation

A working, deployable token-minting service for the self-hosted Fluid stack. It authenticates
end users with Microsoft Entra ID and issues short-lived Fluid access tokens signed with your
tenant key.

This is a **reference implementation**. It is secure to deploy as-is for a single-organisation
deployment, and it is designed to be edited — most teams should replace the authorization rule in
[`src/authorize.js`](src/authorize.js) with their own.

---

## Why you need something like this

Fluid's authorization model is a shared tenant key. Any backend holding that key can mint a
JWT that Routerlicious accepts:

```
Client ──▶ Token service ──(tenant key)──▶ Fluid JWT ──▶ Routerlicious
```

The key must never reach the browser. A client holding it can forge a token for any user and
any document, so `InsecureTokenProvider` — which does exactly that — is for local development
only. A server-side minting service is what keeps the key private.

Because the token service is the only component that sees a user's identity, it is also the
only place a per-user or per-document access decision can be made. Routerlicious verifies that
a token is correctly signed; it does not know who was entitled to ask for one.

## What this service does

1. **Easy Auth validates the caller.** App Service Authentication is configured in front of the
   function against a dedicated Entra App Registration. A missing, invalid, or expired
   `Authorization: Bearer` token is rejected by the platform with 401 before any of this code
   runs.
2. **Identity comes only from verified claims.** The function reads the platform-injected
   `x-ms-client-principal` header. Nothing from the request body influences who the token says
   you are.
3. **Your policy decides access.** [`src/authorize.js`](src/authorize.js) maps the verified
   identity to a decision and a set of scopes.
4. **A short-lived token is signed.** The tenant key is read from Key Vault via the app's
   managed identity, using a Key Vault reference, so it is never stored in configuration.

### Security properties

| Property                                    | How                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Tenant key never reaches the client         | Signing happens server-side; the key is a Key Vault reference resolved by managed identity |
| Unauthenticated requests get 401            | Easy Auth, plus a fail-closed check in `src/identity.js` if Easy Auth is ever absent       |
| Users from other Entra directories rejected | Single-tenant app registration, plus a `tid` claim check                                   |
| Identity cannot be spoofed                  | Claims come from the platform-verified principal, never request input                      |
| Tokens expire                               | Lifetime is bounded and validated against riddler's `maxTokenLifetimeSec` at startup       |
| Secrets stay out of logs and errors         | Error responses carry no configuration detail                                              |

### What it deliberately does not do

- **No per-document access control by default.** Any authenticated user may obtain a token for
  any document in the tenant. This is the single most likely thing you will want to change; see
  [Customising authorization](#customising-authorization).
- **No token revocation.** An issued token is valid until it expires. Keep token lifetimes short
  or implement a revocation mechanism if necessary.

---

## Deploying

### Prerequisites

- The Fluid stack is deployed (`azure/deploy.sh`) and its tenant exists.
- Azure CLI (`az`) and `jq`, with Azure CLI signed in to the target subscription.
- **Permission to create App Registrations** — the Application Developer directory role or
  `Application.ReadWrite.All`. Subscription Owner does _not_ include this. See
  [Using an existing App Registration](#using-an-existing-app-registration) if you cannot create
  one.

### If Microsoft Graph is blocked (AADSTS530084)

Some directories enforce a conditional access **token protection** policy that the Azure CLI
cannot satisfy — it does not implement token binding. Every `az ad ...` command then fails,
including read-only ones, and no amount of `az login` helps. Microsoft's own tenant is one of
these.

Create the registration in the **Azure portal** instead (a browser session on a compliant device
does satisfy the policy) and give the script its client ID:

```json
"tokenService": {
  "appRegistrationId": "<application (client) id>",
  "appIdUri": "api://<application (client) id>",
  "servicePrincipalObjectId": "<enterprise application object ID>"
}
```

The script then skips Microsoft Graph entirely. Everything else it does runs against ARM, which
this policy does not affect.

`servicePrincipalObjectId` is the **Object ID** on **Entra ID → Enterprise applications →
your application → Overview** (not the App Registration's object ID). It is optional, but lets
the deployment and validation tools print a direct Azure Portal role-assignment link when Graph
is blocked. The scripts resolve it automatically when they are allowed to query Microsoft Graph.

**What to configure on the registration** (Entra ID → App registrations → New registration):

1. **Supported account types** — "Accounts in this organizational directory only". A
   multi-tenant registration would let accounts from any directory authenticate.
2. **Expose an API** → set the Application ID URI (accept the `api://<client ID>` default) →
   **Add a scope**:
   - Scope name: `Fluid.Token.Issue`
   - Who can consent: Admins and users
   - Display name / description: anything meaningful, e.g. "Issue Fluid access tokens"
3. **Authentication** → **Add a platform** → **Single-page application**, and add each browser
   origin (for a local Parcel dev server, `http://localhost:1234`). Skip if only server-side
   callers use the service.
4. **API permissions** → **Grant admin consent** — _optional_. Because step 2 sets the scope to
   "Admins and users", each user simply consents once at first sign-in instead. The button is
   greyed out unless you hold Privileged Role Administrator or Global Administrator, which is
   normal and not a blocker.

Then set `appRegistrationId` (and `appIdUri` if you changed it from the default) and run the
deploy script.

For tenant-scoped or role-based authorization, the deploy script prints direct Azure Portal
links for both role management pages:

- **Create/check roles:** App registrations → App roles.
- **Assign roles:** Enterprise applications → Users and groups.

You only need an administrator for consent if sign-in fails with **AADSTS65001** or
**AADSTS90094** ("need admin approval"). That means either the scope's "Who can consent" is set
to admins only — check step 2 — or the directory has user consent switched off, in which case an
admin has to grant it once for everyone.

### Using an existing App Registration

When Microsoft Graph is available, set `tokenService.appRegistrationName` to the registration's
display name and the script reuses it instead of creating one. The signed-in caller still needs
permission to update that registration. If Graph is blocked, configure the registration in the
portal and set `tokenService.appRegistrationId` instead, as described above.

Reuse is non-destructive. The script adds its `Fluid.Token.Issue` scope to whatever scopes the
registration already exposes rather than replacing them, leaves an existing identifier URI
alone (and uses it for the client scope and Easy Auth audience), and merges redirect URIs.

Two things to weigh before sharing a registration with another application:

- **The audience is shared.** Anyone who can obtain a token for that registration can call the
  token service. Whether that is acceptable depends on who already holds tokens for it. A
  dedicated registration keeps that boundary crisp.
- **Consent is per-registration.** Users consenting to `Fluid.Token.Issue` see it alongside the
  other permissions that registration requests.

### Steps

Add a `tokenService` block to your `azure/deploy.parameters.json` (see
[`deploy.parameters.example.json`](../azure/deploy.parameters.example.json)), then:

```bash
token-service/deploy-token-service.sh
```

The script creates the App Registration, a Storage Account, and a Linux Function App on the
selected hosting plan. It enables a system-assigned managed identity, grants it
`Key Vault Secrets User`, copies the tenant key into Key Vault, configures Easy Auth, deploys
the code, and verifies that an unauthenticated request is rejected.

It is safe to re-run; each step checks for an existing resource first.

The script is designed to run from the signed-in Azure user's workstation. If Key Vault is
private-endpoint-only, it temporarily enables public network access while copying tenant keys,
then restores the original setting immediately; an exit trap also restores it after a failure or
interruption. A `Key Vault Secrets Officer` assignment created for the caller is removed on exit.

### Hosting plan

`tokenService.hostingPlan` selects how the Function App is hosted:

| Property                                             | `flex` (default) | `consumption`                   |
| ---------------------------------------------------- | ---------------- | ------------------------------- |
| Infrastructure                                       | Flex Consumption | Classic Linux Consumption (Y1)  |
| Cost                                                 | Pay per use      | Pay per use, marginally cheaper |
| VNet integration                                     | Supported        | Not supported                   |
| Shares a resource group with other App Service plans | Yes              | **No**                          |

`flex` is the default because classic Linux Consumption runs on shared stamps that cannot
coexist with another App Service plan in the same resource group, and in tightly
policy-governed subscriptions its host can fail to start with a bare 503 and no diagnosable
cause. Flex runs on different infrastructure and does not have either problem. Choose
`consumption` only if Flex is unavailable in your region — check with
`az functionapp list-flexconsumption-locations`.

### Which resource group

`tokenService.resourceGroup` defaults to the main `resourceGroup`. Set it to a separate group
when using classic `consumption` if that group already contains **any** App Service plan. Azure
will not create a Linux Consumption Function App alongside one because Consumption runs on
dedicated stamps and a resource group is bound to one kind. The failure is not clear: create
attempts return `Cannot acquire exclusive lock` or a `GatewayTimeout`. Flex does not have this
restriction.

```json
"tokenService": { "resourceGroup": "my-fluid-rg-tokensvc" }
```

The script creates the group if it does not exist, and checks for this conflict up front rather
than letting it surface as a timeout. Key Vault is still reached in the main group by resource
id, so nothing else changes.

An interrupted deploy can also leave a site of the wrong shape behind — typically a Windows app
on a Free plan, which `az functionapp show` does not report. The script detects that by name and
tells you what to delete.

Optionally grant tenant-wide admin consent for the API scope so users are not each prompted at
first sign-in:

```bash
az ad app permission admin-consent --id <app ID printed by the script>
```

### Verifying by hand

```bash
# Must return 401.
curl -s -X POST -H "Content-Type: application/json" -d '{}' \
  -o /dev/null -w '%{http_code}\n' https://<function-app>.azurewebsites.net/api/token

# With a valid Entra token, returns {"token":"...","expiresAt":...}.
curl -s -H "Authorization: Bearer $ENTRA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"fluid","documentId":"my-doc"}' \
  "https://<function-app>.azurewebsites.net/api/token" | jq .
```

If the first command returns 200, Easy Auth is not enforcing. Do not use the deployment until
`az webapp auth show` reports `enabled: true`.

Token requests use POST with a JSON body. Every response uses `Cache-Control: no-store, private`
and related anti-cache headers so a Fluid JWT cannot be stored by an intermediary.

---

## Connecting a client

`AzureFunctionTokenProvider` from the Fluid client packages **cannot** be used with this
service because it cannot acquire and present the Entra access token required by Easy Auth.

Use [`client/entraTokenProvider.js`](client/entraTokenProvider.js) instead — an `ITokenProvider`
that acquires an Entra token, calls this service, and caches the result until shortly before it
expires.

```js
import { PublicClientApplication } from "@azure/msal-browser";
import { EntraTokenProvider } from "./entraTokenProvider.js";

const msal = new PublicClientApplication({
  auth: {
    clientId: "<app ID>",
    authority: "https://login.microsoftonline.com/<Entra tenant ID>",
  },
});
await msal.initialize();

const tokenProvider = new EntraTokenProvider(
  "https://<function-app>.azurewebsites.net/api/token",
  async () => {
    const account =
      msal.getAllAccounts()[0] ?? (await msal.loginPopup()).account;
    const result = await msal.acquireTokenSilent({
      account,
      scopes: ["api://<app ID>/Fluid.Token.Issue"],
    });
    return result.accessToken;
  },
);

const client = new AzureClient({
  connection: {
    type: "remote",
    tenantId: "fluid",
    tokenProvider,
    endpoint: "<alfred url>",
  },
});
```

The client app registration needs the app's origin registered as an SPA redirect URI — list it
under `tokenService.spaRedirectUris` and the deploy script registers it, merging with anything
already there so a re-run never unregisters an origin you are still using.

### Browser origins (CORS)

A browser calling this endpoint sends an `Authorization` header, which makes it issue a
preflight `OPTIONS` request first. List every origin that will call the service:

```json
"tokenService": {
  "allowedOrigins": ["https://my-app.example.com", "http://localhost:1234"]
}
```

or afterwards:

```bash
az functionapp cors add -g <rg> -n <function app> -a https://my-app.example.com
```

Configure CORS **at the platform level**, as above — not in function code. App Service answers
the preflight itself, before Easy Auth runs. Headers emitted from application code would sit
behind Easy Auth, so the preflight (which carries no credentials) would be refused with 401 and
the browser would report an opaque CORS failure with no sign of the real cause.

Server-side callers are unaffected; CORS is a browser mechanism only.
Wildcard (`*`) origins are rejected by the deployment script.

---

## Customising authorization

[`src/authorize.js`](src/authorize.js) defines the built-in policies and is the file to edit for
a custom policy. Every policy has this shape:

```js
authorize({ principal, tenantId, documentId, config });
// → { allowed: boolean, scopes: string[], reason?: string }
```

`principal` is the verified identity: `{ id, name, tenantId, roles, scopes }`, where `id` is the
Entra object ID.

**The default policy** grants `doc:read`, `doc:write`, and `summary:write` to any user who
authenticated against the configured Entra tenant. That suits a deployment where everyone in
the directory is already trusted with every document. It is a poor fit for anything else.

Select one with `tokenService.authorizationPolicy` (`FLUID_AUTHORIZATION_POLICY`), so changing
the access model does not require editing code:

| Value           | Who gets access                                                 |
| --------------- | --------------------------------------------------------------- |
| `default`       | Any authenticated user, every served tenant, read/write         |
| `tenant-scoped` | Per tenant, via `Fluid.<tenantId>.Writer` / `.Reader` app roles |
| `role-based`    | Service-wide, via `FluidCollaborator` / `FluidReader` app roles |

An unrecognised name fails at startup rather than falling back to `default`, since a typo would
otherwise silently grant everyone access to everything.

**A role-based policy** ships alongside it as `roleBasedAuthorize`. Define `FluidCollaborator`
and `FluidReader` app roles on the App Registration, assign them in the enterprise application,
and access becomes something granted in Entra rather than implied by having an account.
Select `role-based` with `tokenService.authorizationPolicy` to adopt it. This policy grants
access to any tenant or document, but that access is scoped behind the roles.

**A tenant-scoped policy** ships as `tenantScopedAuthorize`, for deployments serving several
tenants that belong to different groups of people. It reads app roles named
`Fluid.<tenantId>.Writer` and `Fluid.<tenantId>.Reader`, so a user granted access to
`marketing` cannot obtain a token for `fluid`. Denials use identical wording whether the tenant
is unknown or the user simply lacks the role, so the endpoint cannot be used to enumerate which
tenants exist.

Using it means defining those app roles on the App Registration and assigning them, otherwise
every request is refused — a user with no matching role has no access. For each tenant, add an
app role with **Allowed member types: Users/Groups** and value `Fluid.<tenantId>.Writer` (and
`.Reader` if you want observers), then assign it under **Enterprise applications → your app →
Users and groups**. The role names are case-sensitive and must match the tenant ID exactly.

**A per-document policy** is the usual next step. Look the document up in your own store and
decide from there. `authorize` may be async:

```js
async function authorize({ principal, tenantId, documentId, config }) {
  if (!config.allowedTenants.includes(tenantId)) {
    return { allowed: false, scopes: [], reason: "Unknown tenant." };
  }
  if (documentId === "") {
    // No document yet — the client is about to create one.
    return { allowed: true, scopes: READ_WRITE_SCOPES };
  }
  const acl = await myDatabase.getDocumentAcl(documentId);
  if (acl.editors.includes(principal.id))
    return { allowed: true, scopes: READ_WRITE_SCOPES };
  if (acl.viewers.includes(principal.id))
    return { allowed: true, scopes: READ_ONLY_SCOPES };
  return { allowed: false, scopes: [], reason: "No access to this document." };
}
```

Add a custom policy to `POLICIES` and select it through `tokenService.authorizationPolicy`. The
handler awaits the decision, so no change to [`src/handler.js`](src/handler.js) is needed.

---

## Configuration

| Setting                          | Required          | Default           | Purpose                                                                                                                                                                                     |
| -------------------------------- | ----------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FLUID_TENANT_KEY`               | yes               | —                 | Signing key for `FLUID_TENANT_ID`. Set to a Key Vault reference, never a literal.                                                                                                           |
| `FLUID_TENANT_ID`                | no                | `fluid`           | Tenant used when the request does not name one.                                                                                                                                             |
| `FLUID_ALLOWED_TENANTS`          | no                | `FLUID_TENANT_ID` | Comma-separated tenants this service will sign for. Each additional tenant needs its own key setting. Set by the deploy script from `tokenService.additionalTenants`.                      |
| `FLUID_TENANT_KEY_<TENANT>`      | for extra tenants | —                 | Signing key for one additional tenant. Uppercase the tenant ID and replace dashes with underscores: `eng-team` → `FLUID_TENANT_KEY_ENG_TEAM`.                                               |
| `FLUID_TOKEN_LIFETIME_SEC`       | no                | `3600`            | Lifetime of issued tokens.                                                                                                                                                                  |
| `FLUID_MAX_TOKEN_LIFETIME_SEC`   | no                | `3600`            | riddler's ceiling. Startup fails if the lifetime exceeds it.                                                                                                                                |
| `FLUID_ENTRA_TENANT_ID`          | no                | —                 | Entra directory to accept. Strongly recommended.                                                                                                                                            |
| `FLUID_AUTHORIZATION_POLICY`     | no                | `default`         | Which authorization policy decides a caller's scopes: `default`, `tenant-scoped`, or `role-based`. Set by the deploy script from `tokenService.authorizationPolicy`.                        |
| `FLUID_DIAGNOSTIC_MODE`          | no                | `false`           | Returns the startup configuration error in the HTTP 500 body instead of only the logs. That message names app settings and Key Vault URIs, so leave it off unless the logs are unreachable. |
| `FLUID_ALLOW_INSECURE_LOCAL_DEV` | no                | `false`           | Local development only. Refused when running in Azure.                                                                                                                                      |

### Serving more than one tenant

A tenant key signs for exactly one tenant, so every tenant this service serves needs its own
key. List them and the deploy script provisions each one:

```json
"tokenService": {
  "tenantId": "fluid",
  "additionalTenants": ["marketing", "eng-team"]
}
```

Each key is stored as its own Key Vault secret (`fluid-tenant-key-<tenant>`) so it can be
rotated independently, and exposed as `FLUID_TENANT_KEY_<TENANT>`.

Listing a tenant without setting its key fails at startup rather than minting tokens signed
with the wrong key — those would look fine here and then be rejected by riddler at connect time.

> **Multiple tenants need a different authorization policy.** The default `authorize()` checks
> that a tenant is _served_, not that the caller belongs to it, so every authenticated user can
> mint a token for every configured tenant. Nothing at runtime makes this visible — each request
> simply succeeds. That is fine when tenants are partitions inside one organisation (per-team,
> or dev/staging/prod). If they represent different groups of people, switch to
> `tenant-scoped` authorization before relying on it. The deploy script and the service both warn
> when more than one tenant is configured on the default policy.

To add a tenant to an already-deployed service, re-run `deploy-token-service.sh` after adding
it to `additionalTenants`; existing secrets are left untouched.

### Keeping in step with riddler

`FLUID_TOKEN_LIFETIME_SEC` must not exceed riddler's `auth.maxTokenLifetimeSec` in
[`routerlicious-values.yaml`](../azure/routerlicious-values.yaml). When
`auth.enableTokenExpiration` is true, riddler rejects any token whose declared lifetime is
larger, so a mismatch produces tokens that fail at connect time. The service refuses to start
on a mismatch rather than mint tokens that cannot work.

### Rotating the tenant key

Rotate one key at a time. Tokens stay valid only if you rotate the key this service is **not**
currently using. `tenant-admin rotate` enforces that: it compares the key you asked to rotate
against `fluid-tenant-key-<tenantId>` in Key Vault and refuses if they match, because riddler
invalidates the old key immediately and every token minted here would be rejected until the
vault caught up.

So, starting from this service signing with `key1`:

```bash
# 1. Rotate the key nobody is using. Allowed, because key1 is the one in the vault.
NEW_KEY=$(tenant-admin/tenant-admin.sh rotate fluid --key key2 | jq -r .keys.key2)

# 2. Point this service at it.
az keyvault secret set --vault-name <vault> --name fluid-tenant-key-fluid --value "$NEW_KEY"
az functionapp restart -g <rg> -n <function app>

# 3. Confirm minting is healthy, then retire the old key. Now allowed: key2 is in the vault.
tenant-admin/tenant-admin.sh rotate fluid --key key1
```

`--force` overrides the check if you must rotate the in-use key; update the secret immediately
afterwards, since minting is broken until you do.

---

## Local development

```bash
npm install
FLUID_TENANT_KEY=<a test key> FLUID_ALLOW_INSECURE_LOCAL_DEV=true npm start
```

`FLUID_ALLOW_INSECURE_LOCAL_DEV` issues tokens to unauthenticated callers because there is no
Easy Auth front end on a developer machine. Startup fails if it is ever set on a deployed
Function App.

## Tests

```bash
npm test
```

The core security logic is covered by the Node test suite; deployment installs only the Azure
Functions runtime dependency.

[`test/riddlerCompat.test.js`](test/riddlerCompat.test.js) is worth knowing about: it
reimplements Routerlicious' own `validateTokenClaims` and `validateTokenClaimsExpiration`
verbatim and runs minted tokens through them, so a change that would break real connections
fails here first.
