/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	TreeBeta,
	TreeViewConfiguration,
	allowUnused,
	eraseSchemaDetails,
	eraseSchemaDetailsSubclassable,
	type InsertableTreeFieldFromImplicitField,
	type InsertableTypedNode,
	type InternalTreeNode,
	type NodeFromSchema,
	type TreeFieldFromImplicitField,
	type TreeNode,
	type TreeNodeSchema,
	type WithType,
	type typeSchemaSymbol,
} from "../../../simple-tree/index.js";
import {
	SchemaFactory,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../simple-tree/api/schemaFactory.js";

import { getView } from "../../utils.js";
import type { requireAssignableTo } from "@fluidframework/build-tools";
import { Tree } from "../../../shared-tree/index.js";
import type { areSafelyAssignable, requireTrue } from "../../../util/index.js";

describe("eraseSchemaDetails", () => {
	describe("eraseSchemaDetails", () => {
		it("minimal", () => {
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

		it("example use", () => {
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

			type brand = Demo[typeof typeSchemaSymbol]["identifier"];
			type brandPublic = DemoPublic[typeof typeSchemaSymbol]["identifier"];
			allowUnused<requireAssignableTo<brand, "com.example.Demo">>();
			allowUnused<requireAssignableTo<brandPublic, "com.example.Demo">>();
			allowUnused<requireAssignableTo<Demo, DemoPublic>>();

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
		it("minimal", () => {
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

			class Square extends eraseSchemaDetailsSubclassable<SquareInterface>()(SquareInternal) {
				public static create(sideLength: number): Square {
					return new (this as TreeNodeSchema as typeof SquareInternal)({ size: sideLength });
				}
			}

			const square = Square.create(10);
			assert.equal(square.area, 100);
		});

		it("basic A", () => {
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

		it("basic B", () => {
			const schema = new SchemaFactory("com.example");

			interface Square {
				area(): number;
				setArea(area: number): void;
			}

			interface DemoSchema {
				readonly kind2: "square";

				// Since we are type erasing the constructor, we need a static factory method to create instances.
				// We could choose instead to include the constructor signature here.
				createInner<TThis extends TreeNodeSchema>(
					this: TThis,
					sideLength: number,
				): TreeFieldFromImplicitField<TThis>;
			}

			class Demo extends schema.object("Demo", { hidden: schema.number }) implements Square {
				public static readonly kind2 = "square";
				public setArea(area: number): void {
					this.hidden = Math.sqrt(area);
				}
				public area(): number {
					return this.hidden * this.hidden;
				}

				public static createInner<TThis extends TreeNodeSchema>(
					this: TThis,
					sideLength: number,
				): TreeFieldFromImplicitField<TThis> {
					return TreeBeta.importConcise(this, {
						hidden: sideLength,
					} satisfies InsertableTreeFieldFromImplicitField<typeof Demo>);
				}
			}

			const Erased = eraseSchemaDetailsSubclassable<Square, DemoSchema>()(Demo);

			class DemoPublic extends Erased {
				// Interestingly, its possible to make this protected, even though TreeNodeSchemaClass requires it to be accessible.
				protected constructor(node: InternalTreeNode) {
					super(node);
				}

				public static create(sideLength: number): DemoPublic {
					const node: DemoPublic = TreeBeta.importConcise(DemoPublic, { hidden: sideLength });
					return node;
				}

				public static create2(sideLength: number): DemoPublic {
					const node: DemoPublic = DemoPublic.createInner(sideLength);
					return node;
				}
			}

			type brand = Demo[typeof typeSchemaSymbol]["identifier"];
			type brandPublic = DemoPublic[typeof typeSchemaSymbol]["identifier"];
			allowUnused<requireAssignableTo<brand, "com.example.Demo">>();
			allowUnused<requireAssignableTo<brandPublic, "com.example.Demo">>();
			allowUnused<requireAssignableTo<Demo, DemoPublic>>();

			const config = new TreeViewConfiguration({ schema: DemoPublic });

			const view = getView(config);
			view.initialize(DemoPublic.create(5));
			assert.equal(view.root.area(), 25);

			// Constructor
			{
				// @ts-expect-error - Constructor still exists but is protected
				const nodeB = new DemoPublic({ hidden: 10 } as unknown as InternalTreeNode);

				allowUnused<
					requireAssignableTo<ConstructorParameters<typeof Erased>, [InternalTreeNode]>
				>();
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
	});
});
