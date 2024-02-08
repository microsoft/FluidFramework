/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	IChannel,
	Serializable,
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { ISharedMatrix, MatrixItem } from "@fluidframework/matrix";

/**
 * Interface for internal communication
 * Additional requirements to channel over standard IChannel interface
 * @internal
 */
export interface ICollabChannelCore {
	readonly value: Serializable<unknown>;
}

/** @internal */
export type ICollabChannel = IChannel & ICollabChannelCore;

/** @internal */
export interface ICollabChannelFactory extends IChannelFactory {
	create2(document: IFluidDataStoreRuntime, id: string, initialValue: unknown): ICollabChannel;
}

/** @internal */
export interface MatrixExternalType {
	value: Serializable<unknown>;
	type: string;
}

/** @internal */
export type CollabSpaceCellType = MatrixItem<MatrixExternalType>;

/** @internal */
export interface IEfficientMatrix extends Omit<ISharedMatrix<MatrixExternalType>, "getCell"> {
	// Semantics of this operation differ substantially from regular matrix.
	// This will overwrite the value of the cell, thus creating a new collab channel (in the future)
	// Usually used to change cell type to a different type.
	// When such change occurs, the old channel that was associated with this cell becomes
	// non-rooted, i.e. it no longer is accosiated wit the cell. Ops might still come in for such channel
	// due to races / offline clients.
	// Old channel could come back to life (become again rooted / associated with cell) through undo!
	setCell(rowArg: number, colArg: number, value: MatrixItem<MatrixExternalType>);

	// TBD(Pri2) - need to get rid of synchronous version, as I do not think we can deliver it.
	// Removing it causes a bunch of type issues, so leaving NYI version for now.
	getCell(row: number, col: number): MatrixItem<MatrixExternalType>;
	getCellAsync(row: number, col: number): Promise<MatrixItem<MatrixExternalType>>;

	// Returns collab channel that is associated with a cell. Type of the channel depeds on type of cell
	// If collab channel already exists, it is returned. Otherwise new channel is created.
	// While channel is active, it represents the truth for a cell. getCell*() API will
	// return channel value while channel exists.
	getCellChannel(row: number, col: number): Promise<ICollabChannelCore>;

	// Save content from channel to cell
	// Operation could fail for multiple reasons:
	//  - due to FWW merge policy used, and another client either doing save or overwriting cell.
	//  - if channel is no longer "rooted" in a cell.
	// In general, this operation does not change how system should evaluate cell value - all clients
	// should continue to treat channel content as a source of truth unless/untill it's safe to destroy channel
	// But it's a prerequisite to ability of clients to destroy channel.
	saveChannelState(channel: ICollabChannelCore);

	// Experimental! It can be called only when condirions are right:
	// - data has been saved to cell in non-conflicting matter.
	//   - this means there are no channel ops in between last save's ref seq number and current point in time!
	// - no records on undo stack
	// Returns true if channel was actually destroyed.
	destroyCellChannel(channel: ICollabChannelCore): boolean;
}

/**
 * Interface for testing purposes only.
 * @internal
 */
export interface ReverseMapsDebugInfoType {
	rowMap: { [id: string]: number };
	colMap: { [id: string]: number };
	row: number;
	col: number;
}

/**
 * Interface for testing purposes only.
 * @internal
 */
export interface IEfficientMatrixTest {
	isAttached: boolean;

	// Returns a structure with various debug info about the cell
	getCellDebugInfo(
		row: number,
		col: number,
	): Promise<{ channel?: ICollabChannelCore; channelId: string; rowId: string; colId: string }>;

	getReverseMapsDebugInfo(
		rowId?: string | undefined,
		colId?: string | undefined,
	): ReverseMapsDebugInfoType;
}

export type ReverseMapType = "row" | "col";

export interface IReverseMap {
	getRowId(rowId: string): number | undefined;
	getColId(colId: string): number | undefined;

	getRowMap(): { [id: string]: number };
	getColMap(): { [id: string]: number };

	removeCellsFromMap(type: ReverseMapType, start: number, count: number): void;

	addCellToMap(type: ReverseMapType, id: string, index: number): void;
}
