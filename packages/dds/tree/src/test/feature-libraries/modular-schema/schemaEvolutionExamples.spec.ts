/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
    FieldTypeView, FullSchemaPolicy, TreeViewSchema, ViewSchemaCollection, allowsFieldSuperset,
    allowsTreeSuperset, ViewSchema,
// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
} from "../../../feature-libraries/modular-schema";

import {
    treeSchema, fieldSchema,
    FieldSchema,
    GlobalFieldKey, TreeSchema, TreeSchemaIdentifier, ValueSchema, SchemaData, InMemoryStoredSchemaRepository, lookupGlobalFieldSchema, lookupTreeSchema,
} from "../../../schema-stored";
import {
    Adapters, Compatibility, TreeAdapter, FieldAdapter,
} from "../../../schema-view";
import { brand } from "../../../util";
import { defaultSchemaPolicy, emptyField, FieldKinds } from "../../../feature-libraries";
import { rootFieldKey } from "../../../tree";

// Allow importing specific example files:
/* eslint-disable-next-line import/no-internal-modules */
import { codePoint, string } from "../../schema-stored/examples/schemaExamples";

class TestSchemaRepository extends InMemoryStoredSchemaRepository<FullSchemaPolicy> {
    public clone(): TestSchemaRepository {
        return new TestSchemaRepository(
            this.policy,
            { treeSchema: new Map(this.data.treeSchema), globalFieldSchema: new Map(this.data.globalFieldSchema) },
        );
    }

    /**
     * Updates the specified schema iff all possible in schema data would remain in schema after the change.
     * @returns true iff update was performed.
     */
    public tryUpdateFieldSchema(
        identifier: GlobalFieldKey,
        schema: FieldSchema,
    ): boolean {
        if (
            allowsFieldSuperset(
                this.policy,
                this.data,
                lookupGlobalFieldSchema(this, identifier),
                schema,
            )
        ) {
            this.data.globalFieldSchema.set(identifier, schema);
            this.invalidateDependents();
            return true;
        }
        return false;
    }

    /**
     * Updates the specified schema iff all possible in schema data would remain in schema after the change.
     * @returns true iff update was performed.
     */
    public tryUpdateTreeSchema(
        identifier: TreeSchemaIdentifier,
        schema: TreeSchema,
    ): boolean {
        const original = lookupTreeSchema(this, identifier);
        if (allowsTreeSuperset(this.policy, this.data, original, schema)) {
            this.data.treeSchema.set(identifier, schema);
            this.invalidateDependents();
            return true;
        }
        return false;
    }
}

function assertEnumEqual<TEnum extends { [key: number]: string; }>(enumObject: TEnum, a: number, b: number): void {
    if (a !== b) {
        assert.fail(`expected ${a} (${enumObject[a]}) to equal ${b} (${enumObject[b]})`);
    }
}

describe("Schema Evolution Examples", () => {
    // Define some schema and identifiers for them for use in these examples:
    const canvasIdentifier: TreeSchemaIdentifier = brand("86432448-8454-4c86-a39c-699afbbdb753");
    const textIdentifier: TreeSchemaIdentifier = brand("3034e643-0ff3-44a9-8b7e-aea31fe635c8");
    const positionedCanvasItemIdentifier: TreeSchemaIdentifier = brand("d1810094-0990-410e-9704-b17a94b1ad85");
    const pointIdentifier: TreeSchemaIdentifier = brand("a68c1750-9fba-4b6e-8643-9d830e271c05");
    const numberIdentifier: TreeSchemaIdentifier = brand("08b4087a-da53-45d1-86cd-15a2948077bf");

    const canvas = treeSchema({
        localFields: { items: fieldSchema(FieldKinds.sequence, [numberIdentifier]) },
        extraLocalFields: emptyField,
    });
    const number = treeSchema({ value: ValueSchema.Number, extraLocalFields: emptyField });

    const point = treeSchema({
        localFields: {
            x: fieldSchema(FieldKinds.value, [numberIdentifier]),
            y: fieldSchema(FieldKinds.value, [numberIdentifier]),
        },
        extraLocalFields: emptyField,
    });

    // A type that can be used to position items without an inherent position within the canvas.
    const positionedCanvasItem = treeSchema({
        localFields: {
            position: fieldSchema(FieldKinds.value, [pointIdentifier]),
            content: fieldSchema(FieldKinds.value, [textIdentifier]),
        },
        extraLocalFields: emptyField,
    });

    const root: FieldTypeView = new FieldTypeView(FieldKinds.value, [canvasIdentifier]);

    const tolerantRoot = new FieldTypeView(FieldKinds.optional, [canvasIdentifier]);

    const treeViewSchema: ReadonlyMap<TreeSchemaIdentifier, TreeViewSchema> = new Map([
        [canvasIdentifier, canvas],
        [numberIdentifier, number],
        [pointIdentifier, point],
        [positionedCanvasItemIdentifier, positionedCanvasItem],
        [textIdentifier, string],
    ]);

    /**
     * This shows basic usage of stored and view schema, including a schema change handled using the
     * "Design-pattern apps can use to handle schema migrations" proposed in `Stored and View Schema.md`.
     * Note that this focuses on simpler compatible cases
     * (where old data meets the new schema and the schema is updated keeping the same identifier),
     * and does only briefly mentions the case where a new identifier is needed
     * (since adapters are not implemented yet, and they are the nice way to handle that).
     */
    it("basic usage", () => {
        // Collect our view schema.
        // This will represent our view schema for a simple canvas application.
        const viewCollection: ViewSchemaCollection = {
            globalFieldSchema: new Map([[rootFieldKey, root]]),
            treeSchema: treeViewSchema,
        };
        // This is where legacy schema handling logic for schematize.
        const adapters: Adapters = {};
        // Compose all the view information together.
        const view = new ViewSchema(defaultSchemaPolicy, adapters, viewCollection);

        // Now lets imagine using this application on a new empty document.
        // StoredSchemaRepository defaults to a state that permits no document states at all.
        // To permit an empty document, we have to define a root field, and permit it to be empty.
        const stored = new TestSchemaRepository(defaultSchemaPolicy);
        assert(stored.tryUpdateFieldSchema(rootFieldKey, emptyField));

        {
            // When we open this document, we should check it's compatibility with our application:
            const compat = view.checkCompatibility(stored);

            // Sadly for our application, we did not allow empty roots in our view schema,
            // nor did we provide an adapter capable of handling empty roots.
            // This means our application is unable to view this document.
            assertEnumEqual(Compatibility, compat.read, Compatibility.Incompatible);

            // And since the view schema currently excludes empty roots, its also incompatible for writing:
            assertEnumEqual(Compatibility, compat.write, Compatibility.Incompatible);

            // Additionally even updating the document schema can't save this app,
            // since the new schema would be incompatible with the existing document content.
            assertEnumEqual(Compatibility, compat.writeAllowingStoredSchemaUpdates, Compatibility.Incompatible);

            // This is where the app would inform the user that the document
            // is not compatible with their version of the application.
            // This situation (view schema expecting a value where stored schema does not have one),
            // applies just the same in non-root cases, and thus the resolutions apply would also apply to other cases.
        }

        {
            // There are two ways the app could add support for handling empty documents.
            // 1. By adjusting it's view schema for the root field to tolerate empty (by making it optional).
            // 2. By providing a MissingFieldAdapter adapter for the root field
            //    (ex: by providing a default empty canvas).

            // This example picks the first approach.
            // Lets simulate the developers of the app making this change by modifying the view schema:
            const viewCollection2: ViewSchemaCollection = {
                globalFieldSchema: new Map([[rootFieldKey, tolerantRoot]]), // This was updated
                treeSchema: viewCollection.treeSchema,
            };
            const view2 = new ViewSchema(defaultSchemaPolicy, adapters, viewCollection2);
            // When we open this document, we should check it's compatibility with our application:
            const compat = view2.checkCompatibility(stored);

            // The adjusted view schema can be used read this document, no adapters needed.
            assertEnumEqual(Compatibility, compat.read, Compatibility.Compatible);

            // However the document just has its empty root schema,
            // so the app could make changes that could not be written back.
            assertEnumEqual(Compatibility, compat.write, Compatibility.Incompatible);

            // However, it is possible to update the schema in the document to match our schema
            // (since the existing data in compatible with our schema)
            assertEnumEqual(Compatibility, compat.writeAllowingStoredSchemaUpdates, Compatibility.Compatible);

            // The app can consider this compatible and proceed if it is ok with updating schema on write.
            // There are a few approaches apps might want to take here, but we will assume one that seems reasonable:
            // If this were a document that that the app just created,
            // it can imminently write its schema into the document:
            // it knows there are no existing users of this document that will be broken by this.
            // But if this is a document that it did not just create,
            // it could inform the user that this document is supported for import,
            // but its format may be updated when saving,
            // and let the user choose if they want to open it readonly on read-write.
            // A web application might want to have a table of well know format updates that it considers ok to do
            // implicitly to avoid prompting the user if the change is a well understood forward version migration
            // to a widely supported version.

            // Lets assume its time to update the schema in the document
            // (either eagerly or lazily when first needing to do so when writing into the document).
            // Once again the order does not matter:
            assert(stored.tryUpdateTreeSchema(canvasIdentifier, canvas));
            assert(stored.tryUpdateTreeSchema(numberIdentifier, number));
            assert(stored.tryUpdateTreeSchema(pointIdentifier, point));
            assert(stored.tryUpdateTreeSchema(positionedCanvasItemIdentifier, positionedCanvasItem));
            assert(stored.tryUpdateTreeSchema(textIdentifier, string));
            assert(stored.tryUpdateFieldSchema(rootFieldKey, tolerantRoot));

            // That will cause the document stored schema to change,
            // which will notify and applications with the document open.
            // They can recheck their compatibility:
            const compatNew = view2.checkCompatibility(stored);
            assertEnumEqual(Compatibility, compatNew.read, Compatibility.Compatible);
            // It is now possible to write our date into the document.
            assertEnumEqual(Compatibility, compatNew.write, Compatibility.Compatible);

            // Now lets imagine some time passes, and the developers want to add a second content type:
            const counterIdentifier: TreeSchemaIdentifier = brand("0d8da0ca-b3ba-4025-93a3-b8f181379e3b");
            const counter = treeSchema({
                localFields: {
                    count: fieldSchema(FieldKinds.value, [numberIdentifier]),
                },
                extraLocalFields: emptyField,
            });
            // Lets allow counters inside positionedCanvasItem, instead of just text:
            const positionedCanvasItem2 = treeSchema({
                localFields: {
                    position: fieldSchema(FieldKinds.value, [pointIdentifier]),
                    content: fieldSchema(FieldKinds.value, [textIdentifier, counterIdentifier]),
                },
                extraLocalFields: emptyField,
            });
            // Once again we will simulate reloading the app with different schema by modifying the view schema.
            const viewCollection3: ViewSchemaCollection = {
                globalFieldSchema: new Map([[rootFieldKey, tolerantRoot]]),
                treeSchema: new Map([
                    ...viewCollection.treeSchema,
                    [counterIdentifier, counter],
                    [positionedCanvasItemIdentifier, positionedCanvasItem2],
                ]),
            };
            const view3 = new ViewSchema(defaultSchemaPolicy, adapters, viewCollection3);

            // With this new schema, we can load the document just like before:
            const compat2 = view3.checkCompatibility(stored);
            assertEnumEqual(Compatibility, compat2.read, Compatibility.Compatible);
            assertEnumEqual(Compatibility, compat2.write, Compatibility.Incompatible);
            assertEnumEqual(Compatibility, compat2.writeAllowingStoredSchemaUpdates, Compatibility.Compatible);

            // This is the same case as above where we can choose to do a schema update if we want:
            assert(stored.tryUpdateTreeSchema(positionedCanvasItemIdentifier, positionedCanvasItem2));
            assert(stored.tryUpdateTreeSchema(counterIdentifier, counter));

            // And recheck compat:
            const compat3 = view3.checkCompatibility(stored);
            assertEnumEqual(Compatibility, compat3.read, Compatibility.Compatible);
            assertEnumEqual(Compatibility, compat3.write, Compatibility.Compatible);
        }
    });

    function makeTolerantRootAdapter(view: SchemaData): FieldAdapter {
        return {
            field: rootFieldKey,
            convert: (field): FieldSchema => {
                const allowed = allowsFieldSuperset(defaultSchemaPolicy, view, field, tolerantRoot);
                const out: FieldSchema = allowed ? root : field;
                return out;
            },
        };
    }

    /**
     * This shows basic usage of stored and view schema including adapters.
     */
    it("adapters", () => {
        // Build a schema repository.
        // This will represent our view schema for a simple canvas application,
        // same as the above example, but after some schema changes.
        const viewCollection: ViewSchemaCollection = {
            globalFieldSchema: new Map([[rootFieldKey, root]]),
            treeSchema: treeViewSchema,
        };

        // Register an adapter that handles a missing root.
        // Currently we are just declaring that such a handler exits:
        // the API for saying what to do in this case are not done.
        const adapters: Adapters = { fieldAdapters: new Map([
            [rootFieldKey, makeTolerantRootAdapter(viewCollection)],
        ]) };
        // Compose all the view information together.
        const view = new ViewSchema(defaultSchemaPolicy, adapters, viewCollection);

        // Like the "basic" example, start with an empty document:
        const stored = new TestSchemaRepository(defaultSchemaPolicy);
        assert(stored.tryUpdateFieldSchema(rootFieldKey, emptyField));

        // Open document, and check it's compatibility with our application:
        const compat = view.checkCompatibility(stored);

        // As long as we are willing to use adapters, the application should be able to read this document.
        assertEnumEqual(Compatibility, compat.read, Compatibility.RequiresAdapters);

        // And since the document schema currently excludes empty roots, its also incompatible for writing:
        assertEnumEqual(Compatibility, compat.write, Compatibility.Incompatible);

        // Additionally even updating the document schema can't avoid needing an adapter for the root,
        // since the new schema would be incompatible with possible existing document content (empty documents).
        assertEnumEqual(Compatibility, compat.writeAllowingStoredSchemaUpdates, Compatibility.RequiresAdapters);

        // Like with the basic example,
        // the app makes a choice here about its policy for if and when to update stored schema.
        // Lets assume eventually it updates the schema, either eagerly or lazily.

        // Update what schema we can (this will not update the root schema, since that would be incompatible).
        for (const [key, schema] of view.schema.globalFieldSchema) {
            // We expect the root update to fail, so asserting this fails
            // (root is the only global field in the view schema);
            assert(!stored.tryUpdateFieldSchema(key, schema));
        }
        // We can update the root to be optional:
        // TODO: add an automated way to determine that this is an upgrade that is needed and allowed.
        stored.tryUpdateFieldSchema(rootFieldKey, tolerantRoot);
        for (const [key, schema] of view.schema.treeSchema) {
            // All the tree schema in the view should be compatible with the stored schema,
            // so for this particular case we assert these all pass.
            assert(stored.tryUpdateTreeSchema(key, schema));
        }

        // That will cause the document stored schema to change,
        // which will notify and applications with the document open.
        // They can recheck their compatibility:
        const compatNew = view.checkCompatibility(stored);
        // We still need the adapter to handle empty documents.
        assertEnumEqual(Compatibility, compatNew.read, Compatibility.RequiresAdapters);
        // It is now possible to write our data into the document, since we have updated its stored schema.
        assertEnumEqual(Compatibility, compatNew.write, Compatibility.Compatible);
    });

    /**
     * Shows a schema update involving both cases:
     * 1. a type that gets a new identifier since its new format is not compatible with the old one.
     * 2. a type which is updated in place (same identifier)
     *
     * An adapter is used to allow the view schema (and thus application logic)
     * to not refer to the old types, and instead factor legacy schema handling into a library of adapters.
     */
    it("schema updating using adapters", () => {
        // In this version of the app,
        // we decided that text should be organized into a hierarchy of formatting ranges.
        // We are doing this schema change in an incompatible way, and thus introducing a new identifier:
        const formattedTextIdentifier: TreeSchemaIdentifier = brand("2cbc277e-8820-41ef-a3f4-0a00de8ef934");
        const formattedText = treeSchema({
            localFields: {
                content: fieldSchema(FieldKinds.sequence, [formattedTextIdentifier, codePoint.name]),
                size: fieldSchema(FieldKinds.value, [numberIdentifier]),
            },
            extraLocalFields: emptyField,
        });

        // We are also updating positionedCanvasItem to accept the new type.
        // It would also be possible to make this accept both types, and do this example without adapters,
        // but for this example we assume the application does not want to deal with the old text format,
        // so we will support it using adapters.
        // Were we not batching all these examples in one scope, this would reuse the `positionedCanvasItem` name
        // as no version of the app need both view schema at the same time
        // (except for some approaches for staging roll-outs which are not covered here).
        const positionedCanvasItemNew = treeSchema({
            localFields: {
                position: fieldSchema(FieldKinds.value, [pointIdentifier]),
                // Note that we are specifically excluding the old text here
                content: fieldSchema(FieldKinds.value, [formattedTextIdentifier]),
            },
            extraLocalFields: emptyField,
        });

        const viewCollection: ViewSchemaCollection = {
            globalFieldSchema: new Map([[rootFieldKey, root]]),
            treeSchema: new Map([
                // Reused Schema
                [canvasIdentifier, canvas],
                [numberIdentifier, number],
                [pointIdentifier, point],
                [codePoint.name, codePoint],
                // Updated Schema
                [positionedCanvasItemIdentifier, positionedCanvasItemNew],
                // New Schema
                [formattedTextIdentifier, formattedText],
                // Compatibility Schema for old documents:
                [textIdentifier, string],
            ]),
        };

        const textAdapter: TreeAdapter = { input: textIdentifier, output: formattedTextIdentifier };

        // Include adapters for all compatibility cases: empty root and old text.
        const rootAdapter: FieldAdapter = makeTolerantRootAdapter(viewCollection);
        const adapters: Adapters = { fieldAdapters: new Map([[rootFieldKey, rootAdapter]]), tree: [textAdapter] };

        const view = new ViewSchema(defaultSchemaPolicy, adapters, viewCollection);

        // Check this works for empty documents:
        {
            const stored = new TestSchemaRepository(defaultSchemaPolicy);
            assert(stored.tryUpdateFieldSchema(rootFieldKey, emptyField));
            const compat = view.checkCompatibility(stored);
            assert(compat.read === Compatibility.RequiresAdapters);
            assert(compat.writeAllowingStoredSchemaUpdates === Compatibility.RequiresAdapters);
        }

        // Check this works for documents with old text
        {
            const stored = new TestSchemaRepository(defaultSchemaPolicy);
            assert(stored.tryUpdateTreeSchema(canvasIdentifier, canvas));
            assert(stored.tryUpdateTreeSchema(numberIdentifier, number));
            assert(stored.tryUpdateTreeSchema(pointIdentifier, point));
            assert(stored.tryUpdateTreeSchema(positionedCanvasItemIdentifier, positionedCanvasItem));
            assert(stored.tryUpdateTreeSchema(textIdentifier, string));
            assert(stored.tryUpdateTreeSchema(codePoint.name, codePoint));
            // This is the root type produced by the adapter for the root.
            assert(stored.tryUpdateFieldSchema(rootFieldKey, tolerantRoot));

            const compat = view.checkCompatibility(stored);
            assertEnumEqual(Compatibility, compat.read, Compatibility.RequiresAdapters);
            // Writing requires schema updates and/or adapters.
            assertEnumEqual(Compatibility, compat.writeAllowingStoredSchemaUpdates, Compatibility.RequiresAdapters);

            // Note that if/when we update the stored schema for these changes,
            // the adapters are still required, since that will just permit the new types,
            // and don't exclude the old ones.
            // TODO: add an automated way to determine that this is the needed upgrade (some way to union schema?).
            const positionedCanvasItemTolerant = treeSchema({
                localFields: {
                    position: fieldSchema(FieldKinds.value, [pointIdentifier]),
                    // Note that we are specifically supporting both formats here.
                    content: fieldSchema(FieldKinds.value, [formattedTextIdentifier, textIdentifier]),
                },
                extraLocalFields: emptyField,
            });
            assert(stored.tryUpdateTreeSchema(positionedCanvasItemIdentifier, positionedCanvasItemTolerant));
            assert(stored.tryUpdateTreeSchema(formattedTextIdentifier, formattedText));

            const compatNew = view.checkCompatibility(stored);
            assertEnumEqual(Compatibility, compatNew.read, Compatibility.RequiresAdapters);
            // Now writing is possible:
            assertEnumEqual(Compatibility, compatNew.write, Compatibility.Compatible);
        }
    });
});
