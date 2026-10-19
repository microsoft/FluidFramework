/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { makeRandom } from "@fluid-private/stochastic-test-utils";
import { AttachState } from "@fluidframework/container-definitions";
import {
	MockFluidDataStoreRuntime,
	validateUsageError,
} from "@fluidframework/test-runtime-utils/internal";

import { asAlpha } from "../../../api.js";
import type { RevertibleAlpha } from "../../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { CapturedTreeLocationInternal } from "../../../shared-tree/locationFormat.js";
import {
	extractJsonValidator,
	FormatValidatorNoOp,
	type FormatValidator,
} from "../../../codec/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { capturedTreeLocationEncodingSchema } from "../../../shared-tree/locationFormat.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import {
	SchemaFactory,
	SchemaFactoryAlpha,
	TreeViewConfiguration,
	type TreeArrayNode,
	type TextLocationNode,
	type CapturedTreeLocation,
	type TreeLocation,
	type TreeLocationResolver,
	type TreeLocationResolution,
	type ResolvedTreeLocation,
	type TreeViewAlpha,
} from "../../../simple-tree/index.js";
import {
	PlainText,
	FormattedText,
	isTextLocationNode,
	textLocationArray,
} from "../../../text/index.js";
import { configuredSharedTree } from "../../../treeFactory.js";
import { isReadonlyArray, type requireFalse } from "../../../util/index.js";
import { getView, TestTreeProviderLite } from "../../utils.js";

const sf = new SchemaFactory("com.example.locations");
class Text extends sf.array("Text", sf.string) {}
class Document extends sf.object("Document", { left: Text, right: Text }) {}
const config = new TreeViewConfiguration({ schema: Document });

type _CaptureHidesRevision = requireFalse<
	"revision" extends keyof CapturedTreeLocation ? true : false
>;
type _CaptureHidesLocation = requireFalse<
	"location" extends keyof CapturedTreeLocation ? true : false
>;
type _CaptureCannotBeConstructed = requireFalse<
	{ revision: string; location: {} } extends CapturedTreeLocation ? true : false
>;
type _ResolvedLocationCannotBeUnavailable = requireFalse<
	"unavailable" extends ResolvedTreeLocation["status"] ? true : false
>;
type _CaptureHasNoTextKind = requireFalse<"text" extends TreeLocation["kind"] ? true : false>;

function capturedData(captured: CapturedTreeLocation): CapturedTreeLocationInternal {
	return captured as unknown as CapturedTreeLocationInternal;
}

function eraseCapture(data: unknown): CapturedTreeLocation {
	return data as CapturedTreeLocation;
}

function setup(jsonValidator?: FormatValidator): {
	provider: TestTreeProviderLite;
	views: TreeViewAlpha<typeof Document>[];
} {
	const provider =
		jsonValidator === undefined
			? new TestTreeProviderLite(2)
			: new TestTreeProviderLite(2, configuredSharedTree({ jsonValidator }).getFactory());
	const views = provider.trees.map((tree) => tree.kernel.viewWith(config));
	views[0].initialize({ left: ["a", "b", "c", "d"], right: ["x", "y"] });
	provider.synchronizeMessages();
	return { provider, views };
}

function capture(
	resolver: TreeLocationResolver,
	locations: readonly TreeLocation[],
): readonly CapturedTreeLocation[] {
	const result = resolver.capture(locations);
	// Model the JSON transport boundary; the resolver must validate the wire encoding.
	return JSON.parse(JSON.stringify(result)) as readonly CapturedTreeLocation[];
}

function captureGaps(
	view: TreeViewAlpha<typeof Document>,
	offsets: readonly number[],
	affinity: "before" | "after" = "after",
): readonly CapturedTreeLocation[] {
	return capture(
		view.locations,
		offsets.map((index) => ({ kind: "sequence", node: view.root.left, index, affinity })),
	);
}

function resolved(
	result: TreeLocationResolution | readonly TreeLocationResolution[],
): readonly ResolvedTreeLocation["location"][] {
	const results = isReadonlyArray(result) ? result : [result];
	return results.map((entry) => {
		assert(entry.status === "resolved");
		return entry.location;
	});
}

function indices(
	resolver: TreeLocationResolver,
	batch: readonly CapturedTreeLocation[],
): readonly number[] {
	return resolved(resolver.resolve(batch)).map((location) => {
		assert(location.kind === "sequence");
		return location.index;
	});
}

function expectUnavailable(
	result: TreeLocationResolution | readonly TreeLocationResolution[],
	reason: "target-deleted" | "invalid-location",
): void {
	assert.deepEqual(
		result,
		isReadonlyArray(result)
			? [{ status: "unavailable", reason }]
			: { status: "unavailable", reason },
	);
}

describe("TreeLocationResolver", () => {
	for (const event of ["changed", "afterBatch"] as const) {
		it(`rejects capture and resolution during remote ${event} callbacks`, () => {
			class Arrays extends sf.array("EventArrays", Text) {}
			const provider = new TestTreeProviderLite(2);
			const views = provider.trees.map((tree) =>
				tree.kernel.viewWith(new TreeViewConfiguration({ schema: Arrays })),
			);
			const [sender, receiver] = views;
			sender.initialize([["a"], ["b"]]);
			provider.synchronizeMessages();
			const checkout = provider.trees[1].kernel.checkout;
			const node = receiver.root[0];
			const resolver = receiver.locations;
			const captured = resolver.captureNode(node);
			let callbacks = 0;
			const check = (): void => {
				callbacks++;
				assert.deepEqual(
					receiver.root.map((array) => array.join("")),
					event === "changed" ? ["a", "b"] : ["x", "a", "b"],
				);
				for (const operation of [
					() => resolver.capture({ kind: "node", node }),
					() => resolver.capture([{ kind: "node", node }]),
					() => resolver.captureNode(node),
					() => resolver.captureGap(node, 0),
					() => resolver.resolve(captured),
					() => resolver.resolve([captured]),
				]) {
					assert.throws(
						operation,
						validateUsageError(
							/Capturing or resolving locations is forbidden during a change event callback/,
						),
					);
				}
			};
			const off =
				event === "changed"
					? receiver.events.on("changed", (metadata) => {
							if (!metadata.isLocal) {
								check();
							}
						})
					: checkout.events.on("afterBatch", check);
			// The branch head advances before "changed", but the forest still has the old array indices.
			sender.root.insertAtStart(new Text(["x"]));
			provider.synchronizeMessages();
			off();
			assert.equal(callbacks, 1);
			assert.equal(receiver.root[1], node);
			assert.deepEqual(resolver.resolve(captured), {
				status: "resolved",
				location: { kind: "node", node },
			});
			assert.deepEqual(
				resolver.resolve(resolver.captureNode(node)),
				resolver.resolve(captured),
			);
			sender.dispose();
			receiver.dispose();
		});
	}

	it("captures and resolves single locations with the same semantics as arrays", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const inputs: readonly TreeLocation[] = [
			{ kind: "node", node: sender.root.left },
			{ kind: "sequence", node: sender.root.left, index: 2 },
			{ kind: "sequence", node: sender.root.left, index: 2, affinity: "after" },
		];
		const singles = inputs.map((location) => sender.locations.capture(location));
		const batch = capture(sender.locations, inputs);
		assert.deepEqual(batch, singles);
		receiver.root.left.insertAt(2, "x");
		const results: readonly TreeLocationResolution[] = receiver.locations.resolve(batch);
		assert.deepEqual(
			results,
			singles.map((entry) => receiver.locations.resolve(entry)),
		);
		assert.deepEqual(resolved(results), [
			{ kind: "node", node: receiver.root.left },
			{ kind: "sequence", node: receiver.root.left, index: 2, affinity: "before" },
			{ kind: "sequence", node: receiver.root.left, index: 3, affinity: "after" },
		]);
	});

	it("provides node and gap capture helpers with identical defaults and validation", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const { captureNode, captureGap } = sender.locations;
		assert.deepEqual(
			captureNode(sender.root.left),
			sender.locations.capture({
				kind: "node",
				node: sender.root.left,
			}),
		);
		for (const options of [
			undefined,
			{ affinity: undefined, movePolicy: undefined },
			{ affinity: "before", movePolicy: "follow" },
			{ affinity: "after" },
		] as const) {
			const captured: CapturedTreeLocation = captureGap(sender.root.left, 2, options);
			assert.deepEqual(
				captured,
				sender.locations.capture({
					kind: "sequence",
					node: sender.root.left,
					index: 2,
					...options,
				}),
			);
			const result: TreeLocationResolution = receiver.locations.resolve(
				eraseCapture(JSON.parse(JSON.stringify(captured))),
			);
			assert.deepEqual(resolved(result), [
				{
					kind: "sequence",
					node: receiver.root.left,
					index: 2,
					affinity: options?.affinity ?? "before",
				},
			]);
		}
		assert.throws(() => captureGap(sender.root.left, -1), /in-bounds gap/);
		assert.throws(() => captureNode(receiver.root), /must belong/);
		assert.throws(
			() => captureGap(sender.root.left, 1, { movePolicy: "stay" as "follow" }),
			/Only the "follow" move policy/,
		);
		sender.dispose();
		assert.throws(() => captureNode(receiver.root), /disposed TreeView/);
		assert.throws(() => captureGap(receiver.root.left, 1), /disposed TreeView/);
	});

	it("returns mutable arrays without retaining their contents", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const inputs: readonly TreeLocation[] = [{ kind: "node", node: sender.root }];
		const captures: CapturedTreeLocation[] = sender.locations.capture(inputs);
		const node = captures[0];
		captures.push(sender.locations.captureGap(sender.root.left, 1));
		const results: TreeLocationResolution[] = receiver.locations.resolve(captures);
		assert.equal(results.length, 2);
		captures.splice(0, 1);
		results.splice(0);
		assert.deepEqual(receiver.locations.resolve(node), {
			status: "resolved",
			location: { kind: "node", node: receiver.root },
		});
		assert.equal(receiver.locations.resolve(captures).length, 1);
		assert.deepEqual(sender.locations.capture(inputs), [node]);
	});

	it("returns empty arrays while preserving view-state checks", () => {
		const { views } = setup();
		const view = views[0];
		assert.deepEqual(view.locations.capture([]), []);
		assert.deepEqual(view.locations.resolve([]), []);
		view.runTransaction(() => {
			assert.throws(() => view.locations.capture([]), /during a transaction/);
			assert.throws(() => view.locations.resolve([]), /during a transaction/);
		});
		view.dispose();
		assert.throws(() => view.locations.capture([]), /disposed TreeView/);
		assert.throws(() => view.locations.resolve([]), /disposed TreeView/);
	});

	it("combines captures from different revisions and preserves order and individual failures", () => {
		const { provider, views } = setup(FormatValidatorBasic);
		const [sender, receiver] = views;
		const old = sender.locations.captureGap(sender.root.left, 2);
		sender.root.left.insertAtStart("s");
		provider.synchronizeMessages();
		const newer = sender.locations.captureGap(sender.root.left, 3, { affinity: "after" });
		const deleted = sender.locations.captureNode(sender.root.right);
		const data = capturedData(newer);
		const wrongRevision = eraseCapture({
			...data,
			revision: { ...data.revision, branchId: "other" },
		});
		const malformed = eraseCapture({ ...data, location: null });
		const invalidEnvelope = eraseCapture(null);
		receiver.root.left.insertAt(3, "r");
		receiver.root.right = new Text([]);
		const captures = [
			newer,
			wrongRevision,
			old,
			malformed,
			deleted,
			newer,
			invalidEnvelope,
			old,
		];
		const results = receiver.locations.resolve(captures);
		assert.deepEqual(
			results,
			captures.map((entry) => receiver.locations.resolve(entry)),
		);
		assert.deepEqual(
			results.map((entry) =>
				entry.status === "resolved"
					? entry.location.kind === "sequence"
						? entry.location.index
						: entry.location.kind
					: entry,
			),
			[
				4,
				{ status: "revision-unavailable" },
				3,
				{ status: "unavailable", reason: "invalid-location" },
				{ status: "unavailable", reason: "target-deleted" },
				4,
				{ status: "revision-unavailable" },
				3,
			],
		);
	});

	it("shares rollback inversion for captures with the same revision", () => {
		const { provider, views } = setup();
		const [sender, receiver] = views;
		const captures = sender.locations.capture([
			{ kind: "node", node: sender.root.left },
			{ kind: "sequence", node: sender.root.left, index: 2 },
		]);
		receiver.root.left.insertAtStart("r");
		const rebaser = provider.trees[1].kernel.checkout.mainBranch.changeFamily.rebaser;
		const invert = rebaser.invert;
		let inversions = 0;
		rebaser.invert = (...args) => {
			inversions++;
			return invert.apply(rebaser, args);
		};
		try {
			receiver.locations.resolve(captures[0]);
			const singleCost = inversions;
			assert(singleCost > 0);
			inversions = 0;
			receiver.locations.resolve([...captures, ...captures]);
			assert.equal(inversions, singleCost);
			inversions = 0;
			for (const captured of captures) {
				receiver.locations.resolve(captured);
			}
			assert.equal(inversions, captures.length * singleCost);
		} finally {
			rebaser.invert = invert;
		}
	});

	it("encodes captures matching the TypeBox wire schema without changing the JSON representation", () => {
		const { views } = setup();
		const batch = capture(views[0].locations, [
			{ kind: "node", node: views[0].root },
			{ kind: "sequence", node: views[0].root.left, index: 1 },
		]);
		assert(
			batch.every((entry) =>
				extractJsonValidator(FormatValidatorBasic)
					.compile(capturedTreeLocationEncodingSchema)
					.check(entry),
			),
		);
	});

	it("returns unavailable results for malformed envelopes with schema validation enabled", () => {
		const { views } = setup(FormatValidatorBasic);
		const resolver = views[0].locations;
		const valid = capturedData(captureGaps(views[0], [1])[0]);
		for (const malformed of [
			null,
			undefined,
			"capture",
			{},
			{ ...valid, revision: null },
			{ ...valid, revision: { branchId: "main", revision: 4 } },
		]) {
			assert.deepEqual(resolver.resolve(eraseCapture(malformed)), {
				status: "revision-unavailable",
			});
			assert.deepEqual(resolver.resolve([eraseCapture(malformed), eraseCapture(valid)]), [
				{ status: "revision-unavailable" },
				resolver.resolve(eraseCapture(valid)),
			]);
		}
	});

	it("validates each wire location independently with the configured validator", () => {
		const { views } = setup(FormatValidatorBasic);
		const [sender, receiver] = views;
		const data = capturedData(captureGaps(sender, [1])[0]);
		const valid = data.location;
		assert(valid.kind === "sequence");
		for (const malformed of [
			null,
			undefined,
			[],
			{},
			{ ...valid, kind: "unknown" },
			{ ...valid, index: -1 },
			{ ...valid, index: 0.5 },
			{ ...valid, index: Number.MAX_SAFE_INTEGER + 1 },
			{ ...valid, affinity: "unknown" },
			{ ...valid, node: { ...valid.node, length: -1 } },
			{ ...valid, node: { ...valid.node, path: [] } },
			{ ...valid, node: { ...valid.node, path: [["rootFieldKey"]] } },
			{ ...valid, node: { ...valid.node, path: [[42, 0]] } },
			{ ...valid, node: { ...valid.node, path: [["rootFieldKey", -1]] } },
			{
				...valid,
				node: { ...valid.node, path: [["rootFieldKey", Number.MAX_SAFE_INTEGER + 1]] },
			},
		]) {
			assert.deepEqual(
				receiver.locations.resolve([
					eraseCapture({ ...data, location: malformed }),
					eraseCapture(data),
				]),
				[
					{ status: "unavailable", reason: "invalid-location" },
					{
						status: "resolved",
						location: {
							kind: "sequence",
							node: receiver.root.left,
							index: 1,
							affinity: "after",
						},
					},
				],
			);
		}
	});

	for (const [name, jsonValidator] of [
		["basic", FormatValidatorBasic],
		["no-op", FormatValidatorNoOp],
	] as const) {
		it(`enforces reference semantics with the ${name} validator`, () => {
			const { views } = setup(jsonValidator);
			const [sender, receiver] = views;
			const data = capturedData(captureGaps(sender, [1])[0]);
			const valid = data.location;
			assert(valid.kind === "sequence");
			assert.deepEqual(indices(receiver.locations, [eraseCapture(data)]), [1]);
			for (const location of [
				{ ...valid, node: { ...valid.node, version: 2 } },
				{
					...valid,
					node: { ...valid.node, revision: { ...data.revision, revision: "different" } },
				},
				{ ...valid, node: { ...valid.node, path: [["otherRoot", 0]] } },
				{ ...valid, node: { ...valid.node, path: [["rootFieldKey", 1]] } },
				{ ...valid, node: { ...valid.node, length: undefined } },
				{ ...valid, index: 5 },
				{ ...valid, movePolicy: "stay" },
			]) {
				expectUnavailable(
					receiver.locations.resolve(
						eraseCapture({
							...data,
							location,
						}),
					),
					"invalid-location",
				);
			}
			assert.deepEqual(
				receiver.locations.resolve(
					eraseCapture({
						...data,
						revision: { ...data.revision, branchId: "other" },
					}),
				),
				{ status: "revision-unavailable" },
			);
		});
	}

	it("reuses one locations object per view", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const resolver = sender.locations;
		assert.equal(sender.locations, resolver);
		assert.notEqual(receiver.locations, resolver);
		const { capture: captureLocations, resolve } = resolver;
		const batch = captureLocations([{ kind: "node", node: sender.root.left }]);
		assert.deepEqual(resolved(resolve(batch)), [{ kind: "node", node: sender.root.left }]);
		assert.equal(sender.locations, resolver);
		sender.dispose();
		assert.throws(() => captureLocations([]), /disposed TreeView/);
		assert.throws(() => resolve(batch), /disposed TreeView/);
	});

	it("embeds plain capture objects in a larger presence message with a single serialization", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const selection = sender.locations.capture([
			{ kind: "node", node: sender.root.left },
			{ kind: "sequence", node: sender.root.left, index: 2 },
		]);
		const message = JSON.parse(
			JSON.stringify({
				type: "presence",
				selection,
				metadata: { color: "blue" },
			}),
		) as {
			type: string;
			selection: readonly CapturedTreeLocation[];
			metadata: { color: string };
		};
		const data = capturedData(message.selection[0]);
		assert.equal(typeof data, "object");
		assert.equal(typeof data.revision, "object");
		assert.equal(typeof data.location.node, "object");
		assert.equal(typeof data.location.node.revision, "object");
		assert(Array.isArray(data.location.node.path));
		assert.deepEqual(message.metadata, { color: "blue" });
		assert.equal(message.type, "presence");
		assert.deepEqual(resolved(receiver.locations.resolve(message.selection)), [
			{ kind: "node", node: receiver.root.left },
			{ kind: "sequence", node: receiver.root.left, index: 2, affinity: "before" },
		]);
		assert.deepEqual(
			receiver.locations.resolve(selection),
			receiver.locations.resolve(message.selection),
		);
	});

	it("materializes unread receiver nodes", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const batch = capture(sender.locations, [
			{ kind: "node", node: sender.root.left },
			{ kind: "sequence", node: sender.root.left, index: 1 },
		]);
		const first = resolved(receiver.locations.resolve(batch));
		const second = resolved(receiver.locations.resolve(batch));
		assert.equal(first[0].node, first[1].node);
		assert.equal(first[0].node, second[0].node);
		assert.equal(first[1].node, second[1].node);
		assert.equal(first[0].node, receiver.root.left);
	});

	it("defaults omitted and undefined affinity to before across JSON transport", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const batch = capture(sender.locations, [
			{ kind: "sequence", node: sender.root.left, index: 2 },
			{ kind: "sequence", node: sender.root.left, index: 2, affinity: undefined },
			{ kind: "sequence", node: sender.root.left, index: 2, affinity: "before" },
			{ kind: "sequence", node: sender.root.left, index: 2, affinity: "after" },
		]);
		receiver.root.left.insertAt(2, "x");
		assert.deepEqual(resolved(receiver.locations.resolve(batch)), [
			{ kind: "sequence", node: receiver.root.left, index: 2, affinity: "before" },
			{ kind: "sequence", node: receiver.root.left, index: 2, affinity: "before" },
			{ kind: "sequence", node: receiver.root.left, index: 2, affinity: "before" },
			{ kind: "sequence", node: receiver.root.left, index: 3, affinity: "after" },
		]);
	});

	it("uses before affinity by default at cross-array move boundaries", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const batch = capture(sender.locations, [
			{ kind: "sequence", node: sender.root.left, index: 1 },
			{ kind: "sequence", node: sender.root.left, index: 3 },
		]);
		// Move left[1..3) into right at gap 1:
		// left:  a [b c] d  -->  a d
		// right: x     y   -->  x [b c] y
		// Before-affinity gaps: left a|bcd --> left a|d; left abc|d --> right xbc|y.
		receiver.root.right.moveRangeToIndex(1, 1, 3, receiver.root.left);
		assert.equal(receiver.root.left.join(""), "ad");
		assert.equal(receiver.root.right.join(""), "xbcy");
		assert.deepEqual(resolved(receiver.locations.resolve(batch)), [
			{ kind: "sequence", node: receiver.root.left, index: 1, affinity: "before" },
			{ kind: "sequence", node: receiver.root.right, index: 3, affinity: "before" },
		]);
	});

	it("omits the supported move policy from captures and accepts it explicitly on receipt", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const implicit = capture(sender.locations, [
			{ kind: "sequence", node: sender.root.left, index: 2 },
		]);
		const explicit = capture(sender.locations, [
			{ kind: "sequence", node: sender.root.left, index: 2, movePolicy: "follow" },
		]);
		assert.deepEqual(explicit, implicit);
		const data = capturedData(explicit[0]);
		assert(!Object.hasOwn(data.location, "movePolicy"));
		receiver.root.right.moveRangeToIndex(1, 1, 3, receiver.root.left);
		for (const policy of [{}, { movePolicy: undefined }, { movePolicy: "follow" }]) {
			const incoming = eraseCapture({
				...data,
				location: { ...data.location, ...policy },
			});
			assert.deepEqual(resolved(receiver.locations.resolve(incoming)), [
				{ kind: "sequence", node: receiver.root.right, index: 2, affinity: "before" },
			]);
		}
	});

	it("reports unknown received move policies as unresolvable without rejecting other locations", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const batch = captureGaps(sender, [2]);
		const data = capturedData(batch[0]);
		for (const movePolicy of ["stay", null, 0, {}]) {
			assert.deepEqual(
				receiver.locations.resolve([
					eraseCapture({ ...data, location: { ...data.location, movePolicy } }),
					eraseCapture(data),
				]),
				[
					{ status: "unavailable", reason: "invalid-location" },
					{
						status: "resolved",
						location: {
							kind: "sequence",
							node: receiver.root.left,
							index: 2,
							affinity: "after",
						},
					},
				],
			);
		}
	});

	it("does not silently discard an unsupported capture move policy", () => {
		const { views } = setup();
		assert.throws(
			() =>
				views[0].locations.capture([
					{
						kind: "sequence",
						node: views[0].root.left,
						index: 2,
						movePolicy: "stay" as "follow",
					},
				]),
			validateUsageError(/Only the "follow" move policy is supported/),
		);
	});

	it("does not replace invalid affinities with the default", () => {
		const { views } = setup();
		for (const affinity of ["invalid", null, 0]) {
			const location: TreeLocation = {
				kind: "sequence",
				node: views[0].root.left,
				index: 0,
				affinity: affinity as "before",
			};
			assert.throws(
				() => views[0].locations.capture([location]),
				validateUsageError(/affinity/),
			);
		}
	});

	it("agrees with an independent gap model across randomized inserts, deletions, and moves", () => {
		for (let seed = 0; seed < 8; seed++) {
			const { views } = setup();
			const [sender, receiver] = views;
			const sourceArrays = [sender.root.left, sender.root.right];
			const arrays = [receiver.root.left, receiver.root.right];
			const expected: { array: number; index: number; affinity: "before" | "after" }[] = [];
			for (let array = 0; array < arrays.length; array++) {
				for (let index = 0; index <= arrays[array].length; index++) {
					for (const affinity of ["before", "after"] as const) {
						expected.push({ array, index, affinity });
					}
				}
			}
			const batch = capture(
				sender.locations,
				expected.map(({ array, index, affinity }) => ({
					kind: "sequence",
					node: sourceArrays[array],
					index,
					affinity,
				})),
			);

			// Perform a series of randomized edits on the receiver's arrays.
			const random = makeRandom(seed);
			for (let edit = 0; edit < 40; edit++) {
				const source = random.integer(0, 1);
				const operation = random.pick(
					arrays[source].length === 0 ? ["insert"] : ["insert", "delete", "move"],
				);
				if (operation === "insert") {
					const at = random.integer(0, arrays[source].length);
					arrays[source].insertAt(at, "x");
					for (const gap of expected) {
						if (
							gap.array === source &&
							(gap.index > at || (gap.index === at && gap.affinity === "after"))
						) {
							gap.index++;
						}
					}
				} else {
					const start = random.integer(0, arrays[source].length - 1);
					const end = random.integer(start + 1, arrays[source].length);
					const target = 1 - source;
					const at = random.integer(0, arrays[target].length);
					if (operation === "delete") {
						arrays[source].removeRange(start, end);
					} else {
						arrays[target].moveRangeToIndex(at, start, end, arrays[source]);
					}
					for (const gap of expected) {
						const follows =
							operation === "move" &&
							gap.array === source &&
							(gap.affinity === "after"
								? start <= gap.index && gap.index < end
								: start < gap.index && gap.index <= end);
						if (follows) {
							gap.array = target;
							gap.index = at + gap.index - start;
						} else if (gap.array === source && gap.index > start) {
							gap.index -= Math.min(gap.index, end) - start;
						} else if (
							operation === "move" &&
							gap.array === target &&
							(gap.index > at || (gap.index === at && gap.affinity === "after"))
						) {
							gap.index += end - start;
						}
					}
				}
				assert.deepEqual(
					resolved(receiver.locations.resolve(batch)),
					expected.map((gap) => ({
						kind: "sequence",
						node: arrays[gap.array],
						index: gap.index,
						affinity: gap.affinity,
					})),
					`seed ${seed}, edit ${edit}`,
				);
			}
		}
	});

	it("captures mixed node and gap locations and resolves to receiver SimpleTree objects", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const batch = capture(sender.locations, [
			{ kind: "node", node: sender.root },
			{ kind: "node", node: sender.root.left },
			{ kind: "sequence", node: sender.root.left, index: 4, affinity: "after" },
			{ kind: "sequence", node: sender.root.left, index: 0, affinity: "before" },
		]);
		assert.equal(typeof capturedData(batch[0]).location.node, "object");
		assert.deepEqual(
			capturedData(receiver.locations.captureNode(receiver.root)).revision,
			capturedData(batch[0]).revision,
		);
		assert.deepEqual(resolved(receiver.locations.resolve(batch)), [
			{ kind: "node", node: receiver.root },
			{ kind: "node", node: receiver.root.left },
			{ kind: "sequence", node: receiver.root.left, index: 4, affinity: "after" },
			{ kind: "sequence", node: receiver.root.left, index: 0, affinity: "before" },
		]);
	});

	it("includes pending receiver edits with both affinities and deletion collapse", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const after = captureGaps(sender, [0, 1, 2, 3, 4]);
		const before = captureGaps(sender, [2], "before");
		// Captured gap 2 (|): ab|cd
		// Insert "ij": before --> ab|ijcd; after --> abij|cd.
		// Remove [0..4): both --> |cd.
		receiver.root.left.insertAt(2, "i", "j");
		assert.equal(receiver.root.left.join(""), "abijcd");
		assert.throws(
			() => receiver.locations.capture([]),
			validateUsageError(/pending local edits/),
		);
		assert.deepEqual(indices(receiver.locations, after), [0, 1, 4, 5, 6]);
		assert.deepEqual(indices(receiver.locations, before), [2]);
		receiver.root.left.removeRange(0, 4);
		assert.equal(receiver.root.left.join(""), "cd");
		assert.deepEqual(indices(receiver.locations, after), [0, 0, 0, 1, 2]);
	});

	it("follows cross-array moves and chooses the adjacent side at boundaries", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const after = captureGaps(sender, [1, 2, 3]);
		const before = captureGaps(sender, [1, 2, 3], "before");
		// Move left[1..3) into right at gap 1:
		// left:  a [b c] d  -->  a d
		// right: x     y   -->  x [b c] y
		//
		// Captured gap      "before" result    "after" result
		// left a|bcd   -->  left  a|d          right x|bcy
		// left ab|cd   -->  right xb|cy        right xb|cy
		// left abc|d   -->  right xbc|y        left  a|d
		receiver.root.right.moveRangeToIndex(1, 1, 3, receiver.root.left);
		assert.equal(receiver.root.left.join(""), "ad");
		assert.equal(receiver.root.right.join(""), "xbcy");
		assert.deepEqual(resolved(receiver.locations.resolve(after)), [
			{ kind: "sequence", node: receiver.root.right, index: 1, affinity: "after" },
			{ kind: "sequence", node: receiver.root.right, index: 2, affinity: "after" },
			{ kind: "sequence", node: receiver.root.left, index: 1, affinity: "after" },
		]);
		assert.deepEqual(resolved(receiver.locations.resolve(before)), [
			{ kind: "sequence", node: receiver.root.left, index: 1, affinity: "before" },
			{ kind: "sequence", node: receiver.root.right, index: 2, affinity: "before" },
			{ kind: "sequence", node: receiver.root.right, index: 3, affinity: "before" },
		]);
	});

	for (const transaction of [false, true]) {
		it(`follows characters out of a deleted source array${transaction ? " in a transaction" : ""}`, () => {
			const { views } = setup();
			const [sender, receiver] = views;
			const gap = captureGaps(sender, [2]);
			const node = capture(sender.locations, [{ kind: "node", node: sender.root.left }]);
			// left:  ab|cd  --move all-->  []  --replace-->  ["replacement"]
			// right: xy    ----------->  xab|cdy
			// The gap follows the characters; the original left-array node is deleted.
			const edit = (): void => {
				receiver.root.right.moveRangeToIndex(1, 0, 4, receiver.root.left);
				receiver.root.left = new Text(["replacement"]);
			};
			if (transaction) {
				receiver.runTransaction(edit);
			} else {
				edit();
			}
			assert.equal(receiver.root.left.join(""), "replacement");
			assert.equal(receiver.root.right.join(""), "xabcdy");
			assert.deepEqual(resolved(receiver.locations.resolve(gap)), [
				{ kind: "sequence", node: receiver.root.right, index: 3, affinity: "after" },
			]);
			expectUnavailable(receiver.locations.resolve(node), "target-deleted");
		});
	}

	it("follows text moved into an array created in the same transaction", () => {
		const { views } = setup();
		const [sender, receiver] = views;
		const batch = captureGaps(sender, [2]);
		// right: xy --replace--> []
		// left:  a[b|c]d  --move [1..3)-->  ad
		// right: []      -------------->  b|c
		receiver.runTransaction(() => {
			receiver.root.right = new Text([]);
			receiver.root.right.moveRangeToIndex(0, 1, 3, receiver.root.left);
		});
		assert.equal(receiver.root.left.join(""), "ad");
		assert.equal(receiver.root.right.join(""), "bc");
		assert.deepEqual(resolved(receiver.locations.resolve(batch)), [
			{ kind: "sequence", node: receiver.root.right, index: 1, affinity: "after" },
		]);
	});

	it("follows whole objects and arrays across fields without changing their identity", () => {
		class Item extends sf.object("Item", { text: Text }) {}
		class Items extends sf.array("Items", Item) {}
		class Root extends sf.object("Root", { a: Items, b: Items }) {}
		const provider = new TestTreeProviderLite(2);
		const views = provider.trees.map((tree) =>
			tree.kernel.viewWith(new TreeViewConfiguration({ schema: Root })),
		);
		views[0].initialize({ a: [{ text: ["a", "b"] }], b: [] });
		provider.synchronizeMessages();
		const [sender, receiver] = views;
		const item = sender.root.a[0];
		const batch = capture(sender.locations, [
			{ kind: "node", node: item },
			{ kind: "node", node: item.text },
			{ kind: "sequence", node: item.text, index: 1, affinity: "after" },
		]);
		// a: [item { text: a|b }]  --move item-->  []
		// b: []                  ------------>  [item { text: a|b }]
		// Insert at text gap 0: a|b --> xa|b. Both item and text retain their identity.
		receiver.root.b.moveToStart(0, receiver.root.a);
		receiver.root.b[0].text.insertAtStart("x");
		assert.equal(receiver.root.a.length, 0);
		assert.equal(receiver.root.b[0].text.join(""), "xab");
		assert.deepEqual(resolved(receiver.locations.resolve(batch)), [
			{ kind: "node", node: receiver.root.b[0] },
			{ kind: "node", node: receiver.root.b[0].text },
			{ kind: "sequence", node: receiver.root.b[0].text, index: 2, affinity: "after" },
		]);
	});

	it("uses stored field keys and handles empty arrays and multi-code-unit elements", () => {
		class Root extends sf.object("StoredKeys", {
			text: sf.required(Text, { key: "stored" }),
		}) {}
		const provider = new TestTreeProviderLite(2);
		const views = provider.trees.map((tree) =>
			tree.kernel.viewWith(new TreeViewConfiguration({ schema: Root })),
		);
		views[0].initialize({ text: [] });
		provider.synchronizeMessages();
		const batch = capture(views[0].locations, [
			{ kind: "sequence", node: views[0].root.text, index: 0, affinity: "before" },
			{ kind: "sequence", node: views[0].root.text, index: 0, affinity: "after" },
		]);
		views[1].root.text.insertAtStart("\u{1F600}", "a");
		assert.deepEqual(indices(views[1].locations, batch), [0, 2]);
	});

	it("resolves through a remote edit and a rebased pending local edit", () => {
		const { provider, views } = setup();
		const [sender, receiver] = views;
		const batch = captureGaps(sender, [2, 4]);
		// Each bracketed word is one array element:
		// captured: a b | c d | --> receiver: [remote] a b | c d [local] |
		// History after receiving the remote edit: base -> remote -> local (still pending).
		sender.root.left.insertAtStart("remote");
		const remoteRevision = sender.branchHistory.getHead()?.revision;
		assert(remoteRevision !== undefined);
		receiver.root.left.insertAtEnd("local");
		do {
			assert(provider.peekNextMessage() !== undefined);
			provider.synchronizeMessages({ count: 1 });
		} while (receiver.branchHistory.getHead()?.getParent()?.revision !== remoteRevision);
		assert.deepEqual([...receiver.root.left], ["remote", "a", "b", "c", "d", "local"]);
		assert.throws(
			() => receiver.locations.capture([]),
			validateUsageError(/pending local edits/),
		);
		assert.deepEqual(indices(receiver.locations, batch), [3, 6]);
		provider.synchronizeMessages();
		assert.deepEqual(
			capturedData(receiver.locations.captureNode(receiver.root)).revision,
			capturedData(sender.locations.captureNode(sender.root)).revision,
		);
	});

	it("can previously unresolvable locations once their revision is made available", () => {
		const { provider, views } = setup();
		const [sender, receiver] = views;
		const runtime = provider.trees[1].containerRuntime;
		const known = receiver.locations.captureNode(receiver.root);
		runtime.connected = false;
		sender.root.left.insertAtEnd("new");
		provider.synchronizeMessages();
		const batch = captureGaps(sender, [5]);
		assert.deepEqual(receiver.locations.resolve(batch), [{ status: "revision-unavailable" }]);
		assert.deepEqual(receiver.locations.resolve([batch[0], known, batch[0]]), [
			{ status: "revision-unavailable" },
			receiver.locations.resolve(known),
			{ status: "revision-unavailable" },
		]);
		runtime.connected = true;
		provider.synchronizeMessages();
		assert.deepEqual(indices(receiver.locations, batch), [5]);
	});

	it("expires old revisions without retaining history for captured locations", () => {
		const { provider, views } = setup();
		const [sender, receiver] = views;
		const old = captureGaps(sender, [2]);
		for (let i = 0; i < 8; i++) {
			sender.root.left.insertAtStart("s");
			receiver.root.right.insertAtStart("r");
			provider.synchronizeMessages();
		}
		assert.deepEqual(receiver.locations.resolve(old), [{ status: "revision-unavailable" }]);
		const fresh = captureGaps(sender, [0, 12]);
		assert.deepEqual(indices(receiver.locations, fresh), [0, 12]);
		assert.deepEqual(receiver.locations.resolve([fresh[0], old[0], fresh[1]]), [
			receiver.locations.resolve(fresh[0]),
			{ status: "revision-unavailable" },
			receiver.locations.resolve(fresh[1]),
		]);
	});

	it("validates local capture inputs and foreign view objects", () => {
		const { views } = setup();
		for (const index of [-1, 5, 1.5, Number.NaN, Infinity]) {
			assert.throws(
				() =>
					views[0].locations.capture([
						{ kind: "sequence", node: views[0].root.left, index, affinity: "after" },
					]),
				/in-bounds gap/,
			);
		}
		assert.throws(
			() => views[0].locations.capture([{ kind: "node", node: views[1].root }]),
			/must belong/,
		);
		assert.throws(
			() => views[0].locations.capture([{ kind: "node", node: new Text([]) }]),
			/must belong/,
		);
	});

	it("validates wire references, gaps, and revision pairing", () => {
		const { views } = setup(FormatValidatorBasic);
		const [sender, receiver] = views;
		const batch = captureGaps(sender, [2]);
		const data = capturedData(batch[0]);
		const location = data.location;
		assert(location.kind === "sequence");
		for (const reference of [
			null,
			{},
			{ version: 999 },
			{ version: 1, revision: data.revision, path: [] },
			JSON.stringify(location.node),
		]) {
			expectUnavailable(
				receiver.locations.resolve(
					eraseCapture({
						...data,
						location: { ...location, node: reference },
					}),
				),
				"invalid-location",
			);
		}
		for (const index of [-1, 5, 1.5, Number.NaN, Infinity]) {
			expectUnavailable(
				receiver.locations.resolve(
					eraseCapture({
						...data,
						location: { ...location, index },
					}),
				),
				"invalid-location",
			);
		}
		for (const revision of [
			"wrong",
			null,
			{},
			{ ...data.revision, branchId: "other" },
			{ branchId: "main", revision: 0 },
		]) {
			assert.deepEqual(receiver.locations.resolve(eraseCapture({ ...data, revision })), {
				status: "revision-unavailable",
			});
		}
	});

	it("rejects open transactions and does not retain aborted edits", () => {
		const { views } = setup();
		const view = views[0];
		const batch = captureGaps(view, [0, 2, 4]);
		view.runTransaction(() => {
			assert.throws(
				() => view.locations.capture([]),
				validateUsageError(/during a transaction/),
			);
			assert.throws(
				() => view.locations.resolve(batch),
				validateUsageError(/during a transaction/),
			);
			view.root.left.removeRange();
			assert.throws(
				() => view.locations.capture([]),
				validateUsageError(/during a transaction/),
			);
			return { rollback: true };
		});
		assert.deepEqual(
			capturedData(view.locations.captureNode(view.root)).revision,
			capturedData(batch[0]).revision,
		);
		assert.deepEqual(indices(view.locations, batch), [0, 2, 4]);
		const fork = view.fork();
		assert.throws(
			() => fork.locations.capture([]),
			validateUsageError(/only supported on the main view/),
		);
		assert.throws(
			() => fork.locations.resolve(batch),
			validateUsageError(/only supported on the main view/),
		);
		fork.dispose();
	});

	it("preserves deletion collapse across undo without reviving node selections", () => {
		const { views } = setup();
		const view = views[0];
		const before = captureGaps(view, [2], "before");
		const after = captureGaps(view, [2]);
		let undo: RevertibleAlpha | undefined;
		const off = view.events.on("changed", (metadata) => {
			if (metadata.isLocal) {
				undo = metadata.getRevertible();
			}
		});
		// ab|cd --remove "bc"--> a|d --undo--> a|bcd ("before")
		//                                   abc|d ("after")
		// Undo restores the text, not the gap's former offset inside the deleted span.
		view.root.left.removeRange(1, 3);
		assert.equal(view.root.left.join(""), "ad");
		off();
		assert(undo !== undefined);
		undo.revert();
		assert.equal(view.root.left.join(""), "abcd");
		assert.deepEqual(indices(view.locations, before), [1]);
		assert.deepEqual(indices(view.locations, after), [3]);
	});

	it("does not revive whole-node selections after deletion and undo", () => {
		const { views } = setup();
		const view = views[0];
		const batch = capture(view.locations, [{ kind: "node", node: view.root.left }]);
		let undo: RevertibleAlpha | undefined;
		const off = view.events.on("changed", (metadata) => {
			if (metadata.isLocal) {
				undo = metadata.getRevertible();
			}
		});
		view.root.left = new Text(["replacement"]);
		off();
		assert(undo !== undefined);
		undo.revert();
		expectUnavailable(view.locations.resolve(batch), "target-deleted");
	});

	it("resolves across restoration of content removed before the captured revision", () => {
		const { provider, views } = setup();
		const [sender, receiver] = views;
		let undo: RevertibleAlpha | undefined;
		const off = sender.events.on("changed", (metadata) => {
			if (metadata.isLocal) {
				undo = metadata.getRevertible();
			}
		});
		sender.root.left.removeRange(1, 3);
		off();
		assert(undo !== undefined);
		provider.synchronizeMessages();
		const before = captureGaps(sender, [1], "before");
		const after = captureGaps(sender, [1], "after");
		undo.revert();
		provider.synchronizeMessages();
		assert.deepEqual(indices(receiver.locations, before), [1]);
		assert.deepEqual(indices(receiver.locations, after), [3]);
	});

	it("captures map nodes and returns schema-narrowable SimpleTree objects", () => {
		class Metadata extends sf.map("Metadata", sf.string) {}
		const provider = new TestTreeProviderLite(2);
		const views = provider.trees.map((tree) =>
			tree.kernel.viewWith(new TreeViewConfiguration({ schema: Metadata })),
		);
		views[0].initialize(new Map([["title", "one"]]));
		provider.synchronizeMessages();
		const batch = capture(views[0].locations, [{ kind: "node", node: views[0].root }]);
		views[1].root.set("title", "two");
		const [location] = resolved(views[1].locations.resolve(batch));
		assert(location.kind === "node");
		assert(location.node instanceof Metadata);
		assert.equal(location.node.get("title"), "two");
		assert.equal(location.node, views[1].root);
	});

	it("rejects mixing a reference with a different retained revision", () => {
		const { provider, views } = setup();
		const [sender, receiver] = views;
		const batch = captureGaps(sender, [1]);
		sender.root.right.insertAtStart("x");
		provider.synchronizeMessages();
		const newer = sender.locations.captureNode(sender.root);
		expectUnavailable(
			receiver.locations.resolve(
				eraseCapture({ ...capturedData(batch[0]), revision: capturedData(newer).revision }),
			),
			"invalid-location",
		);
	});

	it("resolves node and gap locations across schema widening and subsequent edits", () => {
		const { provider, views } = setup();
		const batch = capture(views[0].locations, [
			{ kind: "node", node: views[0].root },
			{ kind: "node", node: views[0].root.left },
			{ kind: "sequence", node: views[0].root.left, index: 1, affinity: "after" },
		]);
		views[0].dispose();
		const upgraded = new SchemaFactory("com.example.locations");
		class Updated extends upgraded.object("Document", {
			left: Text,
			right: Text,
			title: upgraded.optional(upgraded.string),
		}) {}
		const view = provider.trees[0].kernel.viewWith(
			new TreeViewConfiguration({ schema: Updated }),
		);
		view.upgradeSchema();
		assert.deepEqual(resolved(view.locations.resolve(batch)), [
			{ kind: "node", node: view.root },
			{ kind: "node", node: view.root.left },
			{ kind: "sequence", node: view.root.left, index: 1, affinity: "after" },
		]);
		// left:  a|bcd --insert "x"--> xa|bcd --move [1..4)--> xd
		// right: xy                         ---------------> xa|bcy
		view.root.left.insertAtStart("x");
		view.root.right.moveRangeToIndex(1, 1, 4, view.root.left);
		assert.equal(view.root.left.join(""), "xd");
		assert.equal(view.root.right.join(""), "xabcy");
		assert.deepEqual(resolved(view.locations.resolve(batch)), [
			{ kind: "node", node: view.root },
			{ kind: "node", node: view.root.left },
			{ kind: "sequence", node: view.root.right, index: 2, affinity: "after" },
		]);
	});

	it("replays data entries interleaved with schema changes in the same commit", () => {
		const { provider, views } = setup();
		const batch = capture(views[0].locations, [
			{ kind: "node", node: views[0].root.left },
			{ kind: "sequence", node: views[0].root.left, index: 2, affinity: "after" },
		]);
		const checkout = provider.trees[0].kernel.checkout;
		// One commit: insert "x" -> widen schema -> move left[1..4) to right gap 1.
		// left:  ab|cd --> xab|cd --> xab|cd --> xd
		// right: xy    --------------------> xab|cy
		checkout.transaction.start();
		views[0].root.left.insertAtStart("x");
		views[0].dispose();
		const upgraded = new SchemaFactory("com.example.locations");
		class Updated extends upgraded.object("Document", {
			left: Text,
			right: Text,
			title: upgraded.optional(upgraded.string),
		}) {}
		const updatedConfig = new TreeViewConfiguration({ schema: Updated });
		const view = provider.trees[0].kernel.viewWith(updatedConfig);
		view.upgradeSchema();
		view.root.right.moveRangeToIndex(1, 1, 4, view.root.left);
		checkout.transaction.commit();
		assert.equal(view.root.left.join(""), "xd");
		assert.equal(view.root.right.join(""), "xabcy");
		assert.deepEqual(
			checkout.getLocationHead().change.changes.map((change) => change.type),
			["data", "schema", "data"],
		);
		assert.deepEqual(resolved(view.locations.resolve(batch)), [
			{ kind: "node", node: view.root.left },
			{ kind: "sequence", node: view.root.right, index: 3, affinity: "after" },
		]);
		views[1].dispose();
		const receiver = provider.trees[1].kernel.viewWith(updatedConfig);
		provider.synchronizeMessages();
		assert.deepEqual(resolved(receiver.locations.resolve(batch)), [
			{ kind: "node", node: receiver.root.left },
			{ kind: "sequence", node: receiver.root.right, index: 3, affinity: "after" },
		]);
	});

	it("reports normal view incompatibility instead of rejecting historical schema changes", () => {
		const { provider, views } = setup();
		const batch = captureGaps(views[0], [1]);
		const receiver = views[1].locations;
		views[0].dispose();
		const upgraded = new SchemaFactory("com.example.locations");
		class Updated extends upgraded.object("Document", {
			left: Text,
			right: Text,
			title: upgraded.optional(upgraded.string),
		}) {}
		const view = provider.trees[0].kernel.viewWith(
			new TreeViewConfiguration({ schema: Updated }),
		);
		view.upgradeSchema();
		provider.synchronizeMessages();
		assert.equal(views[1].compatibility.canView, false);
		assert.throws(() => receiver.resolve(batch), /view schema is incompatible/);
	});

	it("rejects retained resolver references after view disposal", () => {
		const { views } = setup();
		const resolver = views[0].locations;
		const batch = captureGaps(views[0], [0]);
		views[0].dispose();
		assert.throws(() => resolver.capture([]), /disposed TreeView/);
		assert.throws(() => resolver.resolve(batch), /disposed TreeView/);
	});

	it("rejects non-main shared branches before and after acknowledgement", () => {
		const provider = new TestTreeProviderLite(
			2,
			configuredSharedTree({ enableSharedBranches: true }).getFactory(),
		);
		const main = provider.trees[0].kernel.viewWith(config);
		main.initialize({ left: ["a", "b"], right: [] });
		provider.synchronizeMessages();
		const mainCapture = captureGaps(main, [1]);
		const branch = provider.trees[0].createSharedBranch();
		const first = asAlpha(provider.trees[0].viewSharedBranchWith(branch, config));
		assert.throws(
			() => first.locations.capture([]),
			validateUsageError(/only supported on the main view/),
		);
		assert.throws(
			() => first.locations.resolve(mainCapture),
			validateUsageError(/only supported on the main view/),
		);
		provider.synchronizeMessages();
		const second = asAlpha(provider.trees[1].viewSharedBranchWith(branch, config));
		assert.throws(
			() => first.locations.capture([]),
			validateUsageError(/only supported on the main view/),
		);
		assert.throws(
			() => first.locations.resolve(mainCapture),
			validateUsageError(/only supported on the main view/),
		);
		assert.throws(
			() => second.locations.capture([]),
			validateUsageError(/only supported on the main view/),
		);
		assert.throws(
			() => second.locations.resolve(mainCapture),
			validateUsageError(/only supported on the main view/),
		);
		second.root.left.insertAtStart("x");
		provider.synchronizeMessages();
		assert.throws(
			() => second.locations.capture([]),
			validateUsageError(/only supported on the main view/),
		);
		assert.deepEqual(indices(main.locations, mainCapture), [1]);
	});

	it("rejects pending edits and permits capture once they are acknowledged", () => {
		const { provider, views } = setup();
		const view = views[0];
		view.root.left.insertAtStart("x");
		assert.throws(() => captureGaps(view, [1]), validateUsageError(/pending local edits/));
		provider.synchronizeMessages();
		assert.deepEqual(indices(views[1].locations, captureGaps(view, [1])), [1]);
	});

	it("rejects capture before initialization has a sequenced revision", () => {
		const provider = new TestTreeProviderLite();
		const view = provider.trees[0].kernel.viewWith(config);
		assert.throws(
			() => view.locations.capture([]),
			validateUsageError(/before the main view has a sequenced revision/),
		);
		view.initialize({ left: [], right: [] });
		assert.throws(() => view.locations.capture([]), validateUsageError(/pending local edits/));
		provider.synchronizeMessages();
		assert.deepEqual(resolved(view.locations.resolve(captureGaps(view, [0]))).length, 1);
	});

	it("rejects detached and independent views", () => {
		const { views } = setup();
		const batch = captureGaps(views[0], [1]);
		const runtime = new MockFluidDataStoreRuntime({ attachState: AttachState.Detached });
		const tree = configuredSharedTree({}).getFactory().create(runtime, "tree");
		const detached = asAlpha(tree.viewWith(config));
		detached.initialize({ left: ["a"], right: [] });
		assert.throws(
			() => detached.locations.capture([]),
			validateUsageError(/require an attached SharedTree/),
		);
		assert.throws(
			() => detached.locations.resolve(batch),
			validateUsageError(/require an attached SharedTree/),
		);
		const independent = getView(config);
		independent.initialize({ left: ["a"], right: [] });
		assert.throws(
			() => independent.locations.capture([]),
			validateUsageError(/only supported on the main view/),
		);
		assert.throws(
			() => independent.locations.resolve(batch),
			validateUsageError(/only supported on the main view/),
		);
	});
});

describe("TreeLocationResolver text", () => {
	class Format extends sf.object("LocationFormat", { bold: sf.boolean }) {}
	class Embedded extends sf.object("LocationEmbedded", { content: sf.string }) {}
	const Formatted = FormattedText.createSchema(
		new SchemaFactoryAlpha("com.example.locations.text"),
		Format,
		[Embedded],
		{ bold: false },
	);
	class FormattedSubclass extends FormattedText.createSchema(
		new SchemaFactoryAlpha("com.example.locations.text.subclass"),
		Format,
		[Embedded],
		{ bold: false },
	) {}

	function characters(node: TextLocationNode): TreeArrayNode {
		assert(isTextLocationNode(node));
		return node[textLocationArray];
	}

	for (const [name, schema] of [
		["plain", PlainText.Tree],
		["formatted", Formatted],
		["formatted subclass", FormattedSubclass],
	] as const) {
		describe(name, () => {
			class Paragraph extends sf.object(`Paragraph ${name}`, {
				text: [PlainText.Tree, Formatted, FormattedSubclass],
			}) {}
			class Paragraphs extends sf.array(`Paragraphs ${name}`, Paragraph) {}
			class Root extends sf.object(`Text document ${name}`, {
				paragraphs: Paragraphs,
			}) {}

			function setupText(
				left = "abcd",
				right = "xy",
			): {
				provider: TestTreeProviderLite;
				views: TreeViewAlpha<typeof Root>[];
			} {
				const provider = new TestTreeProviderLite(
					2,
					configuredSharedTree({ jsonValidator: FormatValidatorBasic }).getFactory(),
				);
				const views = provider.trees.map((tree) =>
					tree.kernel.viewWith(new TreeViewConfiguration({ schema: Root })),
				);
				views[0].initialize({
					paragraphs: [
						new Paragraph({ text: schema.fromString(left) }),
						new Paragraph({ text: schema.fromString(right) }),
					],
				});
				provider.synchronizeMessages();
				return { provider, views };
			}

			it("returns public receiver text objects and keeps node and array captures distinct", () => {
				const { views } = setupText("a\u{1F600}b");
				const [sender, receiver] = views;
				const source = sender.root.paragraphs[0].text;
				const batch = capture(sender.locations, [
					{ kind: "sequence", node: source, index: 0 },
					{
						kind: "sequence",
						node: source,
						index: 3,
						affinity: "after",
					},
					{ kind: "node", node: source },
					{ kind: "sequence", node: characters(source), index: 2 },
				]);
				assert.deepEqual(
					sender.locations.captureGap(source, 3, { affinity: "after" }),
					batch[1],
				);
				assert.throws(
					() => sender.locations.captureGap(source, 4),
					validateUsageError(/in-bounds gap index/),
				);
				// Resolve before reading the receiver's text: the adapter must work on newly materialized nodes.
				const results = resolved(receiver.locations.resolve(batch));
				const destination = receiver.root.paragraphs[0].text;
				assert.notEqual(source, destination);
				assert.equal(destination.fullString(), "a\u{1F600}b");
				assert.deepEqual(results, [
					{ kind: "text", node: destination, index: 0, affinity: "before" },
					{ kind: "text", node: destination, index: 3, affinity: "after" },
					{ kind: "node", node: destination },
					{ kind: "sequence", node: characters(destination), index: 2, affinity: "before" },
				]);
			});

			it("resolves the new text owner after moving characters and deleting the source paragraph", () => {
				const { provider, views } = setupText();
				const [sender, receiver] = views;
				const captured = sender.locations.captureGap(sender.root.paragraphs[0].text, 2);
				// source: ab|cd --> empty --> deleted paragraph
				// destination: new text xy --> xab|cdy.
				receiver.runTransaction(() => {
					receiver.root.paragraphs[1].text = schema.fromString("xy");
					characters(receiver.root.paragraphs[1].text).moveRangeToIndex(
						1,
						0,
						4,
						characters(receiver.root.paragraphs[0].text),
					);
					receiver.root.paragraphs.removeAt(0);
				});
				const destination = receiver.root.paragraphs[0].text;
				assert.equal(destination.fullString(), "xabcdy");
				const expected = [{ kind: "text", node: destination, index: 3, affinity: "before" }];
				assert.deepEqual(resolved(receiver.locations.resolve(captured)), expected);
				provider.synchronizeMessages();
				assert.deepEqual(resolved(receiver.locations.resolve(captured)), expected);
			});
		});
	}

	it("preserves formatted positions through formatRange and reformat, including embedded atoms", () => {
		const provider = new TestTreeProviderLite(2);
		const views = provider.trees.map((tree) =>
			tree.kernel.viewWith(new TreeViewConfiguration({ schema: Formatted })),
		);
		views[0].initialize(Formatted.fromString("a\u{1F600}"));
		views[0].root.insertAt(1, [new Embedded({ content: "[image]" })]);
		provider.synchronizeMessages();
		const [sender, receiver] = views;
		assert.equal(sender.root.fullString(), "a[image]\u{1F600}");
		assert.equal(sender.root.characterCount(), 3);
		const batch = capture(sender.locations, [
			{ kind: "sequence", node: sender.root, index: 1 },
			{ kind: "sequence", node: sender.root, index: 2, affinity: "after" },
			{ kind: "sequence", node: sender.root, index: 3 },
		]);
		const expected = [
			{ kind: "text", node: receiver.root, index: 1, affinity: "before" },
			{ kind: "text", node: receiver.root, index: 2, affinity: "after" },
			{ kind: "text", node: receiver.root, index: 3, affinity: "before" },
		];
		receiver.root.formatRange(0, 3, { bold: true });
		assert(receiver.root.charactersWithFormatting().every((atom) => atom.format.bold));
		assert.deepEqual(resolved(receiver.locations.resolve(batch)), expected);
		receiver.root.reformat(0, 3, { bold: false });
		assert(receiver.root.charactersWithFormatting().every((atom) => !atom.format.bold));
		assert.equal(receiver.root.fullString(), "a[image]\u{1F600}");
		assert.deepEqual(resolved(receiver.locations.resolve(batch)), expected);
		receiver.root.removeRange(1, 2);
		assert.equal(receiver.root.fullString(), "a\u{1F600}");
		assert.deepEqual(resolved(receiver.locations.resolve(batch)), [
			{ kind: "text", node: receiver.root, index: 1, affinity: "before" },
			{ kind: "text", node: receiver.root, index: 1, affinity: "after" },
			{ kind: "text", node: receiver.root, index: 2, affinity: "before" },
		]);
	});

	it("falls back to sequence output in an ordinary array and restores text output at a supported destination", () => {
		class Root extends sf.object("Text to array", { text: PlainText.Tree, array: Text }) {}
		const provider = new TestTreeProviderLite(2);
		const views = provider.trees.map((tree) =>
			tree.kernel.viewWith(new TreeViewConfiguration({ schema: Root })),
		);
		views[0].initialize({ text: PlainText.Tree.fromString("abcd"), array: ["x", "y"] });
		provider.synchronizeMessages();
		const [sender, receiver] = views;
		const batch = capture(sender.locations, [
			{ kind: "sequence", node: sender.root.text, index: 2 },
			{ kind: "sequence", node: characters(sender.root.text), index: 2 },
		]);
		// text: ab|cd --> ad; ordinary array: xy --> xb|cy.
		receiver.root.array.moveRangeToIndex(1, 1, 3, characters(receiver.root.text));
		assert.equal(receiver.root.text.fullString(), "ad");
		assert.equal(receiver.root.array.join(""), "xbcy");
		assert.deepEqual(resolved(receiver.locations.resolve(batch)), [
			{ kind: "sequence", node: receiver.root.array, index: 2, affinity: "before" },
			{ kind: "sequence", node: receiver.root.array, index: 2, affinity: "before" },
		]);
		characters(receiver.root.text).moveRangeToIndex(1, 1, 3, receiver.root.array);
		assert.equal(receiver.root.text.fullString(), "abcd");
		assert.equal(receiver.root.array.join(""), "xy");
		assert.deepEqual(resolved(receiver.locations.resolve(batch)), [
			{ kind: "text", node: receiver.root.text, index: 2, affinity: "before" },
			{ kind: "sequence", node: characters(receiver.root.text), index: 2, affinity: "before" },
		]);
	});

	it("rejects lookalike schemas rather than recognizing public method names", () => {
		class Lookalike extends sf.object("Lookalike text", { content: Text }) {
			public fullString(): string {
				return this.content.join("");
			}
			public characterCount(): number {
				return this.content.length;
			}
		}
		const provider = new TestTreeProviderLite(1);
		const view = provider.trees[0].kernel.viewWith(
			new TreeViewConfiguration({ schema: Lookalike }),
		);
		view.initialize({ content: ["a", "b"] });
		provider.synchronizeMessages();
		assert(!isTextLocationNode(view.root));
		assert.throws(
			() =>
				// @ts-expect-error Invalid text input must also be rejected at runtime.
				view.locations.capture([{ kind: "sequence", node: view.root, index: 1 }]),
			validateUsageError(/supported text node/),
		);
	});
});
