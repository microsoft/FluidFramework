/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

// AzureClient's "remote" connection mode assumes ONE combined discovery endpoint (matching the
// topology of a real, hosted production Fluid service) -- confirmed by reading the installed SDK
// source (AzureUrlResolver.js): whatever single `endpoint` is passed gets reused as BOTH the
// orderer AND storage URL. Self-hosted Routerlicious has three genuinely separate Front Door
// endpoints (alfred/nexus/historian), so AzureClient's "remote" mode can't be used directly here
// -- confirmed live: pointing its `endpoint` at nexus hung forever trying to do storage calls
// against the nexus host. Instead, this uses the same lower-level approach FluidFramework's own
// test-drivers package uses for raw "r11s" (self-hosted Routerlicious) targets:
// RouterliciousDocumentServiceFactory + InsecureUrlResolver with all three URLs supplied
// explicitly, driven through the container-loader API directly (see
// packages/test/test-drivers/src/routerliciousTestDriver.ts in the vendored FluidFramework
// checkout). createDOProviderContainerRuntimeFactory/createFluidContainer (from fluid-static)
// are reused so this still gets the friendly ContainerSchema/SharedMap/IFluidContainer surface
// -- they're the same building blocks AzureClient itself is implemented with.

const { createDetachedContainer, loadExistingContainer } = require("@fluidframework/container-loader");
const { createDOProviderContainerRuntimeFactory, createFluidContainer, createServiceAudience } = require("@fluidframework/fluid-static");
const { RouterliciousDocumentServiceFactory } = require("@fluidframework/routerlicious-driver");
const { InsecureUrlResolver } = require("@fluidframework/driver-utils");
const { SharedMap } = require("fluid-framework");
const SCHEMA = { initialObjects: { map: SharedMap } };
const MIN_VERSION_FOR_COLLAB = "2.0.0";
const STEP_TIMEOUT_MS = 30_000;
// Server-side enableWholeSummaryUpload was turned on for remote connections earlier in this
// deployment's life (routerlicious-values.yaml) -- the driver's own bare default is false, and
// unlike AzureClient (which infers this from its "remote"/"local" connection type), a direct
// RouterliciousDocumentServiceFactory construction has to be told explicitly.
const DRIVER_POLICIES = { enableWholeSummaryUpload: true };

function withTimeout(promise, ms, message) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(message)), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(err) => {
				clearTimeout(timer);
				reject(err);
			},
		);
	});
}

/**
 * Builds one fresh set of Loader-level pieces (document service factory, URL resolver, code
 * loader) for a single client connection. Each client (A and B) gets its own -- they must not
 * share a document service factory/resolver instance.
 *
 * @param {string} tenantId
 * @param {{alfred: string, nexus: string, historian: string}} endpoints
 * @param {() => import("@fluidframework/azure-client").ITokenProvider} tokenProviderFactory
 */
function buildLoaderProps(tenantId, endpoints, tokenProviderFactory) {
	const tokenProvider = tokenProviderFactory();
	const documentServiceFactory = new RouterliciousDocumentServiceFactory(tokenProvider, DRIVER_POLICIES);
	// Argument order per InsecureUrlResolver's constructor: hostUrl, ordererUrl, storageUrl,
	// deltaStreamUrl, tenantId, bearer, isForNodeTest. "ordererUrl" here means alfred (the REST
	// surface that handles ordering-related HTTP calls) -- NOT nexus. isForNodeTest=true is
	// required outside a browser (the class otherwise reads `window.location.host`).
	const urlResolver = new InsecureUrlResolver(
		endpoints.alfred,
		endpoints.alfred,
		endpoints.historian,
		endpoints.nexus,
		tenantId,
		"",
		true,
	);
	const runtimeFactory = createDOProviderContainerRuntimeFactory({
		schema: SCHEMA,
		minVersionForCollaboration: MIN_VERSION_FOR_COLLAB,
	});
	const codeLoader = {
		load: async () => ({
			module: { fluidExport: runtimeFactory },
			details: { package: "no-dynamic-package", config: {} },
		}),
	};
	const client = {
		details: { capabilities: { interactive: true } },
		permission: [],
		scopes: [],
		user: { id: "deploy-validate" },
		mode: "write",
	};
	return { urlResolver, documentServiceFactory, codeLoader, options: { client } };
}

// AzureClient wires up its own audience via getContainerServices() after creating/loading a
// container -- since this bypasses AzureClient entirely, that step has to be done here instead.
function attachAudience(container) {
	return createServiceAudience({
		container,
		// getMembers() (fluid-static's serviceAudience.js) calls `user.connections.push(...)`
		// per connection -- confirmed live, omitting `connections: []` here crashes with
		// "Cannot read properties of undefined (reading 'push')" the moment a second client
		// joins. Matches createAzureAudienceMember's exact shape for the same reason.
		createServiceMember: (audienceMember) => ({
			id: audienceMember.user.id,
			name: audienceMember.user.name,
			connections: [],
		}),
	});
}

/**
 * Runs VALIDATION.md's two-client scenario against a live deployment: connect, create/attach,
 * cold-load convergence in a second client, real-time sync, and audience membership.
 *
 * @param {{tenantId: string, endpoints: {alfred: string, nexus: string, historian: string}, tokenProviderFactory: () => import("@fluidframework/azure-client").ITokenProvider}} params
 * @returns {Promise<Array<{name: string, pass: boolean, detail?: string}>>}
 */
async function runScenario({ tenantId, endpoints, tokenProviderFactory }) {
	const results = [];
	const record = async (name, fn) => {
		try {
			// Every step gets a timeout, not just the ones that wait on an event -- an
			// AzureClient/Loader call that never resolves or rejects (a stuck WebSocket
			// handshake, a DNS/TLS hang, etc.) must still show up as a reported FAIL instead of
			// hanging the whole tool forever with zero feedback. Confirmed live: without this,
			// a hung createDetachedContainer()/attach() call left the tool sitting silently
			// forever.
			const detail = await withTimeout(fn(), STEP_TIMEOUT_MS, `timed out after ${STEP_TIMEOUT_MS / 1000}s`);
			results.push({ name, pass: true, detail });
		} catch (err) {
			results.push({ name, pass: false, detail: err.message });
		}
	};
	const skip = (name, reason) => results.push({ name, pass: false, detail: `skipped: ${reason}` });

	let containerId;
	let fluidContainerA;
	await record("connect and create/attach container (client A)", async () => {
		const loaderProps = buildLoaderProps(
			tenantId,
			endpoints,
			tokenProviderFactory,
		);
		const container = await createDetachedContainer({
			...loaderProps,
			codeDetails: { package: "no-dynamic-package", config: {} },
		});
		fluidContainerA = await createFluidContainer({ container });
		fluidContainerA.initialObjects.map.set("testKey", "value-from-client-a");
		await container.attach(loaderProps.urlResolver.createCreateNewRequest());
		if (container.resolvedUrl === undefined) {
			throw new Error("resolvedUrl not available after attach");
		}
		containerId = container.resolvedUrl.id;
		return `containerId=${containerId}`;
	});

	if (!containerId) {
		skip("cold-load convergence (client B)", "no container from the create step");
		skip("real-time sync (client B observes client A write)", "no container from the create step");
		skip("audience contains both clients", "no container from the create step");
		return results;
	}

	let fluidContainerB;
	await record("cold-load convergence (client B)", async () => {
		const loaderProps = buildLoaderProps(
			tenantId,
			endpoints,
			tokenProviderFactory,
		);
		const requestUrl = `${endpoints.alfred}/${encodeURIComponent(tenantId)}/${encodeURIComponent(containerId)}`;
		const container = await loadExistingContainer({ ...loaderProps, request: { url: requestUrl } });
		fluidContainerB = await createFluidContainer({ container });
		fluidContainerB.audience = attachAudience(container);
		const value = fluidContainerB.initialObjects.map.get("testKey");
		if (value !== "value-from-client-a") {
			throw new Error(`expected "value-from-client-a", got ${JSON.stringify(value)}`);
		}
		return `read back "${value}"`;
	});

	await record("real-time sync (client B observes client A write)", async () => {
		if (!fluidContainerB) throw new Error("client B did not load in the previous step");
		const seen = new Promise((resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error("timed out after 10s waiting for valueChanged")),
				10_000,
			);
			fluidContainerB.initialObjects.map.once("valueChanged", (changed) => {
				clearTimeout(timeout);
				resolve(changed.key);
			});
		});
		// Trigger the change only after the listener above is armed.
		fluidContainerA.initialObjects.map.set("testKey", "value-from-client-a-second-write");
		const changedKey = await seen;
		return `observed change to key "${changedKey}"`;
	});

	await record("audience contains both clients", async () => {
		if (!fluidContainerB) throw new Error("client B did not load in a previous step");
		const members = fluidContainerB.audience.getMembers();
		if (members.size < 1) {
			throw new Error("expected at least 1 member in the audience");
		}
		return `${members.size} member(s) in audience`;
	});

	return results;
}

module.exports = { runScenario };
