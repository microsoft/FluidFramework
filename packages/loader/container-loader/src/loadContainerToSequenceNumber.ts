/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IRequest } from "@fluidframework/core-interfaces";
import { UsageError } from "@fluidframework/driver-utils/internal";

import type {
	IContainerDriverServices,
	IContainerHostProps,
} from "./createAndLoadContainerUtils.js";
import { loadContainerPaused } from "./loadPaused.js";
import {
	asPointInTimeCapableFactory,
	PointInTimeDocumentServiceFactory,
} from "./pointInTimeServices.js";

/**
 * Properties used to materialize a container at a point in document history.
 *
 * @remarks
 * This is distinct from normal container loading. The supplied
 * {@link IContainerDriverServices.documentServiceFactory} must be able to materialize the document
 * at {@link ILoadContainerToSequenceNumberProps.loadToSequenceNumber} - i.e. it must implement the
 * point-in-time capability the loader detects. For ODSP, pass an
 * `OdspPointInTimeDocumentServiceFactory` directly.
 *
 * @internal
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
	readonly signal?: AbortSignal | undefined;
}

/**
 * Loads a read-only container at a target sequence number.
 *
 * @remarks
 * The returned container is disconnected with inbound and outbound processing paused. It is a
 * historical view and must not be used as a normal collaborative container.
 *
 * The supplied {@link IContainerDriverServices.documentServiceFactory} must support point-in-time
 * loading: it must be able to serve a snapshot at or before
 * {@link ILoadContainerToSequenceNumberProps.loadToSequenceNumber} and replay the document forward
 * through that sequence number. For ODSP, pass an `OdspPointInTimeDocumentServiceFactory` (from
 * `@fluidframework/odsp-driver`) directly - the loader materializes the point-in-time view itself,
 * so no wrapping or decoration is required.
 *
 * @internal
 */
export async function loadContainerToSequenceNumber(
	props: ILoadContainerToSequenceNumberProps,
): Promise<IContainer> {
	const { loadToSequenceNumber, documentServiceFactory } = props;
	if (!Number.isInteger(loadToSequenceNumber) || loadToSequenceNumber < 0) {
		throw new UsageError(
			`loadToSequenceNumber must be a non-negative integer, got ${loadToSequenceNumber}.`,
		);
	}

	const capableFactory = asPointInTimeCapableFactory(documentServiceFactory);
	if (capableFactory === undefined) {
		throw new UsageError(
			"The provided documentServiceFactory does not support point-in-time loading. For ODSP, pass an OdspPointInTimeDocumentServiceFactory.",
		);
	}

	// The loader owns materializing the target: it routes the container's createDocumentService call
	// to the driver's point-in-time service, so the caller never wraps their factory.
	const pointInTimeFactory = new PointInTimeDocumentServiceFactory(
		capableFactory,
		loadToSequenceNumber,
	);

	return loadContainerPaused(
		{ ...props, documentServiceFactory: pointInTimeFactory },
		props.request,
		loadToSequenceNumber,
		props.signal,
	);
}
