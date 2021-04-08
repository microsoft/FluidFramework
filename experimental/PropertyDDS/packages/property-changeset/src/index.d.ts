declare module "@fluid-experimental/property-changeset" {

    // The plain serialization data structure used to encode a ChangeSet.
    type SerializedChangeSet = any; // TODO

    type ApplyChangeSetOptions = {
        applyAfterMetaInformation?: object; // Additional meta information which help later to obtain
                                            // more compact changeset during the apply operation
        rebaseMetaInformation?: object;
    }

    /**
   * Different types of conflicts that can occur during a rebase operation
   */
    enum ConflictType {
        INVALID_CHANGESET_BASE, // We had two incompatible ChangeSets, they probably were with respect to different base commits
        COLLIDING_SET, // A value was changed in both ChangeSets
        ENTRY_MODIFIED_AFTER_REMOVE, // A deleted child node was modified
        ENTRY_MODIFICATION_AFTER_REMOVE_INSERT, // A child was modified after it had been removed and added.
        //
        // The modification can no longer be applied, since the affected object has changed and thus
        // the ChangeSet is no longer compatible.
        INSERTED_ENTRY_WITH_SAME_KEY, // An entry with the same key was inserted into the collection
        REMOVE_AFTER_MODIFY, // A property was removed after a modify, this should mostly be safe, be we report it for completeness sake
        MISMATCH_TEMPLATES,
        INSERT_IN_REMOVED_RANGE,
    }

    class ChangeSet {
        /**
         * The ChangeSet represents an operation to be done (or that was done) on the data. It encapsulate one or
         * many addition/insertion and deletion of properties. The ChangeSetObject also provides functionality
         * to merge and swap change sets.
         */
        constructor(in_change: ChangeSet | SerializedChangeSet | String);
        /**
         * Creates a string representation of the change set
         */
        toString(): string;
        /**
         * Returns the serialized changes.
         */
        getSerializedChangeSet(): SerializedChangeSet;
        /**
         * Indicates whether this is a normalized ChangeSet. If this is set to true, squashes will not remove empty entries
         * from the ChangeSet.
         */
        setIsNormalized(in_isNormalized: Boolean): void;
        /**
         * Indicates whether this is a normalized ChangeSet. If this is set to true, squashes will not remove empty entries
         * from the ChangeSet.
         */
        getIsNormalized(): Boolean;
        /**
         * Clones the ChangeSet
         */
        clone(): ChangeSet;
        /**
         * Updates this ChangeSet. The result will be the concatenation of the two ChangeSets. First the changes in this
         * ChangeSet are executed, then the changes in the supplied in_changeSet are applied. The result will be
         * stored in this ChangeSet. This function assumes that the second ChangeSet is relative to the state after
         * application of the first ChangeSet.
         * @param in_changeSet The changeset to apply
         * @param in_options Optional additional parameters
         */
        applyChangeSet(in_changeSet: ChangeSet | SerializedChangeSet, in_options?: ApplyChangeSetOptions): void;

        /**
         * Helper function which checks whether a given serialized changeSet is an empty changeSet.
         */
        static isEmptyChangeSet(in_changeSet: SerializedChangeSet): boolean;
        /**
         * Checks whether the given key from a ChangeSet is not a typeid, but one of the
         * reserved keywords.
         */
        static isReservedKeyword(): Boolean;

        _toInverseChangeSet(): void;

        _toReversibleChangeSet(in_oldSerializedState: SerializedChangeSet);

        _rebaseChangeSet(io_changeSet: SerializedChangeSet, out_conflicts: ConflictInfo[], in_options?: RebaseChangeSetOptions): SerializedChangeSet;

        static ConflictType: ConflictType;

    }

    type RebaseChangeSetOptions = {
        applyAfterMetaInformation?:  object,
        throwOnTemplateMismatch?: Boolean
        rebaseMetaInformation?: object
    }
    type ConflictInfo = {
        path?: String
        type: ConflictType,
        conflictingChange?: SerializedChangeSet
    }


    class Utils {
        /**
         * Utils
         */
        constructor();
        /**
         * Traverses a ChangeSet recursively and invokes either a pre- or a post-order callback for each visited property.
         *
         * At least one of the pre- or post-order callbacks must be specified. Both may be specified as well.
         * @param in_changeSet The ChangeSet to process
         * @param in_params An
         *     object containing optional parameters.
         * @param in_finalizer A callback when traversal is completed
         */
        traverseChangeSetRecursively(in_changeSet: SerializedChangeSet, in_params: TraveChangeSetRecursivelyParameters, in_finalizer?: Function): void;
        /**
         * Extracts all typeIds from the given ChangeSet
         */
        extractTypeids(): Array<string>;
        /**
         * Enumerates all template from a given ChangeSet
         */
        enumerateSchemas(): Array<object>;
        /**
         * Searches through a ChangeSet and returns all Changes to a properties with a given typeid
         */
        getChangesByType(): object;
        /**
         * Filter the serialized ChangeSet returning a subset of serialized ChangeSet which has been performed
         * on the given path. Returns an empty serialized ChangeSet if the path has not been affected.
         */
        getChangesByPath(): object;
        /**
         * Invoke a callback for all nested ChangeSets that correspond to a set of user supplied tokenized paths.
         * @param in_paths An object which contains the tokenized paths as nested objects. Common path segment are thus shared.
         *       For example, an object representing these three paths:
         *       'entry1'
         *       'nested.entry2'
         *       'nested.entry3'
         *
         *       would look like this:
         *       {
         *         entry: {},
         *         nested: {
         *           entry2: {}
         *           entry3: {}
         *         }
         *       }
         *
         *       The object under the path, will be provided to the callback. If you have to pass additional data
         *       to the callback, you can add private data by prefixing it with __ and setting in_escapeLeadingDoubleUnderscore
         *       to true.
         * @param in_changeSet The ChangeSet to process
         * @param in_callback The function to invoke at the registered paths (it is called both for the interior and the leaf nodes)
         * @param in_options -
         */
        getChangesToTokenizedPaths(in_paths: object, in_changeSet: SerializedChangeSet, in_callback: Function, in_options?: GetChangesToTokenizedPathsOptions): void;
        /**
         * Filter change sets by paths.
         * Given a change set, this function will filter it based on a series of paths.
         * The final ChangeSet will only include the paths in question starting from the root of
         * the ChangeSet.
         * For Example,
         *   Given the following change set
         *      'insert': {
         *        'String': {
         *          'string1': 'hello',
         *          'string2': 'world
         *        }
         *      }
         *   And the path
         *     ['string1']
         *   the resulting ChangeSet will be
         *     'insert': {
         *       'String': {
         *         'string1': 'hello'
         *       }
         *     }
         *
         * NOTE: Paths that traverse through sets and arrays are not supported.
         */
        static getFilteredChangeSetByPaths(in_changeSet: SerializedChangeSet, in_paths: string[] | TokenizedPath): SerializedChangeSet;
        /**
         * Extract all paths from the ChangeSet in a flattened list and include the operations and typeid information.
         * NOTE: The paths returned also include the parent. i.e. the path 'nodeProp.subproperty' will result in
         * {
         *   nodeProp: {
         *    operation: 'modify',
         *    typeid: { typeid: 'NodeProperty', context: 'single', isEnum: false }
         *   },
         *   nodeProp.subProperty: {
         *    operation: 'insert',
         *    typeid: { typeid: 'Float32', context: 'single', isEnum: false }
         *   }
         * }
         * @param in_changeSet The changeset to extract paths from
         * @param in_options Set of options
         */
        extractPathsFromChangeSet(in_changeSet: SerializedChangeSet, in_options?: ExtractPathsFromChangeSetOptions): object;

    }
    type TokenizedPath = Map<String, TokenizedPath>
    class TraversalContext {
        /**
         * Provides traversal information when parsing ChangeSets via the traverseChangeSetRecursively function.
         */
        constructor();

    }

    type ExtractPathsFromChangeSetOptions = {
        includeOperation?: boolean; // Flag to include the operation
        includeTypeidInfo?: boolean; // Flag to include the typeid info
    }

    type GetChangesToTokenizedPathsOptions = {
        rootOperation: string; // The operation that has been applied to the root of the ChangeSet (either 'insert' or 'modify')
        rootTypeid: string; // The full type of the root Property of the ChangeSet
        escapeLeadingDoubleUnderscore: Boolean; // If this is set to true, keys which start with '__' will be escaped (by adding an additional '_') before the
        //     lookup into the paths map. This frees the keyspace with duplicated underscores for the use by the calling
        //     application.
    }

    type TraveChangeSetRecursivelyParameters = {
        preCallback?: Function; // The
        //   (pre-order) callback function that is invoked for each property
        postCallback?: Function; // The
        //   (post-order) callback function that is invoked for each property
        userData?: any; // An
        //   optional object that is passed to all invocations of the callback via the
        //   context object that can be used to accumulate data.
        rootOperation?: string; // The operation that has been applied to
        //                                                                           the root of the ChangeSet (either
        //                                                                           'insert' or 'modify')
        rootTypeid?: string; // The full typeid for the Property at the
        //                                                                           root of the ChangeSet
    }

    /**
     * Token Types
     */
    type TOKEN_TYPES_TYPE = number;

    interface TOKEN_TYPES_ENUM {
        PATH_SEGMENT_TOKEN: number; // A normal path segment, separated via .
        ARRAY_TOKEN: number; // An array path segment, separated via [ ]
        PATH_ROOT_TOKEN: number; // A / at the beginning of the path
        DEREFERENCE_TOKEN: number; // A * that indicates a dereferencing operation
        RAISE_LEVEL_TOKEN: number; // A ../ that indicates one step above the current path
    }

    const PathHelper: {
        /**
         * Tokenizes a path string
         */
        tokenizePathString(path: string, out_types?: any): Array<string>;
        /**
         * Creates a quoted string for a path seqment to make sure it parses correctly
         */
        quotePathSegment(): string;
        /**
         * Adds quotation marks to a path string if they are needed
         */
        quotePathSegmentIfNeeded(): string;
        /**
         * This function checks, whether the supplied path is a valid repository absolute path.
         *
         * It has to be either an empty string, or a path starting with a /
         */
        checkValidRepositoryAbsolutePath(): void;
        TOKEN_TYPES: TOKEN_TYPES_TYPE;
    }

    const TypeIdHelper: {
        createSerializationTypeId(typeid: string, context: string, hasEnumTag: boolean): string,
        extractContext(typeid: string): any,
        extractReferenceTargetTypeIdFromReference(typeid: string): string,
        extractTypeId(typeid: string): string,
        extractVersion(param: string): any,
        isPrimitiveType(typeid: string): boolean,
        isReferenceTypeId(typeid: string): boolean,
        isReservedType(typeid: string): boolean,
        isSchemaTypeid(param: string): boolean,
        isTemplateTypeid(param: string): boolean
    }

    /**
        * Iterator types
        */
    type types_TYPE = number;
    interface types_ENUM {
        INSERT: number;
        REMOVE: number;
        MODIFY: number;
        MOVE: number;
        NOP: number;
    }

    class ArrayChangeSetIterator {
        /**
         * Iterator class which iterates over an array ChangeSet. It will successively return the operations ordered by their
         * position within the array. Additionally, it will keep track of the modifications to the array indices caused
         * by the previous operations.
         */
        constructor();
        /**
         * Returns the next operation in the ChangeSet
         */
        next(): boolean;
        atEnd(): boolean;
        static types: types_ENUM;

      }
}

