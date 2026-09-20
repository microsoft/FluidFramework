/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { startEphemeralService, getSessionService } from "@fluidframework/local-driver/alpha";
import { createTinyliciousServiceClient } from "@fluidframework/tinylicious-driver/alpha";
/* eslint-disable import-x/no-internal-modules -- Unified ServiceClient types are not yet available from the public entry point. */
import type {
	DataStoreKind,
	FluidContainer,
	ServiceClient,
	ServiceOptions,
} from "@fluidframework/driver-definitions/internal";
/* eslint-enable import-x/no-internal-modules -- Limit the exception to the ServiceClient type import. */
import { createElement, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createSeaExampleServiceClient } from "./seaExampleService.js";

/**
 * This file has some simple example utilities for loading and rendering Fluid containers and data stores.
 */

/**
 * Service options selected by an example application.
 * @internal
 */
export interface ExampleServiceOptions extends ServiceOptions {}

/**
 * Default service options used by example applications.
 * @internal
 */
export const defaultServiceOptions: ExampleServiceOptions = {
	oldestSupportedClient: "2.100.0",
};

/**
 * Configures a service client based on the `fluidClient` URL query parameter.
 *
 * @remarks
 * This helper is designed to work with
 * {@link @fluid-example/webpack-fluid-loader#exampleAppConfig}, which provides the browser
 * compatibility required by the local-driver services.
 * Reads the `fluidClient` URL query parameter.
 * Accepts `ephemeral`, `session`, `tinylicious`, `sea-ephemeral`, `sea-webtransport`, or `sea-websocket`.
 * SEA initializes WASM lazily on first attachment or load, not when selecting a client.
 * Remote SEA requires `seaEndpoint`; WebTransport also requires `seaCertificateHash`.
 * Missing and unknown values default to the session service when session storage is available,
 * or the ephemeral service otherwise.
 *
 * This is intended to be invoked once on startup.
 * It may start a local service as a side-effect.
 *
 * When used in testing and cleanup is required, use the ephemeral service,
 * which can be cleaned up using `cleanupEphemeralService()`.
 *
 * @param options - Options used to configure the service client. Defaults to {@link defaultServiceOptions}.
 * @returns A client for the selected service.
 * @internal
 */
export function getExampleServiceClient(
	options: ExampleServiceOptions = defaultServiceOptions,
): ServiceClient {
	const serviceType = getExampleServiceType(true);
	switch (serviceType) {
		case "sea-ephemeral":
		case "sea-websocket":
		case "sea-webtransport": {
			const parameters = new URLSearchParams(globalThis.location?.search ?? "");
			return createSeaExampleServiceClient(serviceType, options, parameters);
		}
		case "session": {
			return getSessionService().newClient(options);
		}
		case "tinylicious": {
			return createTinyliciousServiceClient(options);
		}
		case "ephemeral": {
			return startEphemeralService().newClient(options);
		}
		default: {
			throw new Error("Unsupported example service");
		}
	}
}

function getExampleServiceType(
	warnUnknown = false,
):
	| "session"
	| "tinylicious"
	| "ephemeral"
	| "sea-ephemeral"
	| "sea-webtransport"
	| "sea-websocket" {
	const fluidClient =
		new URLSearchParams(globalThis.location?.search ?? "").get("fluidClient") ?? "";
	switch (fluidClient) {
		case "session":
		case "tinylicious":
		case "ephemeral":
		case "sea-ephemeral":
		case "sea-webtransport":
		case "sea-websocket": {
			return fluidClient;
		}
		default: {
			if (warnUnknown) {
				console.warn(
					`Unknown fluidClient value: ${JSON.stringify(fluidClient)}, falling back default service.`,
				);
			}
		}
		case "": {
			return globalThis.sessionStorage === undefined ? "ephemeral" : "session";
		}
	}
}

/**
 * Displays a startup error with troubleshooting guidance for the selected example service.
 *
 * @param props - The error to display.
 * @returns An error view suitable for {@link renderRoot} or an existing React root.
 * @remarks
 * Uses the same URL-based service selection as {@link getExampleServiceClient}, without creating a client.
 * Guidance describes possible remedies, not a diagnosis of the error.
 * The caller must catch startup failures and render this view; it does not handle errors or log them.
 * Connection retries can delay startup rejection and therefore delay this view.
 * Render {@link ExampleLoadingView} before starting the connection to show guidance during retries.
 * @internal
 */
export function ExampleErrorView(props: { error: unknown }): ReactElement {
	return createElement(
		"div",
		{ role: "alert" },
		createElement("h2", undefined, "Failed to load document"),
		createElement(
			"p",
			undefined,
			props.error instanceof Error ? props.error.message : String(props.error),
		),
		createElement(ExampleServiceTroubleshooting),
	);
}

/**
 * Displays a connecting message and troubleshooting guidance for the selected example service.
 * @returns A loading view suitable for {@link renderRoot} or an existing React root.
 * @remarks
 * Render before awaiting startup, then replace with the application or {@link ExampleErrorView}.
 * This view does not start a connection, track retries, or impose a timeout.
 * @internal
 */
export function ExampleLoadingView(): ReactElement {
	return createElement(
		"div",
		{ role: "status" },
		createElement("h2", undefined, "Connecting to document..."),
		createElement(ExampleServiceTroubleshooting),
	);
}

function ExampleServiceTroubleshooting(): ReactNode {
	return (
		getExampleServiceType() === "tinylicious" &&
		createElement(
			"section",
			undefined,
			createElement("h3", undefined, "Tinylicious troubleshooting"),
			createElement(
				"ul",
				undefined,
				createElement(
					"li",
					undefined,
					"Start Tinylicious with ",
					createElement("code", undefined, "pnpm tinylicious"),
					" from this example's directory.",
				),
				createElement(
					"li",
					undefined,
					"In Codespaces, forward port 7070 and set its visibility to ",
					createElement("strong", undefined, "Public"),
					", not Private to Organization. See the ",
					createElement(
						"a",
						{
							href: "https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace#sharing-a-port",
						},
						"port forwarding instructions",
					),
					".",
				),
			),
		)
	);
}

/**
 * Loads the container identified by the current URL hash, or creates a container and updates the hash with its ID.
 *
 * @typeParam T - The type of the root data store.
 * @param client - The service client used to load or create the container.
 * @param rootStore - The kind of data store to use as the container root.
 * @returns The loaded or newly attached container.
 * @remarks
 * This function assumes its the only thing using the `location.hash`: if your application uses it for anything else,
 * it should replace use of this function with an appropriate alternative scheme.
 * @internal
 */
export async function createOrLoadExampleContainer<T>(
	client: ServiceClient,
	rootStore: DataStoreKind<T>,
): Promise<FluidContainer<T>> {
	const id = location.hash.slice(1);
	if (id.length > 0) {
		return client.loadContainer(id, rootStore);
	}
	const container = await client.createAttachedContainer(rootStore);
	// eslint-disable-next-line require-atomic-updates -- this example setup assumes this function controls the location hash.
	location.hash = container.id;
	return container;
}

/**
 * Loads an example data store using the service selected by the URL query and the container ID in the URL hash.
 *
 * @typeParam T - The type of the root data store.
 * @param rootStore - The kind of data store to load as the container root.
 * @returns The root data store.
 *
 * @remarks
 * This utility is intentionally very prescriptive.
 * It forces a particular way to select the service client and the container ID,
 * and only handles a single kind of data store at the root level.
 * Simple examples can use it to help keep our set of examples aligned in how they are setup when those
 * examples don't need to demonstrate/customize anything this function controls.
 *
 * This is a simple wrapper around {@link getExampleServiceClient} and {@link createOrLoadExampleContainer}:
 * see them for details.
 *
 * @internal
 */
export async function loadExampleDataStore<T>(rootStore: DataStoreKind<T>): Promise<T> {
	const service = getExampleServiceClient();
	const container = await createOrLoadExampleContainer(service, rootStore);
	return container.data;
}

const roots = new WeakMap<Element, Root>();

/**
 * Renders the provided children in the default `#content` element, reusing its React root on subsequent calls.
 *
 * @param children - The React content to render.
 * @internal
 */
export function renderRoot(children: ReactNode): void {
	const rootElement = document.querySelector("#content");
	if (rootElement === null) {
		throw new Error("No #content element found");
	}
	let root = roots.get(rootElement);
	if (root === undefined) {
		root = createRoot(rootElement);
		roots.set(rootElement, root);
	}
	root.render(children);
}
