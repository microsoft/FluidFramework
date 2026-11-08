/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeView } from "@fluidframework/tree";
import { useEffect, useRef, useState, type ReactElement } from "react";

import { toError } from "./bootstrap.js";
import { startHostSession, type HostSessionState } from "./hostSession.js";
import type { Inventory } from "./schema.js";

/**
 * Owns one iframe session without owning the Host's application view.
 */
export function GuestFrame({ view }: { view: TreeView<typeof Inventory> }): ReactElement {
	const mount = useRef<HTMLDivElement>(null);
	const [state, setState] = useState<HostSessionState>({ status: "connecting" });
	useEffect(() => {
		if (mount.current === null) {
			throw new Error("Missing Guest mount element.");
		}
		try {
			return startHostSession(mount.current, view, setState);
		} catch (error) {
			console.error("Failed to start Guest session:", error);
			setState({ status: "error", error: toError(error) });
		}
	}, [view]);

	return (
		<>
			{state.status === "error" ? (
				<p role="alert">Guest error: {state.error.message}</p>
			) : (
				<p role="status" aria-label="Guest connection">
					{state.status === "connected" ? "Connected" : "Connecting"}
				</p>
			)}
			<div ref={mount} />
		</>
	);
}
