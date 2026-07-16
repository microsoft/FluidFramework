/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IRequest } from "@fluidframework/core-interfaces";

import type {
	IContainerDriverServices,
	IContainerHostProps,
} from "./createAndLoadContainerUtils.js";
import { loadContainerPaused } from "./loadPaused.js";

/**
 * Properties used to materialize a container at a point in document history.
 *
 * @remarks
 * This is distinct from normal container loading. The supplied document service factory must
 * provide a snapshot at or before {@link loadToSequenceNumber} and delta services that can replay
 * the document through that sequence number.
 *
 * @legacy @alpha
 */
export interface ILoadContainerToSequenceNumberProps
	extends IContainerHostProps,
		IContainerDriverServices {
	/**
	 * The request identifying the container instance.
	 */
	readonly request: IRequest;

	/**
	 * The sequence number at which to materialize the container.
	 */
	readonly loadToSequenceNumber: number;

	/**
	 * Cancels replay while waiting for the target sequence number.
	 */
	readonly signal?: AbortSignal;
}

/**
 * Loads a read-only container at a target sequence number.
 *
 * @remarks
 * The returned container is disconnected with inbound and outbound processing paused. It is a
 * historical view and must not be used as a normal collaborative container.
 *
 * @legacy @alpha
 */
export async function loadContainerToSequenceNumber(
	props: ILoadContainerToSequenceNumberProps,
): Promise<IContainer> {
	return loadContainerPaused(props, props.request, props.loadToSequenceNumber, props.signal);
}
