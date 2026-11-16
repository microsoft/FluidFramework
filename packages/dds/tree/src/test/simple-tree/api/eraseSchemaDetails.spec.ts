/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { requireAssignableTo } from "@fluidframework/build-tools";

import { Tree, TreeBeta } from "../../../shared-tree/index.js";
import {
	SchemaFactory,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../simple-tree/api/schemaFactory.js";
import {
	TreeViewConfiguration,
	allowUnused,
	eraseSchemaDetails,
	eraseSchemaDetailsSubclassable,
	type ErasedSchemaSubclassable,
	type InsertableTreeFieldFromImplicitField,
	type InsertableTypedNode,
	type InternalTreeNode,
	type NodeFromSchema,
	type MaskedProperties,
	type TreeFieldFromImplicitField,
	type TreeNode,
	type TreeNodeSchema,
	type WithType,
	type typeSchemaSymbol,
} from "../../../simple-tree/index.js";
import type { areSafelyAssignable, requireTrue } from "../../../util/index.js";
import { getView } from "../../utils.js";

interface ReservedSquare {
	readonly area: number;
}

declare class PrivateSquareReservations {
	private readonly hidden: unknown;
}

export function createReservedSquareSchema<TReserved>(): ErasedSchemaSubclassable<
	ReservedSquare,
	"com.example.ReservedSquare",
	TReserved
> {
	const schema = new SchemaFactory("com.example");
	class SquareInternal
		extends schema.object("ReservedSquare", { hidden: schema.number })
		implements ReservedSquare
	{
		public get area(): number {
			return this.hidden * this.hidden;
		}
	}
	return eraseSchemaDetailsSubclassable<ReservedSquare, unknown, TReserved>()(SquareInternal);
}

// Keep this annotation exported to check declaration emission with a named private reservation type.
export function createPrivateReservedSquareSchema(): ErasedSchemaSubclassable<
	ReservedSquare,
	"com.example.ReservedSquare",
	PrivateSquareReservations
> {
	return createReservedSquareSchema<PrivateSquareReservations>();
}

describe("eraseSchemaDetails", () => {
	describe("eraseSchemaDetails", () => {
		it("example", () => {
			const schema = new SchemaFactory("com.example");

			interface SquareNode {
				readonly area: number;
			}

			interface SquareSchema {
				create(sideLength: number): Square;
			}

			class SquareInternal
				extends schema.object("Demo", { hidden: schema.number })
				implements SquareNode
			{
				public get area(): number {
					return this.hidden * this.hidden;
				}

				public static create(sideLength: number): SquareInternal {
					return new SquareInternal({ hidden: sideLength });
				}
			}

			const Square = eraseSchemaDetails<Square, SquareSchema>()(SquareInternal);
			type Square = SquareNode & TreeNode & WithType<"com.example.Demo">;
		});

		it("recursive", () => {
			const schema = new SchemaFactory("com.example");

			interface SquareNode {
				readonly area: number;
			}

			interface SquareSchema {
				create(sideLength: number): Square;
			}

			class SquareInternal
				extends schema.objectRecursive("Demo", {
					hidden: [() => SquareInternal, SchemaFactory.number],
				})
				implements SquareNode
			{
				public get area(): number {
					return this.hidden instanceof SquareInternal
						? this.hidden.area
						: this.hidden * this.hidden;
				}

				public static create(sideLength: number): SquareInternal {
					return new SquareInternal({ hidden: sideLength });
				}
			}

			const Square = eraseSchemaDetails<Square, SquareSchema>()(SquareInternal);
			// This can't do `NodeFromSchema<typeof Square>` because TypeScript (but not intellisense) gives "Return type annotation circularly references itself".
			type Square = SquareNode & TreeNode & WithType<"com.example.Demo">;
		});

		it("misc usage", () => {
			const schema = new SchemaFactory("com.example");

			interface Square {
				area(): number;
				setArea(area: number): void;
			}

			interface DemoSchema {
				create(sideLength: number): DemoPublic;
			}

			class Demo extends schema.object("Demo", { hidden: schema.number }) implements Square {
				public setArea(area: number): void {
					this.hidden = Math.sqrt(area);
				}
				public area(): number {
					return this.hidden * this.hidden;
				}

				public static create(sideLength: number): Demo {
					return new Demo({ hidden: sideLength });
				}
			}

			const DemoPublic = eraseSchemaDetails<Square, DemoSchema>()(Demo);
			// This can't do `NodeFromSchema<typeof DemoPublic>` because TypeScript (but not intellisense) gives "Return type annotation circularly references itself".
			type DemoPublic = Square & TreeNode & WithType<"com.example.Demo">;

			// Check that the type branding using the identifier and `WithType` is working as expected.
			type brand = Demo[typeof typeSchemaSymbol]["identifier"];
			type brandPublic = DemoPublic[typeof typeSchemaSymbol]["identifier"];
			allowUnused<requireAssignableTo<brand, "com.example.Demo">>();
			allowUnused<requireAssignableTo<brandPublic, "com.example.Demo">>();
			allowUnused<requireAssignableTo<Demo, DemoPublic>>();

			// Check that DemoPublic's node type matches what we declared.
			// Due to the cyclic dep we can't declare them only once, but we can assert they match.
			allowUnused<
				requireTrue<areSafelyAssignable<NodeFromSchema<typeof DemoPublic>, DemoPublic>>
			>();

			const config = new TreeViewConfiguration({ schema: DemoPublic });

			const view = getView(config);
			view.initialize(DemoPublic.create(5));
			assert.equal(view.root.area(), 25);

			// Constructor
			{
				const nodeA = new Demo({ hidden: 10 });

				// @ts-expect-error - eraseSchemaDetails removes constructor from public type
				const nodeB = new DemoPublic({ hidden: 10 });
				// @ts-expect-error - eraseSchemaDetails removes constructor from public type
				// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
				const nodeC = new DemoPublic({ hidden: 10 } as never);
			}

			// createFromInsertable
			{
				const nodeA = Demo.createFromInsertable({ hidden: 10 });

				// @ts-expect-error - createFromInsertable still exists but takes in `never`
				const nodeB = DemoPublic.createFromInsertable({ hidden: 10 });
				// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
				const nodeC = DemoPublic.createFromInsertable({ hidden: 10 } as never);
				allowUnused<
					requireAssignableTo<Parameters<typeof DemoPublic.createFromInsertable>, [never]>
				>();
			}

			// Events
			{
				const node = DemoPublic.create(5);
				const log: string[] = [];
				Tree.on(node, "treeChanged", () => {
					log.push("changed");
				});
				assert.deepEqual(log, []);
				node.setArea(10);
				assert.deepEqual(log, ["changed"]);
			}
		});
	});
	describe("eraseSchemaDetailsSubclassable", () => {
		it("example", () => {
			const schema = new SchemaFactory("com.example");

			interface SquareInterface {
				readonly area: number;
			}

			class SquareInternal
				extends schema.object("Demo", { size: schema.number })
				implements SquareInterface
			{
				public get area(): number {
					return this.size * this.size;
				}
			}

			class Square extends eraseSchemaDetailsSubclassable<
				SquareInterface,
				unknown,
				MaskedProperties<"size">
			>()(SquareInternal) {
				public static create(sideLength: number): Square {
					return TreeBeta.importConcise(this, { size: sideLength });
				}
			}

			const square = Square.create(10);
			assert.equal(square.area, 100);
		});

		it("masks properties with unknown reads and read-only access", () => {
			const reservedSymbol = Symbol("reserved");
			const Base =
				createReservedSquareSchema<
					MaskedProperties<"hidden" | "future" | typeof reservedSymbol | 42>
				>();

			class Square extends Base {
				public readonly label = "square";
			}

			class ExplicitOverrides extends Base {
				public override hidden = 1;
				public override future = undefined;
				public override [reservedSymbol] = 1;
				public override 42 = 1;
			}
			class ImplicitOverride extends Base {
				public hidden = 1;
			}

			const checkTypes = (node: Square): void => {
				allowUnused<requireTrue<areSafelyAssignable<typeof node.hidden, unknown>>>();
				// @ts-expect-error - A masked read must not produce a never value.
				allowUnused<requireAssignableTo<typeof node.hidden, never>>();
				// @ts-expect-error - A masked read must not expose the implementation's type.
				allowUnused<requireAssignableTo<typeof node.hidden, number>>();
				// @ts-expect-error - Masked values are not necessarily objects.
				allowUnused<requireAssignableTo<typeof node.hidden, object>>();
				// @ts-expect-error - Masked properties are read-only.
				node.hidden = node.future;
				// @ts-expect-error - Masked symbol properties are read-only.
				node[reservedSymbol] = 1;
				// @ts-expect-error - Masked numeric properties are read-only.
				node[42] = 1;
			};
			allowUnused<typeof checkTypes>();

			const square = TreeBeta.importConcise(Square, { hidden: 5 });
			assert.equal(square.area, 25);
			assert.equal(square.label, "square");
			assert.equal(square.hidden, 5);

			const view = getView(new TreeViewConfiguration({ schema: Square }));
			view.initialize(square);
			assert.equal(view.root.area, 25);
		});

		it("allows masked properties to be absent or hold arbitrary values", () => {
			const values: readonly MaskedProperties<"hidden">[] = [
				{},
				{ hidden: undefined },
				{ hidden: null },
				{ hidden: 1 },
				{ hidden: "text" },
				{ hidden: { data: true } },
			];
			assert.equal(values[0].hidden, undefined);
			allowUnused<requireAssignableTo<MaskedProperties<never>, object>>();
		});

		it("preserves private reservations through explicit factory return types", () => {
			const Base = createPrivateReservedSquareSchema();
			class Square extends Base {
				public readonly label = "square";
			}

			// @ts-expect-error - A subclass cannot expose the reserved private member.
			class PublicCollision extends Base {
				public override hidden = 1;
			}
			// @ts-expect-error - A separately declared private member also conflicts.
			class PrivateCollision extends Base {
				private override readonly hidden = 1;
			}

			const checkTypes = (node: Square): void => {
				// @ts-expect-error - Private reservations are not readable by consumers.
				const hidden: unknown = node.hidden;
				allowUnused<typeof hidden>();
			};
			allowUnused<typeof checkTypes>();

			const square = TreeBeta.importConcise(Square, { hidden: 5 });
			assert.equal(square.area, 25);
			assert.equal(square.label, "square");
		});

		it("combines private reservations and masked properties", () => {
			const Base = createReservedSquareSchema<
				PrivateSquareReservations & MaskedProperties<"future">
			>();
			class FutureOverride extends Base {
				public override future = "application data";
			}
			// @ts-expect-error - Private reservations remain effective alongside masking.
			class PrivateCollision extends Base {
				public override hidden = 1;
			}
		});

		it("does not change the schema or runtime properties", () => {
			const schema = new SchemaFactory("com.example");
			class Internal extends schema.object("Unchanged", { hidden: schema.number }) {}
			const Erased = eraseSchemaDetailsSubclassable<
				object,
				unknown,
				MaskedProperties<"hidden" | "future">
			>()(Internal);
			assert.equal(Object.is(Erased, Internal), true);
			class Consumer extends Erased {}
			const node = TreeBeta.importConcise(Consumer, { hidden: 5 });
			assert.equal(Object.hasOwn(node, "hidden"), true);
			assert.equal(Object.hasOwn(node, "future"), false);
		});

		it("Erased Base", () => {
			const schema = new SchemaFactory("com.example");

			interface Square {
				area(): number;
				setArea(area: number): void;
			}

			class Demo extends schema.object("Demo", { hidden: schema.number }) implements Square {
				public setArea(area: number): void {
					this.hidden = Math.sqrt(area);
				}
				public area(): number {
					return this.hidden * this.hidden;
				}
			}

			// In this usage pattern, details of the base class are erased, then this customized derived class can be exported.
			// In this case this class can refer to the internal on inside its implementation as long as it does not leak the type into the API.
			class DemoPublic extends eraseSchemaDetailsSubclassable<Square>()(Demo) {
				// Since this is not implicitly constructable, adding extra constructor options here is relatively safe.
				// Making the constructor protected also works.
				public constructor(node: InternalTreeNode | number) {
					if (typeof node === "number") {
						super({ hidden: node } satisfies InsertableTypedNode<typeof Demo> as never);
					} else {
						super(node);
					}
				}

				// We can also provide static factory methods.
				public static create(sideLength: number): DemoPublic {
					return new (DemoPublic as TreeNodeSchema as typeof Demo)({ hidden: sideLength });
				}
			}

			// Constructor
			{
				const nodeB = new DemoPublic(10);
				assert.equal(nodeB.area(), 100);
			}

			// createFromInsertable
			{
				// @ts-expect-error - createFromInsertable still exists but takes in `never`
				const nodeB = DemoPublic.createFromInsertable({ hidden: 10 });
				// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
				const nodeC = DemoPublic.createFromInsertable({ hidden: 10 } as never);
				allowUnused<
					requireAssignableTo<Parameters<typeof DemoPublic.createFromInsertable>, [never]>
				>();
			}

			// Events
			{
				const node = DemoPublic.create(5);
				const log: string[] = [];
				Tree.on(node, "treeChanged", () => {
					log.push("changed");
				});
				assert.deepEqual(log, []);
				node.setArea(10);
				assert.deepEqual(log, ["changed"]);
			}
		});

		it("Exporting subclassable schema", () => {
			const schema = new SchemaFactory("com.example");

			interface Square {
				area(): number;
				setArea(area: number): void;
			}

			interface DemoSchema {
				readonly kind2: "square";

				// Since we are type erasing the constructor, we need a static factory method to create instances.
				// We could choose instead to include the constructor signature here.
				create<TThis extends TreeNodeSchema>(
					this: TThis,
					sideLength: number,
				): TreeFieldFromImplicitField<TThis>;
			}

			class InternalSchema
				extends schema.object("Demo", { hidden: schema.number })
				implements Square
			{
				public static readonly kind2 = "square";
				public setArea(area: number): void {
					this.hidden = Math.sqrt(area);
				}
				public area(): number {
					return this.hidden * this.hidden;
				}

				public static create<TThis extends TreeNodeSchema>(
					this: TThis,
					sideLength: number,
				): TreeFieldFromImplicitField<TThis> {
					return TreeBeta.importConcise(this, {
						hidden: sideLength,
					} satisfies InsertableTreeFieldFromImplicitField<typeof InternalSchema>);
				}
			}

			// In this usage pattern, this could be exported for the consumer to subclass.
			// This pattern it typically used for cases which emit schema from factory functions, like we do with createTableSchema.
			const ErasedExported = eraseSchemaDetailsSubclassable<Square, DemoSchema>()(
				InternalSchema,
			);

			// The consumer can subclass it to add their own members.
			class ConsumerSchema extends ErasedExported {
				public static default(): ConsumerSchema {
					const node: ConsumerSchema = TreeBeta.importConcise(ConsumerSchema, { hidden: 5 });
					return node;
				}
			}

			type brand = InternalSchema[typeof typeSchemaSymbol]["identifier"];
			type brandPublic = ConsumerSchema[typeof typeSchemaSymbol]["identifier"];
			allowUnused<requireAssignableTo<brand, "com.example.Demo">>();
			allowUnused<requireAssignableTo<brandPublic, "com.example.Demo">>();
			allowUnused<requireAssignableTo<InternalSchema, ConsumerSchema>>();

			const config = new TreeViewConfiguration({ schema: ConsumerSchema });

			const view = getView(config);
			view.initialize(ConsumerSchema.create(5));
			assert.equal(view.root.area(), 25);

			// Constructor
			{
				// Constructor still exists but, but has insertable type erased.
				const nodeB = new ConsumerSchema({ hidden: 10 } as unknown as InternalTreeNode);

				allowUnused<
					requireAssignableTo<ConstructorParameters<typeof ErasedExported>, [InternalTreeNode]>
				>();
			}

			// createFromInsertable
			{
				// @ts-expect-error - createFromInsertable still exists but takes in `never`
				const nodeB = ConsumerSchema.createFromInsertable({ hidden: 10 });
				// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
				const nodeC = ConsumerSchema.createFromInsertable({ hidden: 10 } as never);
				allowUnused<
					requireAssignableTo<Parameters<typeof ConsumerSchema.createFromInsertable>, [never]>
				>();
			}

			// Events
			{
				const node = ConsumerSchema.create(5);
				const log: string[] = [];
				Tree.on(node, "treeChanged", () => {
					log.push("changed");
				});
				assert.deepEqual(log, []);
				node.setArea(10);
				assert.deepEqual(log, ["changed"]);
			}
		});

		it("private constructor", () => {
			const schema = new SchemaFactory("com.example");

			interface Square {
				area(): number;
			}

			class Demo extends schema.object("Demo", { hidden: schema.number }) implements Square {
				public area(): number {
					return this.hidden * this.hidden;
				}
			}

			class DemoPublic extends eraseSchemaDetailsSubclassable<Square>()(Demo) {
				private constructor(node: InternalTreeNode) {
					super(node);
				}

				public static create(sideLength: number): DemoPublic {
					// We can create an instance of the derived type using the base type for type checking the insertable,
					// but avoiding the constructor.
					return TreeBeta.create(DemoPublic as TreeNodeSchema as typeof Demo, {
						hidden: sideLength,
					});
				}
			}

			// Check the node works as a node in a few APIs
			{
				const node = DemoPublic.create(5);
				Tree.on(node, "treeChanged", () => {});
				assert.equal(Tree.is(node, DemoPublic), true);
				const config = new TreeViewConfiguration({ schema: DemoPublic });
			}
		});
	});
});
