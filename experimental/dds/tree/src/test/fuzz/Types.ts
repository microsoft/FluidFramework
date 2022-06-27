/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TestObjectProvider } from '@fluidframework/test-utils';
import type { IContainer } from '@fluidframework/container-definitions';
import type { BaseFuzzTestState } from '@fluid-internal/stochastic-test-utils';
import type { IFluidDataStoreRuntime } from '@fluidframework/datastore-definitions';
import type { SharedTree } from '../../SharedTree';
import type { WriteFormat } from '../../persisted-types';
import type { Build, Detach, Insert, SetValue } from '../../ChangeTypes';
import type { TreeView } from '../../TreeView';
import type { NodeId } from '../../Identifiers';
import type { NodeIdGenerator } from '../../NodeIdUtilities';

export interface FuzzTestState extends BaseFuzzTestState {
	testObjectProvider?: TestObjectProvider;
	activeCollaborators: Collaborator[];
	passiveCollaborators: Collaborator[];
}

export interface Collaborator {
	container: IContainer;
	tree: SharedTree;
}

export interface TreeEdit {
	type: 'edit';
	contents: FuzzChange;
	/** index of the tree to apply the edit to. */
	index: number;
}

export interface TreeJoin {
	type: 'join';
	summarizeHistory: boolean;
	writeFormat: WriteFormat;
	isObserver: boolean;
}

export interface TreeLeave {
	type: 'leave';
	isObserver: boolean;
	index: number;
}

export interface Synchronize {
	type: 'synchronize';
}

/**
 * Operations:
 * - Any valid edit on any shared tree
 * - New SharedTree joins session with some initial params
 * - Existing SharedTree leaves session
 * - Local server synchronizes connected clients
 *
 * Note that these objects should be JSON serializable for ease in debugging fuzz tests.
 * Future potential work:
 * - More fine-grained control of summarization processes
 */
export type Operation = TreeEdit | TreeJoin | TreeLeave | Synchronize;

export interface FuzzInsert {
	fuzzType: 'insert';
	build: Build;
	insert: Insert;
}

export type FuzzDelete = Detach & { fuzzType: 'delete' };

export interface FuzzMove {
	fuzzType: 'move';
	detach: Detach;
	insert: Insert;
}

export type FuzzSetPayload = SetValue & { fuzzType: 'setPayload' };

export type FuzzChange = FuzzInsert | FuzzDelete | FuzzMove | FuzzSetPayload;

export interface TreeContext {
	view: TreeView;
	idGenerator: NodeIdGenerator;
	idList: NodeId[];
	dataStoreRuntime: IFluidDataStoreRuntime;
}

export interface InsertGenerationConfig {
	/** default: 3 */
	maxTreeSequenceSize?: number;
	/** The number of possible definitions. Default: 20. */
	definitionPoolSize?: number;
}

export interface EditGenerationConfig {
	/** default: Number.POSITIVE_INFINITY (no max size) */
	maxTreeSize?: number;
	/** default: 3 */
	insertWeight?: number;
	/** default: 1 */
	deleteWeight?: number;
	/** default: 1 */
	moveWeight?: number;
	/** default: 1 */
	setPayloadWeight?: number;
	insertConfig?: InsertGenerationConfig;
	/** The number of possible trait labels. Default: 20. */
	traitLabelPoolSize?: number;
}

export interface JoinGenerationConfig {
	/**
	 * Valid `summarizeHistory` values. Defaults to [false].
	 */
	summarizeHistory?: boolean[];
	/**
	 * Valid `writeFormat` values. Defaults to 0.0.2 and 0.1.1.
	 */
	writeFormat?: WriteFormat[];
	/** default: Number.POSITIVE_INFINITY (no max size) */
	maximumPassiveCollaborators?: number;
	/** default: Number.POSITIVE_INFINITY (no max size) */
	maximumActiveCollaborators?: number;
}

export interface OperationGenerationConfig {
	editConfig?: EditGenerationConfig;
	joinConfig?: JoinGenerationConfig;
	/** default: 10 */
	editWeight?: number;
	/** default: 1 */
	joinWeight?: number;
	/** default: 1 */
	leaveWeight?: number;
	/** default: 1 */
	synchronizeWeight?: number;
}
