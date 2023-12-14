/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeAtomId } from "../../core";
import {
	CellId,
	HasMarkFields,
	Detach,
	Mark,
	CellMark,
	AttachAndDetach,
	MoveIn,
	MoveOut,
} from "./types";

export type EmptyInputCellMark<TNodeChange> = Mark<TNodeChange> & DetachedCellMark;

export interface DetachedCellMark extends HasMarkFields {
	cellId: CellId;
}

export type EmptyOutputCellMark<TNodeChange> = CellMark<Detach | AttachAndDetach, TNodeChange>;

export type MoveMarkEffect = MoveOut | MoveIn;
export type DetachOfRemovedNodes = Detach & { cellId: CellId };
export type CellRename = AttachAndDetach | DetachOfRemovedNodes;

/**
 * Some marks need to be tagged with information that specifies they used to be the endpoint of a
 * move that has since been cancelled out. This is needed so we can send and apply effects to such marks.
 * This information may be set on the following mark types:
 * - Noop
 * - Delete
 * - MoveOut
 *
 * Note that in the case of MoveOut, this makes the mark a potential receiver of effects from
 * both the MoveIn that corresponds to the MoveOut, and from the MoveIn that corresponds to the cancelled out MoveOut.
 */
export interface VestigialEndpoint {
	vestigialEndpoint: ChangeAtomId;
}

export type VestigialEndpointMark<T> = Mark<T> & VestigialEndpoint;

export function tryGetVestigialEndpoint<T>(mark: Mark<T>): ChangeAtomId | undefined {
	const vestige = (mark as Partial<VestigialEndpoint>).vestigialEndpoint;
	return vestige;
}

export function isVestigialEndpoint<T>(
	mark: Mark<T> | VestigialEndpointMark<T>,
): mark is VestigialEndpointMark<T> {
	const vestige = (mark as Partial<VestigialEndpoint>).vestigialEndpoint;
	return vestige !== undefined;
}
