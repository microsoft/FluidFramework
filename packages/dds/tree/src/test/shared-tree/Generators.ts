/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { EditGenerationConfig, FuzzTestState, InsertGenerationConfig, JoinGenerationConfig, Operation, TreeContext } from "./types";

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

type TraitLabel = string;

const makeEditGenerator = (
	passedConfig: EditGenerationConfig,
	passedJoinConfig: JoinGenerationConfig,
	stashOps = false
): AsyncGenerator<Operation, FuzzTestState> => {
	const config = { ...defaultEditConfig, ...passedConfig };
	const insertConfig = { ...defaultInsertConfig, ...config.insertConfig };
	const poolRand = makeRandom(0);
	const traitLabelPool = Array.from({ length: config.traitLabelPoolSize }, () => poolRand.uuid4());
	const traitLabelGenerator = ({ random }: FuzzTestState) => random.pick(traitLabelPool);

	const definitionPool = Array.from(
		{ length: insertConfig.definitionPoolSize },
		() => poolRand.uuid4()
	);
	const definitionGenerator = ({ random }: FuzzTestState) => random.pick(definitionPool);
	type EditState = FuzzTestState & TreeContext;

	function traitGenerator(state: EditState): TraitLocation {
		const { idList, random, view } = state;
		const id = random.pick(idList);
		return view.tryGetTraitLocation(id) ?? { parent: id, label: traitLabelGenerator(state) };
	}

	function placeGenerator(state: EditState): StablePlace {
		const { idList, random, view } = state;
		// Note: this gives a 50% chance of adding to a new trait; we may want to tune this at some point
		if (random.bool()) {
			const parent = random.pick(idList);
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
			index: random.integer(0, trait.length),
			side: random.bool() ? Side.Before : Side.After,
		});
		const descriptor = makeDescriptor();

		const placeFromDescriptor = ({ index, side }: Descriptor): StablePlace =>
			index === trait.length ? { referenceTrait: traitLocation, side } : { referenceSibling: trait[index], side };
		return placeFromDescriptor(descriptor);
	}

	function rangeGenerator(state: EditState): StableRange {
		const { random, view } = state;
		const traitLocation = traitGenerator(state);
		const trait = view.getTrait(traitLocation);
		interface Descriptor {
			index: number;
			side: Side;
		}
		// For a trait of length N, there are 2N + 2valid places: start, before index 1, after index 1, etc.
		// index === trait.length is treated as either the start or end of the trait.
		const makeDescriptor = (): Descriptor => ({
			index: random.integer(0, trait.length),
			side: random.bool() ? Side.Before : Side.After,
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
		const { random, idGenerator } = state;
		const treeType = random.pick(['leaf', 'stick', 'balanced']);
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
				source: Array.from({ length: state.random.integer(1, maxTreeSequenceSize) }, () =>
					treeGenerator(state)
				),
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

			const startIndex = view.findIndexWithinTrait(start);
			const endIndex = view.findIndexWithinTrait(end);
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

	async function setPayloadGenerator({ dataStoreRuntime, idList, random, view }: EditState): Promise<FuzzChange> {
		const nodeToModify = random.pick(idList);
		const getPayloadContents = async (
			random: IRandom
		): Promise<string | { blob: IFluidHandle<ArrayBufferLike> }> => {
			if (random.bool()) {
				return random.string(4);
			}
			const handle = await dataStoreRuntime.uploadBlob(IsoBuffer.from(random.string(10)));
			return { blob: handle };
		};

		const viewNode = view.getViewNode(nodeToModify);
		const payload =
			viewNode.payload !== undefined ? (random.bool() ? await getPayloadContents(random) : undefined) : undefined;
		return {
			fuzzType: 'setPayload',
			type: ChangeType.SetValue,
			nodeToModify: random.pick(idList),
			payload,
		};
	}

	const baseEditGenerator = createWeightedAsyncGenerator<FuzzChange, EditState>([
		[insertGenerator, config.insertWeight, ({ idList }) => idList.length < config.maxTreeSize],
		[deleteGenerator, config.deleteWeight, ({ idList }) => idList.length > 1],
		[moveGenerator, config.moveWeight, ({ idList }) => idList.length > 1],
		[setPayloadGenerator, config.setPayloadWeight],
	]);

	return async (state: FuzzTestState): Promise<Operation | typeof done> => {
		const { random, activeCollaborators } = state;
		const index = random.integer(0, activeCollaborators.length - 1);
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

		if (stashOps) {
			const joinConfig = { ...defaultJoinConfig, ...passedJoinConfig };
			return {
				type: 'stash',
				contents,
				index,
				summarizeHistory: random.pick(joinConfig.summarizeHistory),
				writeFormat: random.pick(joinConfig.writeFormat),
			};
		}

		return { type: 'edit', contents, index };
	};
};
