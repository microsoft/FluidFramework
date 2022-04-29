/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Random from 'random-js';
import { v5 } from 'uuid';
import { IsoBuffer } from '@fluidframework/common-utils';
import { IFluidHandle } from '@fluidframework/core-interfaces';
import { Side, TraitMap, WriteFormat } from '../../persisted-types';
import { BuildNode, ChangeType, StablePlace, StableRange } from '../../ChangeTypes';
import { TraitLocation, TreeView, TreeViewRange } from '../../TreeView';
import { Definition, DetachedSequenceId, NodeId, TraitLabel } from '../../Identifiers';
import { fail } from '../../Common';
import { rangeFromStableRange } from '../../TreeViewUtilities';
import { makeRandom } from '../utilities/TestUtilities';
import {
	done,
	EditGenerationConfig,
	FuzzChange,
	FuzzDelete,
	FuzzInsert,
	FuzzMove,
	FuzzTestState,
	AsyncGenerator,
	InsertGenerationConfig,
	JoinGenerationConfig,
	Operation,
	OperationGenerationConfig,
	TreeContext,
	TreeLeave,
} from './Types';

function uuid(rand: Random): string {
	return v5(rand.string(16), '33f960ec-f1e4-4fca-8dcd-223c6647fcc7');
}

const defaultJoinConfig: Required<JoinGenerationConfig> = {
	maximumActiveCollaborators: 10,
	maximumPassiveCollaborators: 10,
	writeFormat: [WriteFormat.v0_0_2, WriteFormat.v0_1_1],
	summarizeHistory: [false],
};

function makeJoinGenerator(passedConfig: JoinGenerationConfig): AsyncGenerator<Operation, FuzzTestState> {
	const config = { ...defaultJoinConfig, ...passedConfig };
	return async ({ rand, activeCollaborators, passiveCollaborators }) => {
		const activeAllowed = activeCollaborators.length < config.maximumActiveCollaborators;
		const passiveAllowed = passiveCollaborators.length < config.maximumPassiveCollaborators;
		const isObserver =
			activeAllowed && passiveAllowed
				? rand.bool()
				: activeAllowed
				? false
				: passiveAllowed
				? true
				: fail(
						'Cannot generate join op when both active and passive collaborators are at the configured limit.'
				  );
		return {
			type: 'join',
			summarizeHistory: rand.pick(config.summarizeHistory),
			writeFormat: rand.pick(config.writeFormat),
			isObserver,
		};
	};
}

async function leaveGenerator({ rand, activeCollaborators, passiveCollaborators }: FuzzTestState): Promise<TreeLeave> {
	const canUsePassive = passiveCollaborators.length > 0;
	const canUseActive = activeCollaborators.length > 0;
	const isObserver =
		canUsePassive && canUseActive
			? rand.bool()
			: canUsePassive
			? true
			: canUseActive
			? false
			: fail('Cannot generate a leave op when there are no clients.');
	const index = rand.integer(0, (isObserver ? passiveCollaborators : activeCollaborators).length - 1);
	return { type: 'leave', isObserver, index };
}

const defaultInsertConfig: Required<InsertGenerationConfig> = {
	definitionPoolSize: 20,
	maxTreeSequenceSize: 3,
};

const defaultEditConfig: Required<EditGenerationConfig> = {
	maxTreeSize: Number.POSITIVE_INFINITY,
	insertWeight: 3,
	insertConfig: defaultInsertConfig,
	deleteWeight: 1,
	moveWeight: 1,
	setPayloadWeight: 1,
	traitLabelPoolSize: 20,
};

const makeEditGenerator = (passedConfig: EditGenerationConfig): AsyncGenerator<Operation, FuzzTestState> => {
	const config = { ...defaultEditConfig, ...passedConfig };
	const insertConfig = { ...defaultInsertConfig, ...config.insertConfig };
	const poolRand = makeRandom(0);
	const traitLabelPool = Array.from({ length: config.traitLabelPoolSize }, () => uuid(poolRand) as TraitLabel);
	const traitLabelGenerator = ({ rand }: FuzzTestState) => rand.pick(traitLabelPool);

	const definitionPool = Array.from({ length: insertConfig.definitionPoolSize }, () => uuid(poolRand) as Definition);
	const definitionGenerator = ({ rand }: FuzzTestState) => rand.pick(definitionPool);
	type EditState = FuzzTestState & TreeContext;

	function traitGenerator(state: EditState): TraitLocation {
		const { idList, rand, view } = state;
		const id = rand.pick(idList);
		return view.tryGetTraitLocation(id) ?? { parent: id, label: traitLabelGenerator(state) };
	}

	function placeGenerator(state: EditState): StablePlace {
		const { idList, rand, view } = state;
		// Note: this gives a 50% chance of adding to a new trait; we may want to tune this at some point
		if (rand.bool()) {
			const parent = rand.pick(idList);
			return StablePlace.atStartOf({ parent, label: traitLabelGenerator(state) });
		}
		const traitLocation = traitGenerator(state);
		const trait = view.getTrait(traitLocation);
		interface Descriptor {
			index: number;
			side: Side;
		}
		// For a trait of length N, there are 2N + 2valid places: start, before index 1, after index 1, etc.
		// index === trait.length is treated as either the start or end of the trait.
		const makeDescriptor = (): Descriptor => ({
			index: rand.integer(0, trait.length),
			side: rand.bool() ? Side.Before : Side.After,
		});
		const descriptor = makeDescriptor();

		const placeFromDescriptor = ({ index, side }: Descriptor): StablePlace =>
			index === trait.length ? { referenceTrait: traitLocation, side } : { referenceSibling: trait[index], side };
		return placeFromDescriptor(descriptor);
	}

	function rangeGenerator(state: EditState): StableRange {
		const { rand, view } = state;
		const traitLocation = traitGenerator(state);
		const trait = view.getTrait(traitLocation);
		interface Descriptor {
			index: number;
			side: Side;
		}
		// For a trait of length N, there are 2N + 2valid places: start, before index 1, after index 1, etc.
		// index === trait.length is treated as either the start or end of the trait.
		const makeDescriptor = (): Descriptor => ({
			index: rand.integer(0, trait.length),
			side: rand.bool() ? Side.Before : Side.After,
		});
		const descriptor1 = makeDescriptor();
		let descriptor2: Descriptor;
		do {
			descriptor2 = makeDescriptor();
		} while (descriptor1.index === descriptor2.index && descriptor1.side === descriptor2.side);

		const sortedDescriptors = [descriptor1, descriptor2];
		sortedDescriptors.sort((a, b) => {
			if (a.index === b.index && a.side === b.side) {
				return 0;
			}
			if (a.index === trait.length) {
				if (a.side === Side.After) {
					return -1;
				}
				return 1;
			}
			if (b.index === trait.length) {
				if (b.side === Side.After) {
					return 1;
				}
				return -1;
			}
			if (a.index < b.index) {
				return -1;
			}
			return a.side === Side.Before ? -1 : 1;
		});
		const [startDescriptor, endDescriptor] = sortedDescriptors;
		const placeFromDescriptor = ({ index, side }: Descriptor): StablePlace =>
			index === trait.length ? { referenceTrait: traitLocation, side } : { referenceSibling: trait[index], side };
		const start = placeFromDescriptor(startDescriptor);
		const end = placeFromDescriptor(endDescriptor);
		return StableRange.from(start).to(end);
	}

	function treeGenerator(state: EditState): BuildNode {
		const { rand, idGenerator } = state;
		const treeType = rand.pick(['leaf', 'stick', 'balanced']);
		const makeNode = (traits?: TraitMap<BuildNode>): BuildNode => ({
			identifier: idGenerator.generateNodeId(),
			definition: definitionGenerator(state),
			traits: traits ?? {},
		});
		switch (treeType) {
			case 'leaf':
				return makeNode();
			case 'stick':
				return makeNode({
					[traitLabelGenerator(state)]: [makeNode({ [traitLabelGenerator(state)]: [makeNode()] })],
				});
			case 'balanced':
				return makeNode({
					[traitLabelGenerator(state)]: [makeNode()],
					[traitLabelGenerator(state)]: [makeNode()],
				});
			default:
				fail(`Unexpected treeType ${treeType}`);
		}
	}

	async function insertGenerator(state: EditState): Promise<FuzzInsert> {
		const { maxTreeSequenceSize } = insertConfig;
		const id = 1 as DetachedSequenceId;
		const { view } = state;
		const isValidInsertPlace = (destination: StablePlace): boolean => {
			// Disallow insertion adjacent to the root node.
			if (destination.referenceSibling === view.root) {
				return false;
			}

			return true;
		};

		let destination: StablePlace;
		do {
			destination = placeGenerator(state);
		} while (!isValidInsertPlace(destination));

		return {
			fuzzType: 'insert',
			build: {
				type: ChangeType.Build,
				destination: id,
				source: Array.from({ length: state.rand.integer(1, maxTreeSequenceSize) }, () => treeGenerator(state)),
			},
			insert: {
				type: ChangeType.Insert,
				destination,
				source: id,
			},
		};
	}

	async function deleteGenerator(state: EditState): Promise<FuzzDelete> {
		const { view } = state;
		const isValidDeleteRange = (source: StableRange): boolean => {
			// Disallow deletion of the root node.
			if (source.start.referenceSibling === view.root || source.end.referenceSibling === view.root) {
				return false;
			}

			return true;
		};

		let source: StableRange;
		do {
			source = rangeGenerator(state);
		} while (!isValidDeleteRange(source));

		return {
			fuzzType: 'delete',
			type: ChangeType.Detach,
			source,
		};
	}

	async function moveGenerator(state: EditState): Promise<FuzzMove> {
		const id = 1 as DetachedSequenceId;
		const { view } = state;

		const isValidMoveRange = ({ start, end }: TreeViewRange, destination: StablePlace): boolean => {
			// An ancestor cannot be moved to be a sibling of its descendant.
			const forbiddenDescendantId =
				destination.referenceTrait?.parent ?? destination.referenceSibling ?? fail('Invalid place');

			const unadjustedStartIndex: number = view.findIndexWithinTrait(start);
			const unadjustedEndIndex: number = view.findIndexWithinTrait(end);
			const startIndex = unadjustedStartIndex + (start.side === Side.After ? 1 : 0);
			const endIndex = unadjustedEndIndex + (end.side === Side.After ? 1 : 0);

			const idsInSource = new Set(view.getTrait(start.trait).slice(startIndex, endIndex));
			for (
				let current: NodeId | undefined = forbiddenDescendantId;
				current !== undefined;
				current = view.tryGetParentViewNode(current)?.identifier
			) {
				if (idsInSource.has(current)) {
					return false;
				}
			}
			return true;
		};

		let source: StableRange;
		let destination: StablePlace;
		do {
			source = rangeGenerator(state);
			destination = placeGenerator(state);
		} while (!isValidMoveRange(rangeFromStableRange(view, source), destination));

		return {
			fuzzType: 'move',
			detach: {
				type: ChangeType.Detach,
				destination: id,
				source,
			},
			insert: {
				type: ChangeType.Insert,
				destination,
				source: id,
			},
		};
	}

	async function setPayloadGenerator({ dataStoreRuntime, idList, rand, view }: EditState): Promise<FuzzChange> {
		const nodeToModify = rand.pick(idList);
		const getPayloadContents = async (rand: Random): Promise<string | { blob: IFluidHandle<ArrayBufferLike> }> => {
			if (rand.bool()) {
				return rand.string(4);
			}
			const handle = await dataStoreRuntime.uploadBlob(IsoBuffer.from(rand.string(10)));
			return { blob: handle };
		};

		const viewNode = view.getViewNode(nodeToModify);
		const payload =
			viewNode.payload !== undefined ? (rand.bool() ? await getPayloadContents(rand) : undefined) : undefined;
		return {
			fuzzType: 'setPayload',
			type: ChangeType.SetValue,
			nodeToModify: rand.pick(idList),
			payload,
		};
	}

	const baseEditGenerator = createWeightedGenerator<FuzzChange, EditState>([
		[insertGenerator, config.insertWeight, ({ idList }) => idList.length < config.maxTreeSize],
		[deleteGenerator, config.deleteWeight, ({ idList }) => idList.length > 1],
		[moveGenerator, config.moveWeight, ({ idList }) => idList.length > 1],
		[setPayloadGenerator, config.setPayloadWeight],
	]);

	return async (state: FuzzTestState): Promise<Operation | typeof done> => {
		const { rand, activeCollaborators } = state;
		const index = rand.integer(0, activeCollaborators.length - 1);
		const { tree } = activeCollaborators[index];
		const view = tree.currentView;
		const idList = getIdList(view);
		const contents = await baseEditGenerator({
			...state,
			view,
			idList,
			dataStoreRuntime: tree.getRuntime(),
			idGenerator: tree,
		});
		if (contents === done) {
			return done;
		}
		return { type: 'edit', contents, index };
	};
};

const defaultOpConfig: Required<OperationGenerationConfig> = {
	editConfig: defaultEditConfig,
	joinConfig: defaultJoinConfig,
	editWeight: 10,
	joinWeight: 1,
	leaveWeight: 1,
	synchronizeWeight: 1,
};

export function makeOpGenerator(passedConfig: OperationGenerationConfig): AsyncGenerator<Operation, FuzzTestState> {
	const config = {
		...defaultOpConfig,
		...passedConfig,
	};

	const { maximumPassiveCollaborators, maximumActiveCollaborators } = { ...defaultJoinConfig, ...config.joinConfig };
	const maximumCollaborators = maximumPassiveCollaborators + maximumActiveCollaborators;

	const collaboratorsMatches =
		(criteria: (collaboratorCount: number) => boolean): AcceptanceCondition<FuzzTestState> =>
		({ activeCollaborators, passiveCollaborators }) =>
			criteria(activeCollaborators.length + passiveCollaborators.length);
	const atLeastOneClient = collaboratorsMatches((count) => count > 0);
	const atLeastOneActiveClient: AcceptanceCondition<FuzzTestState> = ({ activeCollaborators }) =>
		activeCollaborators.length > 0;
	const opWeights: Weights<Operation, FuzzTestState> = [
		[makeEditGenerator(config.editConfig), config.editWeight, atLeastOneActiveClient],
		[
			makeJoinGenerator(config.joinConfig),
			config.joinWeight,
			collaboratorsMatches((count) => count < maximumCollaborators),
		],
		[leaveGenerator, config.leaveWeight, atLeastOneClient],
		[{ type: 'synchronize' }, config.synchronizeWeight, atLeastOneClient],
	];
	return createWeightedGenerator(opWeights);
}

type AcceptanceCondition<TState> = (state: TState) => boolean;

/**
 * Array of weighted generators to select from.
 *
 * A generator should only be invoked if the corresponding `AcceptanceCondition` evaluates to true.
 * This is useful in practice to avoid invoking generators for known-to-be invalid actions based on the current state:
 * for example, a "leave" op cannot be generated if there are no currently connected clients.
 */
type Weights<T, TState> = [T | AsyncGenerator<T, TState>, number, AcceptanceCondition<TState>?][];

function createWeightedGenerator<T, TState extends { rand: Random }>(
	weights: Weights<T, TState>
): AsyncGenerator<T, TState> {
	const cumulativeSums: [T | AsyncGenerator<T, TState>, number, AcceptanceCondition<TState>?][] = [];
	let totalWeight = 0;
	for (const [tOrGenerator, weight, shouldAccept] of weights) {
		const cumulativeWeight = totalWeight + weight;
		cumulativeSums.push([tOrGenerator, cumulativeWeight, shouldAccept]);
		totalWeight = cumulativeWeight;
	}

	return async (state) => {
		const { rand } = state;
		const sample = () => {
			const weightSelected = rand.integer(1, totalWeight);

			let opIndex = 0;
			while (cumulativeSums[opIndex][1] < weightSelected) {
				opIndex++;
			}

			return opIndex;
		};

		let index;
		let shouldAccept: AcceptanceCondition<TState> | undefined;
		do {
			index = sample();
			shouldAccept = cumulativeSums[index][2];
		} while (!(shouldAccept?.(state) ?? true));

		const [tOrGenerator] = cumulativeSums[index];
		return typeof tOrGenerator === 'function'
			? (tOrGenerator as AsyncGenerator<T, TState>)(state)
			: (tOrGenerator as unknown as T);
	};
}

function getIdList(tree: TreeView): NodeId[] {
	const allIds: NodeId[] = [];
	const toVisit: NodeId[] = [tree.root];
	while (toVisit.length > 0) {
		const id = toVisit.pop() ?? fail();
		allIds.push(id);
		const node = tree.getViewNode(id);
		for (const [_, childIds] of node.traits) {
			toVisit.push(...childIds);
		}
	}
	return allIds;
}

/**
 * Higher-order generator operator which creates a new generator producing the first `n` elements of `generator`.
 */
export function take<T, TState>(n: number, generator: AsyncGenerator<T, TState>): AsyncGenerator<T, TState> {
	let count = 0;
	return async (state) => {
		if (count < n) {
			count++;
			return generator(state);
		}
		return done;
	};
}

/**
 * @returns a deterministic generator that always returns the items of `contents` in order.
 */
export function generatorFromArray<T, TAdditionalState>(contents: T[]): AsyncGenerator<T, TAdditionalState> {
	let index = -1;
	return async () => {
		if (index < contents.length) {
			index++;
			return contents[index] ?? done;
		}
		return done;
	};
}

/**
 * Higher-order generator operator which exhausts each input generator sequentially before moving on to the next.
 */
export function chain<T, TState>(...generators: AsyncGenerator<T, TState>[]): AsyncGenerator<T, TState> {
	let currentIndex = 0;
	return async (state) => {
		while (currentIndex < generators.length) {
			const generator = generators[currentIndex];
			const result = await generator(state);
			if (result !== done) {
				return result;
			} else {
				currentIndex++;
			}
		}
		return done;
	};
}
