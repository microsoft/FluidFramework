/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This example demonstrates the Claims DDS running inside a **real Fluid container**.
 *
 * Today the Claims DDS is an internal building block. The intent is for it to
 * eventually live inside every `PureDataObject` and be reachable through an API on
 * the data object itself. That API does not exist yet, so this example shows the
 * underlying mechanics directly: a custom {@link ResourceManager} data object hosts
 * a Claims DDS, and uses it to claim ownership of *other* DDSes by storing their
 * `IFluidHandle`s as claim values.
 *
 * The example runs entirely in-process against an in-memory ordering service
 * (`LocalDeltaConnectionServer`), but everything else is real: a real container
 * runtime, real ops that roundtrip through the service, and real handle
 * serialization across two independent clients.
 *
 * Scenarios:
 * 1. Claim a resource — client A creates a brand-new SharedMap and claims its handle.
 * 2. Cross-client read — client B loads the same document and resolves the claimed handle.
 * 3. First-writer-wins — client B's competing claim for the same key is rejected.
 * 4. Race — two clients claim a fresh key concurrently; the ordering service picks the winner.
 * 5. Compare-and-swap — client A atomically reassigns a key to a new handle.
 */

import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct/internal";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { ClaimsKind } from "@fluidframework/claims/internal";
import type { IClaims } from "@fluidframework/claims/internal";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import { SharedMap, type ISharedMap } from "@fluidframework/map/internal";
import type { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/internal";
import {
	type ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import {
	LoaderContainerTracker,
	LocalCodeLoader,
	getContainerEntryPointBackCompat,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

// ─── The data object that hosts the Claims DDS ──────────────────────────────────

/**
 * The handle type we claim with. Each resource is represented by its own SharedMap;
 * claiming a key means binding it to that SharedMap's handle.
 */
type ResourceHandle = IFluidHandle<ISharedMap>;

const claimsKey = "claims";

/**
 * A data object that owns a single Claims DDS. This stands in for the future
 * `PureDataObject`-hosted Claims instance: today we create and wire it up by hand.
 */
class ResourceManager extends DataObject {
	private _claims: IClaims<ResourceHandle> | undefined;

	/**
	 * The Claims DDS hosted by this data object.
	 */
	public get claims(): IClaims<ResourceHandle> {
		if (this._claims === undefined) {
			throw new Error("ResourceManager is not initialized");
		}
		return this._claims;
	}

	protected async initializingFirstTime(): Promise<void> {
		// Create the Claims DDS once, when the data object is first created, and
		// publish its handle on the root so every client can find it.
		const claims = ClaimsKind.create(this.runtime) as IClaims<ResourceHandle>;
		this.root.set(claimsKey, claims.handle);
	}

	protected async hasInitialized(): Promise<void> {
		const handle = this.root.get<IFluidHandle<IClaims<ResourceHandle>>>(claimsKey);
		if (handle === undefined) {
			throw new Error("Claims DDS handle missing from root");
		}
		this._claims = await handle.get();
	}

	/**
	 * Creates a brand-new DDS to represent a resource and returns its handle.
	 * In a real app this might be a data store, a SharedTree, or any SharedObject.
	 */
	public createResource(name: string): ResourceHandle {
		const map = SharedMap.create(this.runtime);
		map.set("name", name);
		return map.handle as ResourceHandle;
	}
}

const resourceManagerFactory = new DataObjectFactory({
	type: "resource-manager",
	ctor: ResourceManager,
	sharedObjects: [ClaimsKind.getFactory(), SharedMap.getFactory()],
});

const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
	defaultFactory: resourceManagerFactory,
	registryEntries: [
		[
			resourceManagerFactory.type,
			Promise.resolve<IFluidDataStoreFactory>(resourceManagerFactory),
		],
	],
});

// ─── Container plumbing (real runtime, in-memory ordering service) ───────────────

const codeDetails = { package: "claims-example" };
const documentId = "claims-example-doc";
const documentUrl = `https://localhost/${documentId}`;

interface ClientContext {
	container: IContainer;
	resourceManager: ResourceManager;
}

async function createClient(
	server: ILocalDeltaConnectionServer,
	tracker: LoaderContainerTracker,
): Promise<ClientContext> {
	const container = await createDetachedContainer({
		codeDetails,
		codeLoader: new LocalCodeLoader([[codeDetails, runtimeFactory]]),
		documentServiceFactory: new LocalDocumentServiceFactory(server),
		urlResolver: new LocalResolver(),
	});
	const resourceManager = await getContainerEntryPointBackCompat<ResourceManager>(container);
	await container.attach(new LocalResolver().createCreateNewRequest(documentId));
	await waitForContainerConnection(container);
	tracker.addContainer(container);
	return { container, resourceManager };
}

async function loadClient(
	server: ILocalDeltaConnectionServer,
	tracker: LoaderContainerTracker,
): Promise<ClientContext> {
	const container = await loadExistingContainer({
		codeLoader: new LocalCodeLoader([[codeDetails, runtimeFactory]]),
		documentServiceFactory: new LocalDocumentServiceFactory(server),
		urlResolver: new LocalResolver(),
		request: { url: documentUrl },
	});
	const resourceManager = await getContainerEntryPointBackCompat<ResourceManager>(container);
	await waitForContainerConnection(container);
	tracker.addContainer(container);
	return { container, resourceManager };
}

// ─── Scenario 1: Claim a resource handle ─────────────────────────────────────────

async function scenarioClaimResource(clientA: ClientContext): Promise<void> {
	console.log("═══ Scenario 1: Claim a resource by storing its DDS handle ═══\n");

	const dbHandle = clientA.resourceManager.createResource("primary-database");
	const result = clientA.resourceManager.claims.trySetClaim("database", dbHandle);

	// In a connected container a fresh claim comes back "Pending": the op has been
	// submitted and we await its promise to learn whether it was sequenced first.
	// (In a detached container the same call resolves synchronously instead.)
	const outcome = result.status === "Pending" ? await result.promise : result;

	if (outcome.status === "Accepted") {
		const claimed = await outcome.currentValue.get();
		console.log(`  ✓ Claimed "database". Resource resolves to: "${claimed.get("name")}"`);
	}
	console.log();
}

// ─── Scenario 2: A second client reads the claimed handle ────────────────────────

async function scenarioCrossClientRead(
	clientB: ClientContext,
	tracker: LoaderContainerTracker,
): Promise<void> {
	console.log("═══ Scenario 2: A second client resolves the claimed handle ═══\n");

	await tracker.ensureSynchronized();
	const handle = clientB.resourceManager.claims.get("database");
	if (handle !== undefined) {
		const resource = await handle.get();
		console.log(
			`  ✓ Client B read the claim and resolved the handle to: "${resource.get("name")}"`,
		);
	}
	console.log();
}

// ─── Scenario 3: First-writer-wins ───────────────────────────────────────────────

async function scenarioFirstWriterWins(clientB: ClientContext): Promise<void> {
	console.log("═══ Scenario 3: First-writer-wins — competing claim is rejected ═══\n");

	const competingHandle = clientB.resourceManager.createResource("backup-database");
	const result = clientB.resourceManager.claims.trySetClaim("database", competingHandle);

	// Client B has already observed A's claim, so this is typically rejected
	// synchronously as "AlreadyClaimed"; if not yet observed it resolves the same
	// way once the op roundtrips.
	const outcome = result.status === "Pending" ? await result.promise : result;

	if (outcome.status === "AlreadyClaimed" && outcome.currentValue !== undefined) {
		const winner = await outcome.currentValue.get();
		console.log(`  ✗ Client B's claim was rejected. Winner is still: "${winner.get("name")}"`);
	}
	console.log();
}

// ─── Scenario 4: Race — two clients claim a fresh key concurrently ───────────────

async function scenarioRace(clientA: ClientContext, clientB: ClientContext): Promise<void> {
	console.log("═══ Scenario 4: Race — two clients claim the same fresh key ═══\n");

	const handleA = clientA.resourceManager.createResource("worker-A");
	const handleB = clientB.resourceManager.createResource("worker-B");

	// Both submit before any ops are sequenced — both start "Pending".
	const resultA = clientA.resourceManager.claims.trySetClaim("exclusive-worker", handleA);
	const resultB = clientB.resourceManager.claims.trySetClaim("exclusive-worker", handleB);
	console.log(`  Client A status: "${resultA.status}", Client B status: "${resultB.status}"`);

	// Await each pending claim's promise; the ordering service decides the winner.
	const [settledA, settledB] = await Promise.all([
		resultA.status === "Pending" ? resultA.promise : resultA,
		resultB.status === "Pending" ? resultB.promise : resultB,
	]);

	for (const [label, settled] of [
		["A", settledA],
		["B", settledB],
	] as const) {
		if (settled.status === "Accepted") {
			const won = await settled.currentValue.get();
			console.log(`  → Client ${label} won the race. Worker: "${won.get("name")}"`);
		} else if (settled.status === "AlreadyClaimed" && settled.currentValue !== undefined) {
			const winner = await settled.currentValue.get();
			console.log(`  → Client ${label} lost. Winning worker: "${winner.get("name")}"`);
		}
	}
	console.log();
}

// ─── Scenario 5: Compare-and-swap ────────────────────────────────────────────────

async function scenarioCompareAndSwap(clientA: ClientContext): Promise<void> {
	console.log("═══ Scenario 5: Compare-and-swap — reassign a key to a new handle ═══\n");

	const claims = clientA.resourceManager.claims;

	const v1 = clientA.resourceManager.createResource("config-v1");
	const initial = claims.trySetClaim("config", v1);
	if (initial.status === "Pending") {
		await initial.promise;
	}

	const v2 = clientA.resourceManager.createResource("config-v2");
	const casResult = claims.compareAndSetClaim("config", v2);
	const cas = casResult.status === "Pending" ? await casResult.promise : casResult;

	if (cas.status === "Accepted") {
		const updated = await cas.currentValue.get();
		console.log(`  ✓ CAS succeeded. "config" now resolves to: "${updated.get("name")}"`);
	} else {
		console.log("  ✗ CAS failed — a concurrent write was detected.");
	}
	console.log();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	console.log("╔══════════════════════════════════════════════════════════════╗");
	console.log("║  Claims DDS — Handle-based claiming in a real container       ║");
	console.log("╚══════════════════════════════════════════════════════════════╝\n");

	const server = LocalDeltaConnectionServer.create();
	const tracker = new LoaderContainerTracker();

	const clientA = await createClient(server, tracker);
	const clientB = await loadClient(server, tracker);

	await scenarioClaimResource(clientA);
	await scenarioCrossClientRead(clientB, tracker);
	await scenarioFirstWriterWins(clientB);
	await scenarioRace(clientA, clientB);
	await scenarioCompareAndSwap(clientA);

	clientA.container.dispose();
	clientB.container.dispose();
	await server.close();

	console.log("Done! All scenarios completed successfully.");
}

try {
	await main();
} catch (error: unknown) {
	console.error("Error:", error);
	process.exitCode = 1;
}
