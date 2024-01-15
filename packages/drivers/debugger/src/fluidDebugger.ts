/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { ReplayDocumentService, ReplayDocumentServiceFactory } from "@fluidframework/replay-driver";
import { DebugReplayController } from "./fluidDebuggerController";
import { DebuggerUI } from "./fluidDebuggerUi";

/**
 * @alpha
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace FluidDebugger {
	/**
	 * Creates document service wrapper that pops up Debugger window and allows user to play ops one by one.
	 * User can chose to start with any snapshot
	 * If pop-ups are disabled, we continue without debugger.
	 * @param documentService - original document service to use to fetch ops / snapshots.
	 * @internal
	 */
	export async function createFromService(
		documentService: IDocumentService,
	): Promise<IDocumentService> {
		const controller = createFluidDebugger();
		if (!controller) {
			return documentService;
		}
		return ReplayDocumentService.create(documentService, controller);
	}

	/**
	 * @alpha
	 */
	export async function createFromServiceFactory(
		documentServiceFactory: IDocumentServiceFactory,
	): Promise<IDocumentServiceFactory> {
		const controller = createFluidDebugger();
		if (!controller) {
			return documentServiceFactory;
		}
		return new ReplayDocumentServiceFactory(documentServiceFactory, controller);
	}

	/**
	 * Binds DebuggerUI & DebugReplayController together
	 * These classes do not know each other and talk through interfaces
	 */
	const createFluidDebugger = () =>
		DebugReplayController.create((controller) => DebuggerUI.create(controller));
}
