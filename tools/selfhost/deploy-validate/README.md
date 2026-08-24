# deploy-validate

Validates that a live `azure/deploy.sh` deployment actually works for a real Fluid client, by
running the same two-client scenario: connect, create/attach a document, exchange real-time
ops, load the document in a second client, converge, and confirm both clients appear in the
audience.

## Prerequisites

Both modes need:

- `az` and `kubectl` already authenticated against the target cluster (same as `azure/deploy.sh`
  and `tenant-admin/tenant-admin.sh` require).
- Node.js >= 18 and `npm` installed locally. This is the only tool in this repo needing a local
  Node runtime outside a container -- `tenant-admin` runs inside the cluster instead. Dependencies
  install themselves on first run, so there is no separate setup step.

`--token-service` additionally needs:

- The token service already deployed (`token-service/deploy-token-service.sh`).
- A `tokenService` block in your parameters file naming the deployed `functionAppName`.
- The signed-in Azure CLI user granted the **Writer** role on the token service's enterprise
  application. Without it the run stops at the first token request and prints the role name plus
  portal links for assigning it.

## Usage

```bash
./deploy-validate.sh                                  # uses ../azure/deploy.parameters.json
./deploy-validate.sh --params path/to/other-params.json
./deploy-validate.sh --token-service                  # use the deployed token service
./deploy-validate.sh --token-service --params path/to/other-params.json
./deploy-validate.sh --tenant another-tenant          # override the tenant in either mode
```

The script writes `.deployment-config.json` (gitignored) with the deployment's endpoints and
tenant ID, then asks whether to run the tests now. If you decline, re-run the script later to
pick up where you left off -- the config file is reused if still present.

By default, the validator reads the tenant key through tenant-admin and signs test tokens
locally. A configured `tokenService` block does not change that behavior; token-service
validation is enabled only when `--token-service` is passed. That mode instead discovers
`tokenService.functionAppName` and its Easy Auth
registration, acquires the configured `Fluid.Token.Issue` delegated scope through the signed-in
Azure CLI user, and sends authenticated POST requests to `/api/token`. If that Azure CLI login
has not consented to the scope yet, the script starts an interactive scoped sign-in.

The token-service mode does not read the tenant key. The Entra access token is kept only in the
validator process environment and is not written to `.deployment-config.json`. The browser
login authenticates Azure CLI; the shell wrapper then acquires the access token, exports
`DEPLOY_VALIDATE_ENTRA_ACCESS_TOKEN`, and starts the Node validator as its child process.
Because this is a server-side Node client, browser CORS and SPA redirect URI settings do not
apply.

The default tenant is `fluid`. In token-service mode,
`tokenService.tenantId` changes that default. Pass `--tenant <tenant-id>` to override it for
either mode.

Before starting the Fluid scenario, the validator requests one token to check authentication
and authorization. Setup failures point back to the App Registration/Easy Auth instructions.
Missing-role failures name the required Writer role and print Azure Portal and Microsoft Learn
links for creating and assigning it. Set `tokenService.servicePrincipalObjectId` to the
enterprise application's Object ID for a direct Azure Portal assignment link when Microsoft
Graph is blocked.

### What token-service mode validates

The existing create/attach, cold-load, real-time synchronization, and audience scenario runs
unchanged. Its token provider requests fresh tenant-scoped tokens for single-use document
creation and caches document-scoped tokens until refresh. A passing run therefore covers:

- Azure CLI user authentication and delegated-scope consent.
- Easy Auth audience/issuer validation and verified principal forwarding.
- Token-service authorization, tenant key resolution, and Fluid JWT minting.
- Routerlicious signature/scope acceptance for the minted token.

## What this does NOT test

Without `--token-service`, the validator still signs locally and does not exercise the token
service.

Non-happy-path scenarios (restart-mid-op, network partition, storage growth/GC) are out of
scope.
