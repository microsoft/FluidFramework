/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    IChannel,
    IChannelAttributes,
    IChannelFactory,
    IChannelServices,
    IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { ICheckout, TransactionResult } from "../checkout";
import {
    defaultSchemaPolicy,
    EditableTreeContext,
    ForestIndex,
    ObjectForest,
    SchemaIndex,
    sequenceChangeFamily,
    SequenceChangeFamily,
    SequenceChangeset,
    SequenceEditBuilder,
    UnwrappedEditableField,
    getEditableTreeContext,
    SchemaEditor,
} from "../feature-libraries";
import { IForestSubscription } from "../forest";
import { StoredSchemaRepository, InMemoryStoredSchemaRepository } from "../schema-stored";
import { Index, SharedTreeCore } from "../shared-tree-core";
import { Checkout as TransactionCheckout, runSynchronousTransaction } from "../transaction";
import { Anchor, AnchorLocator, AnchorSet, UpPath } from "../tree";

/**
 * Collaboratively editable tree distributed data-structure,
 * powered by {@link @fluidframework/shared-object-base#ISharedObject}.
 *
 * See [the README](../../README.md) for details.
 */
export interface ISharedTree extends ICheckout<SequenceEditBuilder>, ISharedObject, AnchorLocator {
    /**
     * Root field of the tree.
     *
     * Currently this editable tree's fields do not update on edits,
     * so holding onto this root object across edits will only work if its an unwrapped node.
     * TODO: Fix this issue.
     *
     * Currently any access to this view of the tree may allocate cursors and thus require
     * `context.prepareForEdit()` before editing can occur.
     * TODO: Make this happen automatically.
     */
    readonly root: UnwrappedEditableField;

    /**
     * Context for controlling the EditableTree nodes produced from {@link ISharedTree.root}.
     *
     * TODO: Exposing access to this should be unneeded once editing APIs are finished.
     */
    readonly context: EditableTreeContext;

    /**
     * Read and Write access for schema stored in the document.
     *
     * These APIs are temporary and will be replaced with different abstractions (View Schema based) in a different place later.
     *
     * TODO:
     * Editing of this should be moved into transactions with the rest of tree editing to they can be intermixed.
     * This will be done after the relations between branches and Indexes are figured out.
     *
     * TODO:
     * Public APIs for dealing with schema should be in terms of View Schema, and schema update policies.
     * The actual stored schema should be hidden (or ar least not be the most prominent way to interact with schema).
     *
     * TODO:
     * Something should ensure the document contents are always in schema.
     */
    readonly storedSchema: StoredSchemaRepository;
}

/**
 * Shared tree, configured with a good set of indexes and field kinds which will maintain compatibility over time.
 * TODO: node identifier index.
 *
 * TODO: detail compatibility requirements.
 * TODO: expose or implement Checkout.
 */
class SharedTree
    extends SharedTreeCore<SequenceChangeset, SequenceChangeFamily>
    implements ISharedTree
{
    public readonly context: EditableTreeContext;
    public readonly forest: IForestSubscription;
    public readonly storedSchema: SchemaEditor;
    /**
     * Rather than implementing TransactionCheckout, have a member that implements it.
     * This allows keeping the `IEditableForest` private.
     */
    private readonly transactionCheckout: TransactionCheckout<
        SequenceEditBuilder,
        SequenceChangeset
    >;

    public constructor(
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes,
        telemetryContextPrefix: string,
    ) {
        const anchors = new AnchorSet();
        const schema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy);
        const forest = new ObjectForest(schema, anchors);
        const indexes: Index<SequenceChangeset>[] = [
            new SchemaIndex(runtime, schema),
            new ForestIndex(runtime, forest),
        ];
        super(
            indexes,
            sequenceChangeFamily,
            anchors,
            id,
            runtime,
            attributes,
            telemetryContextPrefix,
        );

        this.forest = forest;
        this.storedSchema = new SchemaEditor(schema, (op) => this.submitLocalMessage(op));
        this.transactionCheckout = {
            forest,
            changeFamily: this.changeFamily,
            submitEdit: (edit) => this.submitEdit(edit),
        };

        this.context = getEditableTreeContext(forest);
    }

    public locate(anchor: Anchor): UpPath | undefined {
        assert(this.editManager.anchors !== undefined, 0x407 /* editManager must have anchors */);
        return this.editManager.anchors?.locate(anchor);
    }

    public get root(): UnwrappedEditableField {
        return this.context.root;
    }

    public runTransaction(
        transaction: (
            forest: IForestSubscription,
            editor: SequenceEditBuilder,
        ) => TransactionResult,
    ): TransactionResult {
        return runSynchronousTransaction(this.transactionCheckout, transaction);
    }

    /**
     * TODO: Shared tree needs a pattern for handling non-changeset operations.
     * Whatever pattern is adopted should probably also handle multiple versions of changeset operations.
     * A single top level enum listing all ops (including their different versions),
     * with at least fine grained enough detail to direct them to the correct subsystem would be a good approach.
     * The current use-case (with an op applying to a specific index) is a temporary hack,
     * and its not clear how it would fit into such a system if implemented in shared-tree-core:
     * maybe op dispatch is part of the shared-tree level?
     */
    protected processCore(
        message: ISequencedDocumentMessage,
        local: boolean,
        localOpMetadata: unknown,
    ) {
        if (!this.storedSchema.tryHandleOp(message)) {
            super.processCore(message, local, localOpMetadata);
        }
    }
}

/**
 * A channel factory that creates {@link ISharedTree}s.
 */
export class SharedTreeFactory implements IChannelFactory {
    public type: string = "SharedTree";

    public attributes: IChannelAttributes = {
        type: this.type,
        snapshotFormatVersion: "0.0.0",
        packageVersion: "0.0.0",
    };

    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        channelAttributes: Readonly<IChannelAttributes>,
    ): Promise<IChannel> {
        const tree = new SharedTree(id, runtime, channelAttributes, "SharedTree");
        await tree.load(services);
        return tree;
    }

    public create(runtime: IFluidDataStoreRuntime, id: string): ISharedTree {
        const tree = new SharedTree(id, runtime, this.attributes, "SharedTree");
        tree.initializeLocal();
        return tree;
    }
}
