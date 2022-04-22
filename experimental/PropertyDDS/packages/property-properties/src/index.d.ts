/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@fluid-experimental/property-properties" {
    import { ChangeSet, SerializedChangeSet } from "@fluid-experimental/property-changeset"
    namespace PROPERTY_TREE_NS {
        class EventEmitter {
            static defaultMaxListeners: number;
            emit(type: string): boolean;
            addListener(type: string, listener: (...args: any[]) => any): EventEmitter;
            static listenerCount(emitter: EventEmitter, type: string): number;
            listenerCount(type: string): number;
            listeners(type: string): (...args: any[]) => any[];
            static makeEventEmitter(constructor: (...args: any[]) => any): (...args: any[]) => any;
            off(type: string, listener: (...args: any[]) => any): EventEmitter;
            on(type: string, listener: (...args: any[]) => any): EventEmitter;
            once(type: string, listener: (...args: any[]) => any): EventEmitter;
            register(event: string, cb: (...args: any[]) => any): string;
            removeAllListeners(type: string): EventEmitter;
            removeListener(type: string, listener: (...args: any[]) => any): EventEmitter;
            setMaxListeners(n: number): EventEmitter;
            trigger(event: string, caller: object, argsArr?: any): void;
            unregister(event: string, key: string): boolean;
        }

        /**
         * The range combinations of two change sets (A and B)
         * This can either be complete operations, parts of complete operations or overlapping segments
         */
        type ArrayChangeSetRangeType_TYPE = number;
        /**
         * Used to set the synchronization mode of the Workspace.
         */
        type SYNC_MODE_TYPE = number;
        interface SYNC_MODE_ENUM {
            MANUAL: number; // Application needs to update and push manually. Commit is local in this mode.
            PUSH: number; // Workspace automatically pushes local commits to the server
            PULL: number; // Workspace automatically pulls remote changes without pushing its changes back
            SYNCHRONIZE: number; // Workspace updates and pushes automatically (default)
        }
        /**
         * Used to control the invocation of the rebase callback
         */
        type REBASE_CALLBACK_NOTIFICATION_MODES_TYPE = number;
        interface REBASE_CALLBACK_NOTIFICATION_MODES_ENUM {
            ALWAYS: number; // Always invoke the rebase
            // callback
            CONFLICTS_ONLY: number; // Only invoke the rebase callback when a conflict occurs
        }
        /**
         * Used to Set the server side conflict handling mode on each commit.
         */
        type SERVER_AUTO_REBASE_MODES_TYPE = number;
        interface SERVER_AUTO_REBASE_MODES_ENUM {
            NONE: number; // Server rejects all commits that are not based on top of the latest state.
            // The conflict handler is always called. (default)
            INDEPENDENT_PROPERTIES: number; // Server rebases only when paths within change sets are non-colliding.
            // The conflict handler is called only when two change sets operate on the same paths.
            // Server does not resolve any conflicts.
        }
        /**
         * Determines in which cases a reference will automatically be resolved
         */
        type REFERENCE_RESOLUTION_TYPE = number;
        interface REFERENCE_RESOLUTION_ENUM {
            ALWAYS: number; // The resolution will always automatically follow references
            NO_LEAFS: number; // If a reference is the last entry during the path resolution, it will not automatically be resolved
            NEVER: number; // References are never automatically resolved
        }
        /**
         * Used to indicate the state of a property. These flags can be connected via OR.
         */
        type MODIFIED_STATE_FLAGS_TYPE = number;
        interface MODIFIED_STATE_FLAGS_ENUM {
            CLEAN: number; // No changes to this property at the moment
            PENDING_CHANGE: number; // The property is marked as changed in the currently pending ChangeSet
            DIRTY: number; // The property has been modified and the result has not yet been reported to the application for scene updates
        }
        /**
         * Binary Property States.
         */
        type BINARY_PROPERTY_STATUS_TYPE = number;
        interface BINARY_PROPERTY_STATUS_ENUM {
            NEW: number;
            INITIALIZED: number;
            ATTACHING: number;
            ATTACHED: number;
            ATTACH_FAILED: number;
            DELETING: number;
            DELETED: number;
            DELETE_FAILED: number;
            EXPIRED: number;
            PREPARED: number;
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
        /**
         * The state of this repository reference
         */
        type STATE_TYPE = number;
        interface STATE_ENUM {
            EMPTY: number; // The reference does not point to any other repository
            LOADING: number; // The reference is currently loading the referenced repository
            AVAILABLE: number; // The referenced repository has successfully been loaded and is available
            FAILED: number; // Loading the referenced repository has failed
        }

        /**
         * Repository states code
         */
        type RepositoryState_TYPE = number;
        interface RepositoryState_ENUM {
            INIT: number;
            LOADING: number;
            LOADED: number;
            UPDATING: number;
            EDITING: number;
            SAVING: number;
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
        /**
         * Token Types
         */
        type PATH_TOKENS_TYPE = number;
        interface PATH_TOKENS_ENUM {
            ROOT: number; // A / at the beginning of the path
            REF: number; // A * that indicates a dereferencing operation
            UP: number; // A ../ that indicates one step above the current path
        }

        type PropertyTemplateType = {
            id?: string; // id of the property
            name?: string; // Name of the property
            typeid: string; // The type identifier
            length?: number; // The length of the property. Only valid if
            //   the property is an array, otherwise the length defaults to 1
            context?: string; // The type of property this template represents
            //   i.e. array, hash, etc.
            properties?: Array<object>; // List of property templates that
            //   are used to define children properties
            constants?: Array<object>; // List of property templates that
            //   are used to define constant properties and their values
            inherits?: Array<string> | string; // List of property template typeids that this
            //   PropertyTemplate inherits from
            annotation?: { [key: string]: string };
        }
        type ArrayProperty_ArrayProperty_in_params_TYPE = {
            length: number; // the length of the array, if applicable
        }
        type BaseProperty_BaseProperty_in_params_TYPE = {
            id: string; // id of the property
            typeid: string; // The type unique identifier
            length: number; // The length of the property. Only valid if
            //   the property is an array, otherwise the length defaults to 1
            context: string; // The type of property this template represents
            //   i.e. single, array, map, set.
            properties: Array<object>; // List of property templates that
            //   are used to define children properties -- UNUSED PARAMETER ??
            inherits: Array<string>; // List of property template typeids that this
            //   PropertyTemplate inherits from -- UNUSED PARAMETER ??
        }
        type BinaryProperty_BinaryProperty_in_params_TYPE = {
            typeid: string; // Type Id (nothing for BinaryProperty)
        }
        type ContainerProperty_ContainerProperty_in_params_TYPE = {
            dataObj: object; // optional argument containing an object
            //                  that should be used as the backing store of this value
            //                  property
            dataId: object; // optional argument must be provided when
            //                  in_params.dataObj is passed. Must contain a valid member
            //                  name of dataObj. This member will be used to set/get
            //                  values of this value property
        }
        type EnumArrayProperty_EnumArrayProperty_in_params_TYPE = {
            length: number; // the length of the array, if applicable
            _enumDictionary: object; // the value<->enum dictonary needed to convert the values
        }
        type NamedNodeProperty_NamedNodeProperty_in_params_TYPE = {
            id: string; // id of the property (null, if the GUID should be used for the ID)
            typeid: string; // The type identifier
        }
        type NamedProperty_NamedProperty_in_params_TYPE = {
            id: string; // id of the property (null, if the GUID should be used for the ID)
            typeid: string; // The type identifier
        }
        type RepositoryReferenceProperty_RepositoryReferenceProperty_in_params_TYPE = {
            id: string; // id of the property
            name: string; // Name of the property
            typeid: string; // The type identifier
        }
        type ValueProperty_ValueProperty_in_params_TYPE = {
            dataObj: object; // optional argument containing an object
            //                  that should be used as the backing store of this value
            //                  property
            dataId: object; // optional argument must be provided when
            //                  in_params.dataObj is passed. Must contain a valid member
            //                  name of dataObj. This member will be used to set/get
            //                  values of this value property
        }
        type ScopeProperty_ScopeProperty_in_params_TYPE = {
            scope: string; // The scope to keep track of
        }
        type Repository_Repository_in_params_TYPE = {
            name: string; // the name of this repository.
            creatorId: string; // The oxygen user ID of the person who creates the repository
            guid: string; // the guid of the repository
            commitCacheSize: number; // the size of the cache for old commits
        }
        type BranchNode_BranchNode_in_params_TYPE = {
            guid: string; // The guid of the branch
            name: string; // The name of the branch. Will default to the guid.
        }
        type PropertyFactory_create_in_options_TYPE = {
            workspace: Workspace; // A checked out workspace to check against. If supplied,
            //  the function will check against the schemas that have been registered within the workspace
        }
        type PropertyFactory_inheritsFrom_in_options_TYPE = {
            includeSelf?: boolean; // Also return true if in_templateTypeid === in_baseTypeid
            workspace?: Workspace; // A checked out workspace to check against. If supplied,
            //  the function will check against the schemas that have been registered within the workspace
        }
        type PropertyFactory_getAllParentsForTemplate_in_options_TYPE = {
            includeBaseProperty?: boolean; // Include BaseProperty as parent.
            //                                                   Everything implicitly inherits
            //                                                   from BaseProperty, but it is not explicitly listed in the
            //                                                   template, so it is only included if explicitly requested
            workspace?: Workspace; // A checked out workspace to check against. If supplied,
            //  the function will check against the schemas that have been registered within the workspace
        }
        type getBearerTokenFn = (...arg: any[]) => any; // TODO
        type PropertyFactory_initializeSchemaStore_in_options_TYPE = {
            getBearerToken: getBearerTokenFn; // Function that accepts a callback.
            //     Function that should be called with an error or the OAuth2 bearer token representing the user.
            url: string; // The root of the url used in the request to retrieve PropertySet schemas.
        }
        type Workspace_initialize_in_options_TYPE = {
            urn?: string; // The urn of the branch or commit to load
            metadata?: { // The branch metadata
                name?: string,
                guid?: string,
            };
            local?: boolean; // Flag used work locally
            paths?: string[]; // List of paths to checkout.
            //  NOTE: the workspace will ONLY load the given paths and will only receive changes on these paths from the server.
        }
        type Workspace_branch_in_options_TYPE = {
            metadata?: { // The branch metadata
                name?: string
            };
            local?: boolean; // Flag used to create a local branch
        }
        type Workspace_commit_in_options_TYPE = {
            headers?: object; // Objects to be appended as headers in the request
            local?: boolean; // Flag used to create a local commit
            metadata?: object; // Object containing the commit meta data
            mergeInfo?: object; // The merge info (if commit is based on a merge operation)
            allowEmptyChangeset?: boolean; // Allow the commit even if changeSet is empty
        }
        type Workspace_rebase_in_options_TYPE = {
            push?: boolean; // Flag used to indicate that any local commits that have been rebased
            //                                      onto the new commit will not be pushed to the the server.
            squash?: boolean; // Flag used to squash the commits during the rebase.
            metadata?: object; // Metadata that can be attached to a squashed rebase.
        }
        type Workspace_revertTo_in_options_TYPE = {
            /**
             * Only reverts the changes to properties and sub properties
             * of the passed in paths. Default is revert all.
             */
            paths: string[];
        }
        type Workspace_setRebaseCallback_in_options_TYPE = {
            notificationMode?: number; // Mode controlling the invocation of the rebase callback
            //  (default = ALWAYS)
        }
        type Workspace_checkout_in_options_TYPE = {
            paths: string[]; // List of paths to checkout.
            //  NOTE: the workspace will ONLY load the given paths and will only receive changes on these paths from the server.
        }
        type Workspace_resolvePath_in_options_TYPE = {
            referenceResolutionMode: REFERENCE_RESOLUTION_TYPE; // How should this function behave during reference resolution?
        }
        type Workspace_get_in_options_TYPE = {
            referenceResolutionMode: REFERENCE_RESOLUTION_TYPE; // How should this function behave during reference resolution?
        }
        type ArrayProperty_get_in_options_TYPE = {
            referenceResolutionMode: REFERENCE_RESOLUTION_TYPE; // How should this function behave during reference resolution?
        }
        type BaseProperty_serialize_in_options_TYPE = {
            dirtyOnly?: boolean; // Only include dirty entries in the serialization
            includeRootTypeid?: boolean; // Include the typeid of the root of the hierarchy
            dirtinessType?: MODIFIED_STATE_FLAGS_TYPE; // The type of dirtiness to use when reporting dirty changes.
            includeReferencedRepositories?: boolean; // If this is set to true, the serialize
            //     function will descend into referenced repositories. WARNING: if there are loops in the references
            //     this can result in an infinite loop
        }
        type Datastore = any; // TODO
        type DataSource = any; // TODO
        type BinaryProperty_initialize_in_params_TYPE = {
            datastore: Datastore; // Datastore for storing data.
            dataSource: DataSource; // DataSource to read or write to.
        }
        type ContainerProperty_get_in_options_TYPE = {
            referenceResolutionMode: REFERENCE_RESOLUTION_TYPE; // How should this function behave during reference resolution?
        }
        type ContainerProperty_getValue_in_options_TYPE = {
            referenceResolutionMode: REFERENCE_RESOLUTION_TYPE; // How should this function behave during reference resolution?
        }
        type ContainerProperty_resolvePath_in_options_TYPE = {
            referenceResolutionMode: REFERENCE_RESOLUTION_TYPE; // How should this function behave during reference resolution?
        }
        type ReferenceProperty_get_in_options_TYPE = {
            referenceResolutionMode: REFERENCE_RESOLUTION_TYPE; // How should this function behave during reference resolution?
        }
        type ReferenceProperty_resolvePath_in_options_TYPE = {
            referenceResolutionMode: REFERENCE_RESOLUTION_TYPE; // How should this function behave during reference resolution?
        }
        type CoarsePermission = 'read' | 'write' | 'delete';
        type RepositoryPermission = 'repository.read' | 'repository.write' | 'repository.delete' | 'repository.share';
        type BranchPermission = 'branch.read' | 'branch.write' | 'branch.delete' | 'branch.share';
        type PropertyPermission = 'property.read' | 'property.insert' | 'property.modify' | 'property.remove' | 'property.share';
        type Permission = RepositoryPermission | BranchPermission | PropertyPermission | CoarsePermission;
        type Repository_getBranchNodes_in_options_TYPE = {
            array: boolean; // Flag used to control the return
            //  type of the function. If set to true, the return value will be an Array
        }
        type Repository__branch_in_branchMetaData_TYPE = {
            name: string; // The human readable name of the branch.
            //  If not specified, it defaults to the guid.
            guid: string; // The guid of the branch. If not specified, a guid will be generated
        }
        type Repository__branch_in_options_TYPE = {
            trackRemoteBranch: boolean; // Flag to track the remote branch.
            //  NOTE: This results in a BranchNode (remote) to be created and linked to the new BranchNode (local)
        }
        type Repository__rebase_in_options_TYPE = {
            rebaseCallback: Function; // A callback that is invoked to perform the rebase operation. It will be invoked separately for each commit that
            //     is rebased, and then finally again for the pending changes if applicable. The function indicates via its
            //     return value, whether the rebase was successful. If true is returned the rebase will continue, if false is
            //     returned, it will be aborted (and no changes will occur). Furthermore, the function can modify the ChangeSet
            //     in the parameter transformedChangeSet to adapt the changes to the changes in the onto-branch.
            //
            //     It will be passed an Object with these members:
            //     * {SerializedChangeSet}  transformedChangeSet - The ChangeSet that resulted from performing the
            //                                                                   rebase operation on the primitive types and
            //                                                                   collections. This ChangeSet can be modified
            //                                                                   to adapt the changes to the changes in the
            //                                                                   onto-branch.
            //     * {SerializedChangeSet}  originalChangeSet    - The original ChangeSet before the rebase
            //     * {SerializedChangeSet}  ontoBranchChangeSet  - The changes between the common parent commit and
            //                                                                   the tip of the onto branch
            //     * {SerializedChangeSet}  [currentState]       - The normalized ChangeSet for the whole repository
            //                                                                   before the application of the
            //                                                                   transformedChangeSet. It will only be supplied
            //                                                                   when in_options.trackState===true, since
            //                                                                   computing this state can be expensive.
            //     * {Array.<ConflictInfo>} conflicts            - List with the conflicts that occurred during the
            //                                                                   rebase
            //     * {CommitNode} [commitNode]        - The commit node that is rebased. This is
            //                                                                   undefined, when the pending changes are rebased
            //     * {CommitNode} commonParentCommitNode - The commit node of the common parent
            squash: boolean; // Flag used to squash the commits during the rebase.
            metadata: object; // Metadata that can be attached to a squashed rebase.
            trackState: boolean; // Enable tracking of the normalized ChangeSet during the rebase operation. This can be disabled, since the
            //     computation of the normalized ChangeSet incurs additional costs and should only be done when it is needed
            //     by the rebase function.
        }
        type RepositoryStore_createRemoteRepository_in_params_TYPE = {
            changeSet: object; // The flattened change set to
            //                                        be set as the root commit.

            // The repository object parameter
            // Includes the guid of the repository plus all metadata
            repository: {
                guid: string,
                creatorId?: string
            };
            rootCommit: { // The root commit object to add to the Repository
                guid: string
            };
        }
        type RepositoryStore_addCommitNode_in_params_TYPE = {
            commit: object | undefined; // object describing a commit
            commits: Array<object> | undefined; // Array of objects describing the individual commits
            //  within a batch. NOTE: If this parameter is not specified then "commit" param must be specified
            changeSet: ChangeSet; // ChangeSet coupled with the commit object
            branch: { // The branch information
                guid: string
            };
        }
        type RepositoryStore_updateRepository_in_params_TYPE = {
            commits: Array<object>; // The list of commit objects
            //                                           Includes the guid of the commit plus all metadata
            branch: object; // The branch object parameter
            //                                  Includes the guid of the branch plus all metadata
            flatten: boolean; // flag used to indicate that the commit history is flattened
            //                                    This flag is generally set to true when loading a branch that doesn't
            //                                    exist locally. Defaults to false.
        }
        type EnumArrayProperty_get_in_options_TYPE = {
            referenceResolutionMode: REFERENCE_RESOLUTION_TYPE; // How should this function behave during reference resolution?
        }
        type ValueArrayProperty_get_in_options_TYPE = {
            referenceResolutionMode: REFERENCE_RESOLUTION_TYPE; // How should this function behave during reference resolution?
        }


        type NamedProperty_share_permission_TYPE = {
            userIds: Array<string>; // The user ids which will get permissions assigned
            groupIds?: Array<string>; // The user group ids which will get permissions assigned
            serviceIds?: Array<string>; // The service ids which will get permissions assigned
            actions: PropertyPermission[]; // The actions to grant to the subject on the property
        }
        type NamedProperty_share_options_TYPE = {
            synchronous?: boolean; // whether the share sould be sent to the PropertyTree immediatly or on next sync
            noInherit?: boolean; // Optional flag to set noInherit on the property
        }
        type NamedProperty_unshare_permission_TYPE = {
            userIds: Array<string>; // The user ids which will get permissions assigned
            groupIds?: Array<string>; // The user group ids which will get permissions assigned
            serviceIds?: Array<string>; // The service ids which will get permissions assigned
            actions: PropertyPermission[]; // The actions to grant to the subject on the property
        }
        type NamedProperty_unshare_options_TYPE = {
            synchronous?: boolean; // whether the share sould be sent to the PropertyTree immediatly or on next sync
        }
        type BranchIdentifier = any; // TODO
        type CommitOrBranchIdentifier = any; // TODO
        type RootProperty = any; // TODO
        type ExpiryTimeType = 'transient' | 'temporary' | 'persistent' | number;

        /** TODO
         * apply a range's operation to the rebased changeset
         * @param in_segment to be applied
         * @param io_changeset target
         * @param in_currentIndexOffset current offset
         * @param out_conflicts A list of paths that resulted in conflicts together with the type of the conflict
         * @param in_basePath Base path to get to the property processed by this function
         * @param in_isPrimitiveType is it an array of primitive types
         * @param in_options Optional additional parameters
         */



        class PropertyError {

        }

        class PropertyFactoryError {

        }

        class RepositoryError {

        }

        class ServerError {

        }

        class ChangeSetError {

        }

        class UtilsError {

        }

        class PssClientError {

        }

        class JSONSchemaToPropertySetsTemplateConverter {
            /**
             * Recursively parses the given JSON Schema and returns the corresponding
             * array of PropertySets Templates.
             */
            getPropertySetsTemplates(): Array<object>;
            /**
             * Returns the absolute document URI of the given definition.
             *
             * A definition can modify the document URI for its sub-definitions if its id
             * is an absolute URI for example or if it specifies a new relative URI.
             */
            getDefinitionDocPath(): string;
            /**
             * Returns an absolute defintion id based on an absolute document path and a definition id.
             *
             * The absolute id of a definition depends on the current document path if the id
             * of the definition is not itself an absolute path.
             */
            getDefinitionAbsoluteId(): string;
            /**
             * Recursively parses the object refered by the given reference ('$ref').
             *
             * If the refered object is an individual Property Sets Template, just add a
             * reference to it. Otherwise expands the refered object in place.
             */
            parseSchemaReference(): object;
            /**
             * Recursively parses the given properties ('properties': {...}) and adds them
             * to 'out_props' argument.
             */
            parseSchemaProperties(): void;
            /**
             * Recursively parses the given oneOf array ('oneOf': [...]) and adds the properties
             * to 'out_props' argument.
             *
             * TODO: Support arrays of more than one element.
             */
            parseSchemaOneOf(): void;
            /**
             * Recursively parses the given allOf array ('allOf': [...]) and adds the properties
             * to 'out_props' argument.
             */
            parseSchemaAllOf(): void;
            /**
             * Adds the given PropertySets Template to the generated templates if not already there.
             */
            addToTemplates(): void;
            /**
             * Recursively parses the given definition and returns it.
             */
            parseSchemaDefinition(): object;
            /**
             * Recursively indexes the definitions of the schema.
             */
            indexSchemaDefinitions(): void;

        }



        class ContainerProperty extends BaseProperty {
            /**
             * This class serves as a view to read, write and listen to changes in an
             * object's value field. To do this we simply keep a pointer to the object and
             * its associated data field that we are interested in. If no data field is
             * present this property will fail constructing.
             * @param in_params the parameters
             */
            constructor(in_params: ContainerProperty_ContainerProperty_in_params_TYPE);
            /**
             * Returns the sub-property having the given name, or following the given paths, in this property.
             * @param in_ids the ID or IDs of the property or an array of IDs
             *       if an array is passed, the .get function will be performed on each id in sequence
             *       for example .get(['position','x']) is equivalent to .get('position').get('x').
             *       If .get resolves to a ReferenceProperty, it will, by default, return the property that the
             *       ReferenceProperty refers to.
             * @param in_options parameter object
             */
            get<T = BaseProperty>(in_ids?: string | number | Array<string | number>, in_options?: ContainerProperty_get_in_options_TYPE): T | undefined;
            /**
             * returns the value of a sub-property
             * This is a shortcut for .get(in_ids, in_options).getValue()
             * @param in_ids the ID or IDs of the property or an array of IDs
             *       if an array is passed, the .get function will be performed on each id in sequence
             *       for example .getValue(['position','x']) is equivalent to .get('position').get('x').getValue().
             *       If at any point .get resolves to a ReferenceProperty, it will, by default, return the property that the
             *       ReferenceProperty refers to.
             * @param in_options parameter object
             */
            getValue<T>(in_ids?: string | number | Array<string | number>, in_options?: ContainerProperty_getValue_in_options_TYPE): T;
            /**
             * Get all sub-properties of the current property.
             * Caller MUST NOT modify the properties.
             * If entries include References, it will return the reference (will not automatically resolve the reference)
             */
            getEntriesReadOnly(): { [key: string]: BaseProperty };
            /**
             * Returns the name of all the sub-properties of this property.
             */
            getIds(): Array<string>;
            /**
             * Returns an object with all the nested values contained in this property
             */
            getValues<T>(): T;
            /**
             * Checks whether a property with the given name exists
             */
            has(in_id: string): boolean;
            /**
             * Expand a path returning the property or value at the end.
             * @param in_path the path
             * @param in_options parameter object
             */
            resolvePath<T = BaseProperty>(in_path: string, in_options?: ContainerProperty_resolvePath_in_options_TYPE): T | undefined;
            /**
             * Given an object that mirrors a PSet Template, assigns the properties to the values
             * found in that object.
             * eg.
             * <pre>
             * Templates = {
             *   properties: [
             *     { id: 'foo', typeid: 'String' },
             *     { id: 'bar', properties: [{id: 'baz', typeid: 'Uint32'}] }
             *   ]
             * }
             * </pre>
             */
            setValues<T>(in_values: T[] | Object): void;
            /**
             * Append a child property
             *
             * This is an internal function, called by the PropertyFactory when instantiating a template and internally by the
             * NodeProperty. Adding children dynamically by the user is only allowed in the NodeProperty.
             */
            protected _append(): void;
            /**
             * Merge child properties
             *
             * This is an internal function that merges children of two properties.
             * This is used for extending inherited properties.
             */
            protected _merge(): void;
            /**
             * Remove a child property
             *
             * This is an internal function, called internally by NodeProperty. Removing children dynamically by the user is
             * only allowed in the NodeProperty.
             */
            protected _remove(): void;
            /**
             * Traverses the property hierarchy downwards until all child properties are reached
             */
            traverseDown(): string | undefined;
            /**
             * Traverses all static properties (properties declared in the template and not added dynamically) in the
             * hierarchy below this node
             */
            protected _traverseStaticProperties(): void;
        }

        class IndexedCollectionBaseProperty extends ContainerProperty {
            /**
             * A IndexedCollectionBaseProperty is the base class for indexed collections (maps and sets). It should not be used
             * directly.
             */
            constructor();
            /**
             * Removes the dirtiness flag from this property and recursively from all of its children
             * @param flags The flags to clean, if none are supplied all will be removed
             */
            public cleanDirty(flags?: MODIFIED_STATE_FLAGS_ENUM): void
            /**
             * Returns an object with all the nested values contained in this property
             */
            getValues<T>(): T;
            /**
             * Checks whether a property or data exists at the given position.
             * @param in_position index of the property
             */
            has(in_position: string): boolean;
        }

        class ValueArrayProperty extends ArrayProperty {
            /**
             * An array property which stores primitive values
             */
            constructor();
            /**
             * returns the array of primitive values.
             */
            getValues<T = number[] | string[]>(): T;
            /**
             * Insert into the array at a given position.
             * It will not overwrite the existing value, it will push it to the right.
             * E.g. [1, 2, 3]  .insert(1, 4) => [1, 4, 2, 3]
             */
            insert<T = any>(in_position: number, in_value: T): void;
            /**
             * Add one or more values at the end of the array
             */
            push<T = any>(values: T | T[]): number;
            /**
             * Removes an element of the array (or a letter in a StringProperty) and shifts remaining elements to the left
             * E.g. [1, 2, 3]   .remove(1) => [1, 3]
             * E.g. (StringProperty) 'ABCDE'  .remove(1) => 'ACDE'
             */
            remove(): BaseProperty | any;
            /**
             * Removes the last element of the array or the last letter of a string (for StringProperty)
             */
            pop(): BaseProperty | any;
            /**
             * Change an existing element of the array. This will overwrite an existing element.
             * E.g. [1, 2, 3]  .set(1, 8) => [1, 8, 3]
             */
            set(in_position: number, in_value: any): void;
            /**
             * Sets the values of items in the array.
             * If called using an array (e.g. setValues([pop1, prop2])), it will overwrite the whole array.
             * If called using an object with indexes (e.g. setValues{0: prop1}), it will only overwrite the
             * items at those indexes.
             * For arrays of Properties, this can be used to set nested values in properties found in the array.
             * For example: setValues({0: {position: {x: 2, y:3}}});
             */
            setValues<T = Array<any>>(values: T): void;
            /**
             * Deletes all values from an array
             */
            clear(): void;
            /**
             * Inserts the content of a given array into the array property
             * It will not overwrite the existing values but push them to the right instead.
             * E.g. [1, 2, 3] .insertRange(1, [9, 8]) => [1, 9, 8, 2, 3]
             * @param in_offset target index
             * @param in_array the array to be inserted
             * @throws if in_offset is smaller than zero, larger than the length of the array or not a number.
             * @throws if trying to insert a property that already has a parent.
             * @throws if tyring to modify a referenced property.
             */
            insertRange<T = any>(in_offset: number, in_array: T[]): void;
            /**
             * Removes a given number of elements from the array property (or given number of letters from a StringProperty)
             *  and shifts remaining values to the left.
             * E.g. [1, 2, 3, 4, 5]  .removeRange(1, 3) => [1, 5]
             */
            removeRange(): Array<any> | Array<BaseProperty>;
            /**
             * Sets the array properties elements to the content of the given array
             * All changed elements must already exist. This will overwrite existing elements.
             * E.g. [1, 2, 3, 4, 5]  .setRange(1, [7, 8]) => [1, 7, 8, 4, 5]
             */
            setRange(in_offset: number, in_array: Array<any>): void;
            /**
             * Returns the name of all the sub-properties of this property.
             * Numerical indexes from the array will be returned as strings.
             * E.g. ['0', '1', '2']
             */
            getIds(): Array<string>;
            /**
             * Gets the array element at a given index
             * @param in_position the target index
             *   if an array is passed, elements in the array will be treated as part of a path.
             *   The first item in an array should be a position in the array.
             *   For example, .get([0,'position','x']) is the equivalent of .get(0).get('position').get('x')
             *   If it encounters a ReferenceProperty, .get will, by default, resolve the property it refers to.
             * @param in_options parameter object
             */
            get(in_position: number | Array<string | number>, in_options?: ValueArrayProperty_get_in_options_TYPE): any | BaseProperty | undefined;
            getLength(): number;
            /**
             * Returns true if the property is a primitive type
             */
            isPrimitiveType(): boolean;

        }

        class ArrayProperty extends ContainerProperty {
          /**
           * Default constructor for ArrayProperty
           * @param in_params the parameters
           * @param in_constructor the constructor for the array data
           * @param in_primitiveType Is this an array of primitive types?
           * @param in_scope The scope in which the property typeid is defined
           */
          constructor(in_params: ArrayProperty_ArrayProperty_in_params_TYPE, in_constructor: object, in_primitiveType: Boolean, in_scope: string | undefined);

          public get length()
          /**
           * Gets the array element at a given index
           * @param in_position the target index
           *   if an array is passed, elements in the array will be treated as part of a path.
           *   The first item in an array should be a position in the array.
           *   For example, .get([0,'position','x']) is the equivalent of .get(0).get('position').get('x')
           *   If it encounters a ReferenceProperty, .get will, by default, resolve the property it refers to.
           * @param in_options parameter object
           */
          get<T=BaseProperty>(in_position: number | string | Array<string|number>, in_options?: ArrayProperty_get_in_options_TYPE): T | undefined;
          /**
           * Insert into the array at a given position.
           * It will not overwrite the existing values, it will push them to the right.
           */
          insert(in_position: number, in_value: any): void;
          /**
           * Add one or more values at the end of the array
           */
          push(in_values: Array<any> | any): number;
          /**
           * Add a value at the front of the array or letters to the beginning of a string (for StringProperty)
           * It can also add multiple values to an array if you pass in an array of values.
           */
          unshift(in_values: Array<any> | any): number;
          /**
           * Removes an element of the array (or a letter in a StringProperty) and shifts remaining elements to the left
           * E.g. [1, 2, 3]   .remove(1) => [1, 3]
           * E.g. (StringProperty) 'ABCDE'  .remove(1) => 'ACDE'
           */
          remove(in_position: number): BaseProperty | any;
          /**
           * Removes the last element of the array or the last letter of a string (for StringProperty)
           */
          pop(): BaseProperty | any;
           /**
           * Removes an element from the front of the array or a letter from the beginning of a string (for StringProperty)
           */
          shift(): BaseProperty;
          /**
           * Change an existing element of the array. This will overwrite an existing element.
           * E.g. [1, 2, 3]  .set(1, 8) => [1, 8, 3]
           */
          set(in_position: number, in_value: any): void;
          /**
           * Deletes all values from an array
           */
          clear(): void;
          /**
           * Inserts the content of a given array into the array property
           * It will not overwrite the existing values but push them to the right instead.
           * E.g. [1, 2, 3] .insertRange(1, [9, 8]) => [1, 9, 8, 2, 3]
           * @param in_offset target index
           * @param in_array the array to be inserted
           * @throws if in_offset is smaller than zero, larger than the length of the array or not a number.
           * @throws if trying to insert a property that already has a parent.
           * @throws if tyring to modify a referenced property.
           */
          insertRange<T=any>(in_offset: number, in_array: T[]): void;
          /**
           * Removes a given number of elements from the array property (or given number of letters from a StringProperty)
           *  and shifts remaining values to the left.
           * E.g. [1, 2, 3, 4, 5]  .removeRange(1, 3) => [1, 5]
           */
          removeRange(in_offset: number, in_deleteCount: number): Array<any> | Array<BaseProperty>;
          /**
           * Sets the array properties elements to the content of the given array
           * All changed elements must already exist. This will overwrite existing elements.
           * E.g. [1, 2, 3, 4, 5]  .setRange(1, [7, 8]) => [1, 7, 8, 4, 5]
           */
          setRange(in_offset: number, in_array: Array<any>): void;
          /**
           * Returns an object with all the nested values contained in this property
           */
          getValues<T = BaseProperty[]>(): T;
          getLength(): number;
          /**
           * Checks whether a property or data exists at the given position.
           * @param in_position index of the property
           */
          has(in_position: string): boolean;
          /**
           * Returns the full property type identifier for the ChangeSet including the array type id, if not
           * omitted by parameters
           * @param in_hideCollection - if true the collection type (if applicable) will be omitted. Default to false
           * @return The typeid
           */
          public getFullTypeid(in_hideCollection?: boolean): string
        }

        class EnumArrayProperty extends ArrayProperty {
            /**
             * This class is a specialized version of the ArrayProperty for enums.
             * Since we internally represent enums as Int32Array this is much more
             * efficient and convenient. Additionally, we provide direct access
             * methods to the enums in the array, e.g. .getEnumString(3) directly
             * returns the enum string at position 3 of the array
             * @param in_params the parameters
             */
            constructor(in_params: EnumArrayProperty_EnumArrayProperty_in_params_TYPE);
            /**
             * inserts the content of a given array into the array property
             * @param in_offset target index
             * @param in_array the array to be inserted
             * @throws if in_array is not an array
             * @throws if in_position is not a number
             * @throws if a value to be inserted is an instance of BaseProperty
             * @throws if tyring to modify a referenced property.
             */
            insertRange<T = any>(in_offset: number, in_array: T[]): void;
            /**
             * sets the content of the an enum in an enum array
             */
            set(): void;
            /**
             * sets the content of an enum in an enum array
             */
            setEnumByString(): void;
            /**
             * sets the array properties elements to the content of the given array
             * all changed elements must already exist
             */
            setRange(in_offset: number, in_array: Array<string>): void;
            /**
             * get the array element at a given index
             */
            getEnumString(in_position: number): string;
            /**
             * get an array of the enum strings starting at a given index
             */
            getEnumStrings(in_offset: number, in_length: number): Array<string>;
            /**
             * let the user to query all valid entries of an enum
             */
            getValidEnumList(): { [key: string]: { value: any, annotation: any } };
            /**
             * Returns the full property type identifier for the ChangeSet including the enum and array type id
             * @param  in_hideCollection - if true the collection type (if applicable) will be omitted
             *                since that is not aplicable here, this param is ignored. Default to false
             * @return The typeid
             */
            getFullTypeid(in_hideCollection: boolean): string;
            /**
             * Insert into the array at a given position.
             * It will not overwrite the existing values, it will push them to the right.
             */
            insert(): void;
            /**
             * Add one or more values at the end of the array
             */
            push(): number;
            /**
             * Removes an element of the array (or a letter in a StringProperty) and shifts remaining elements to the left
             * E.g. [1, 2, 3]   .remove(1) => [1, 3]
             * E.g. (StringProperty) 'ABCDE'  .remove(1) => 'ACDE'
             */
            remove(): BaseProperty | any;
            /**
             * Removes the last element of the array or the last letter of a string (for StringProperty)
             */
            pop(): BaseProperty | any;
            /**
             * Sets the values of items in the array.
             * If called using an array (e.g. setValues([pop1, prop2])), it will overwrite the whole array.
             * If called using an object with indexes (e.g. setValues{0: prop1}), it will only overwrite the
             * items at those indexes.
             * For arrays of Properties, this can be used to set nested values in properties found in the array.
             * For example: setValues({0: {position: {x: 2, y:3}}});
             */
            setValues(): void;
            /**
             * Deletes all values from an array
             */
            clear(): void;
            /**
             * Removes a given number of elements from the array property (or given number of letters from a StringProperty)
             *  and shifts remaining values to the left.
             * E.g. [1, 2, 3, 4, 5]  .removeRange(1, 3) => [1, 5]
             */
            removeRange(): Array<any> | Array<BaseProperty>;
            /**
             * Returns the name of all the sub-properties of this property.
             * Numerical indexes from the array will be returned as strings.
             * E.g. ['0', '1', '2']
             */
            getIds(): Array<string>;
            /**
             * Gets the array element at a given index
             * @param in_position the target index
             *   if an array is passed, elements in the array will be treated as part of a path.
             *   The first item in an array should be a position in the array.
             *   For example, .get([0,'position','x']) is the equivalent of .get(0).get('position').get('x')
             *   If it encounters a ReferenceProperty, .get will, by default, resolve the property it refers to.
             * @param in_options parameter object
             */
            get(in_position: number | Array<string | number>, in_options?: EnumArrayProperty_get_in_options_TYPE): any | BaseProperty | undefined;
            getLength(): number;
        }

        /**
         * An ArrayProperty which stores reference values
         */
        class ReferenceArrayProperty extends ArrayProperty {
            /**
             * Returns the typeid for the target of this reference
             *
             * Note: This is the type that is specified in the typeid of this reference and not the actual type
             * of the referenced object, which might inherit from that typeid.
             */
            getReferenceTargetTypeId(): string;
            /**
             * Checks whether the reference is valid. This is either the case when it is empty or when the referenced
             * property exists.
             */
            isReferenceValid(in_position: number): boolean;
            /**
             * Sets the range in the array to point to the given property objects or to be equal to the given paths
             */
            setRange(in_offset: number, in_array: Array<string>): void;
            /**
             * Insert a range which points to the given property objects into the array
             *
             * @param {number} in_offset - target start index
             * @param {Array<property-properties.BaseProperty|undefined|String>} in_array  - contains the properties to be set or
             *   the paths to those properties. If undefined is passed, the reference will be set to an empty string to
             *   indicate an empty reference.
             * @throws if in_offset is smaller than zero, larger than the length of the array or not a number
             * @throws if in_array is not an array
             * @throws if one of the items in in_array is defined, but is not a property or a string.
             */
            insertRange(): void;
            /**
             * returns the path value of a reference.
             */
            getValue<T = string>(): T;
            /**
             * Returns an object with all the nested values contained in this property
             */
            getValues<T = String[]>(): T;
            /**
             * Removes the last element of the array
             */
            pop(): string;
            /**
             * Removes an element of the array and shift remaining elements to the left
             */
            remove(): string;
            /**
             * Removes a given number of elements from the array and shifts remaining values to the left.
             */
            removeRange(): Array<string>;
        }

        class StringProperty extends ValueArrayProperty {
            /**
             * A primitive property for a string value.
             */
            constructor();
            /**
             * Get the string value
             */
            getValue<T = string>(): T;
            /**
             * inserts a string starting at a position and shifts the rest of
             * the String to the right. Will not overwrite existing values.
             */
            insert(): void;
            /**
             * Adds letters to the end of the string
             */
            push(): number;
            /**
             * returns the String to an empty string.
             */
            clear(): void;
            /**
             * removes a given number of elements from the array property and shifts
             * remaining values to the left.
             */
            removeRange(): Array<any> | Array<BaseProperty>;
            setValue(value: string): void;
            setValues(): void;
            /**
             * sets the value of a string at a single index.
             * For example, if you have a string of value 'AAAA' and do .set(1, 'a') => 'AaAA'
             * If you pass in a string of multiple letters, it will replace the letter at in_index and insert the
             * rest of you in_string. E.g. 'ABCD' .set(1, 'xy') => 'AxyCD'
             */
            set(): void;
            /**
             * sets values in a string starting at an index.
             * For example, if you have a string of Value 'AAAA' and do .setRange(1, 'aa') => AaaA
             * It will set as many letters as are in in_string.
             */
            setRange(): void;
            /**
             * get a letter at a given index
             */
            get(): string;
            /**
             * inserts a string starting at a position and shifts the rest of the String to the right.
             * Will not overwrite existing values.
             * For StringProperty, insert and insertRange work the same, except that .insert
             * checks that in_value is a string and .insertRange will accept an array of strings.
             * @param in_position target index
             * @param in_value value to be inserted
             * @throws if in_position is smaller than zero, larger than the length of the string or not a number
             */
            insertRange<T = string>(in_offset: number, in_array: T | T[]): void;
            /**
             * Removes an element of the array (or a letter in a StringProperty) and shifts remaining elements to the left
             * E.g. [1, 2, 3]   .remove(1) => [1, 3]
             * E.g. (StringProperty) 'ABCDE'  .remove(1) => 'ACDE'
             */
            remove(): BaseProperty | any;
            /**
             * Removes the last element of the array or the last letter of a string (for StringProperty)
             */
            pop(): BaseProperty | any;
            /**
             * Returns the name of all the sub-properties of this property.
             * Numerical indexes from the array will be returned as strings.
             * E.g. ['0', '1', '2']
             */
            getIds(): Array<string>;
            getLength(): number;

            /**
             * Modifies the property according to the given changeset
             */
            applyChangeSet(in_changeSet: SerializedChangeSet): void;

        }

        class Float32ArrayProperty extends ValueArrayProperty { }

        class Float64ArrayProperty extends ValueArrayProperty { }

        class Uint8ArrayProperty extends ValueArrayProperty { }

        class Int8ArrayProperty extends ValueArrayProperty { }

        class Uint16ArrayProperty extends ValueArrayProperty { }

        class Int16ArrayProperty extends ValueArrayProperty { }

        class Uint32ArrayProperty extends ValueArrayProperty { }

        class Int32ArrayProperty extends ValueArrayProperty { }

        class Integer64ArrayProperty extends ValueArrayProperty { }

        class Int64ArrayProperty extends Integer64ArrayProperty {
            /**
             * Inserts the content of a given array into the array property
             * It will not overwrite the existing values but push them to the right instead.
             * E.g. [1, 2, 3] .insertRange(1, [9, 8]) => [1, 9, 8, 2, 3]
             * @param {number} in_offset target index
             * @param {Array<*>} in_array the array to be inserted
             * @throws if in_offset is smaller than zero, larger than the length of the array or not a number.
             * @throws if trying to insert a property that already has a parent.
             * @throws if tyring to modify a referenced property.
             */
            insertRange<T = any>(in_offset: number, in_array: T[]): void;
            /**
             * Sets the array properties elements to the content of the given array
             * All changed elements must already exist. This will overwrite existing elements.
             * E.g. [1, 2, 3, 4, 5]  .setRange(1, [7, 8]) => [1, 7, 8, 4, 5]
             */
            setRange(in_offset: number, in_array: Array<number>): void;
        }

        class Uint64ArrayProperty extends Integer64ArrayProperty {
            /**
             * Inserts the content of a given array into the array property
             * It will not overwrite the existing values but push them to the right instead.
             * E.g. [1, 2, 3] .insertRange(1, [9, 8]) => [1, 9, 8, 2, 3]
             * @param {number} in_offset target index
             * @param {Array<*>} in_array the array to be inserted
             * @throws if in_offset is smaller than zero, larger than the length of the array or not a number.
             * @throws if trying to insert a property that already has a parent.
             * @throws if tyring to modify a referenced property.
             */
            insertRange<T = any>(in_offset: number, in_array: T[]): void;
            /**
             * Sets the array properties elements to the content of the given array
             * All changed elements must already exist. This will overwrite existing elements.
             * E.g. [1, 2, 3, 4, 5]  .setRange(1, [7, 8]) => [1, 7, 8, 4, 5]
             */
            setRange(in_offset: number, in_array: Array<number>): void;
        }

        class StringArrayProperty extends ValueArrayProperty { }

        class BoolArrayProperty extends ValueArrayProperty { }

        class BinaryProperty extends NamedProperty {
            /**
             * BinaryProperty encapsulates everything required for upload and download of binary objects.
             * @param in_params Input parameter list.
             */
            constructor(in_params: BinaryProperty_BinaryProperty_in_params_TYPE);
            /**
             * Removes the binary object from the external storage.
             */
            delete(): Promise<any>;
            /**
             * Downloads the object from OSS into any class which inherits the DataSource
             * base class.
             */
            download(): Promise<number>;
            /**
             * Creates a signed url for the binary object and assigns the url to it's signedUrl property.
             */
            generateSignedURL(): Promise<string>;
            /**
             * Gets the internal data source.
             */
            getDataSource(): DataSource | undefined;
            /**
             * Gets the internal data store.
             */
            getDatastore(): Datastore | undefined;
            /**
             * Gets the status of the Binary Property.
             */
            getState(): BINARY_PROPERTY_STATUS_TYPE;
            /**
             * Gets the metadata from the datastore array.
             */
            getMetadata(): NodeProperty;
            /**
             * Gets the parameters object from the datastore array.
             */
            getParameters(): NodeProperty;
            /**
             * Initializes the Binary Property with the required instance items.
             * @param in_params List of parameters.
             */
            initialize(in_params: BinaryProperty_initialize_in_params_TYPE): Promise<any>;
            /**
             * Checks to see whether the BinaryProperty is in the passed in state.
             */
            isStateAt(): boolean;
            /**
             * Synchronizes the metadata from the external storage's metadata.
             */
            refreshMetadata(): Promise<any>;
            /**
             * Sets the internal data source.
             */
            setDataSource(): void;
            /**
             * Uploads the binary object to specified datastore.
             */
            upload(): Promise<any>;
            /**
             * Returns a string identifying the property
             *
             * If an id has been explicitly set on this property we return that one, otherwise the GUID is used.
             */
            getId(): string;
            /**
             * Returns the GUID of this named property
             * A Guid is a unique identifier for a branch, commit or repository,
             * similar to a URN. Most functions in the API will us a URN but the
             * Guid is used to traverse the commit graph.
             */
            getGuid(): string;
            /**
             * Returns the name of all the sub-properties of this property.
             */
            getIds(): Array<string>;
            /**
             * Given an object that mirrors a PSet Template, assigns the properties to the values
             * found in that object.
             * eg.
             * <pre>
             * Templates = {
             *   properties: [
             *     { id: 'foo', typeid: 'String' },
             *     { id: 'bar', properties: [{id: 'baz', typeid: 'Uint32'}] }
             *   ]
             * }
             * </pre>
             */
            setValues(): void;
        }

        interface IPropertyFactory {
            /**
             * Add a listener for a given type of event.
             */
            addListener(eventName: string, eventListener: (...args: any[]) => any): void;
            /**
             * Remove a listener for a given type of event. Iff a listener was removed,
             * an event 'removeListener' will be emitted.
             */
            removeListener(eventName: string, eventListener: (...args: any[]) => any): void;
            /**
             * Register template which are used to instantiate properties.
             *
             * In addition to json structures
             * it also accepts typeids, as well as arrays of jsons ans arrays of typeids
             * as arguments. IN the case of jsons, the behavior is similar to the behavior of registerLocal.
             * In the case of typeids, it adds it to a list of unknown dependencies if the corresponding template
             * is not known locally. The case of arrays is a a repetitive application of the scalar type.
             */
            register(in_input: PropertyTemplate | object | string | any[]): void;
            /**
             * Recursively parses the object of the specified type and returns the created
             * array of PropertySets Templates. It does the same thing as the registerFrom()
             * function, but it returns the array of templates instead of registering them.
             * Throws an error if any conversion error occurs.
             */
            convertToTemplates(): Array<object>;
            /**
             * Recursively parses the object of the specified type and registers the created
             * Property Sets Templates. It does the same work as the convertToTemplates()
             * function, but it registers the templates for you instead of returning them.
             * Throws an error if any conversion error occurs.
             */
            registerFrom(in_fromType: string, in_toConvert: object): void;
            /**
             * Validate a template
             * Check that the template is syntactically correct as well as semantically correct.
             */
            validate(in_template: PropertyTemplate | PropertyTemplateType): object | undefined;
            /**
             * Get template based on typeid
             *
             * @param in_typeid the type unique identifier
             */
            getTemplate(in_typeid: string): PropertyTemplate | undefined;
            /**
             * Create an instance of the given property typeid if there is a template registered for it.
             * Otherwise, this method returns undefined.
             * @param in_typeid The type unique identifier
             * @param in_context The type of collection of values that the property contains.
             *                                 Accepted values are "single" (default), "array", "map" and "set".
             * @param in_initialProperties A set of initial values for the PropertySet being created
             * @param in_options Additional options
             */
            create<T extends BaseProperty>(in_typeid: string, in_context?: string, in_initialProperties?: any, in_options?: PropertyFactory_create_in_options_TYPE): T;
            /**
             * Checks whether the template with typeid in_templateTypeid inherits from the template in in_baseTypeid
             *
             * Note: By default, this also returns true if in_templateTypeid === in_baseTypeid, since in most use cases
             *       the user wants to check whether a given template has all members as another template and so this is
             *       true for the template itself
             * @param in_templateTypeid Template for which we want to check, whether in_baseTypeid is a parent
             * @param in_baseTypeid The base template to check for
             * @param in_options Additional options
             */
            inheritsFrom(in_templateTypeid: string, in_baseTypeid: string, in_options?: PropertyFactory_inheritsFrom_in_options_TYPE): boolean;
            /**
             * Returns all the typeids the template inherits from (including all possible paths through multiple inheritance).
             * The order of the elements in the array is unspecified.
             * @param in_typeid typeid of the template
             * @param in_options Additional options
             */
            getAllParentsForTemplate(in_typeid: string, in_options?: PropertyFactory_getAllParentsForTemplate_in_options_TYPE): Array<string>;
            /**
             * Initializes the schema store.
             * @param in_options the store settings.
             */
            initializeSchemaStore(in_options: PropertyFactory_initializeSchemaStore_in_options_TYPE): Promise<any>;
            /**
             * Tries to resolve dependencies after some calls to register() have been made
             */
            resolveSchemas(): Promise<any>;
            /**
             * Determines whether the given property is an instance of the property type corresponding to the given native
             * property typeid and context.
             *
             * @param in_property The property to test
             * @param in_primitiveTypeid - Native property typeid
             * @param in_context - Context of the property
             * @return True, if the property is an instance of the corresponding type
             */
            instanceOf(in_property: BaseProperty, in_primitiveTypeid: string, in_context?: string): boolean;
        }

        var PropertyFactory: IPropertyFactory;

        class Workspace extends EventEmitter {
            /**
             * The Workspace object encapsulates a PropertyTree to proxy function calls.
             * A Workspace can be seen as a view to the state of the data at a point in time.
             * It is the main interface for adding/removing/modifying high frequency data.
             */
            constructor();
            /**
             * Initialize an empty workspace or load an existing workspace
             *
             * If an URN is provided in in_options.urn (either a branch URN or a commit URN),
             * this URN is checked out. Otherwise, a new repository is created and the
             * main branch is checked out.
             * @param in_options Additional options
             * @param in_options.metadata.name The human readable name of the branch.
             *                                              If not specified, it defaults to the guid.
             */
            initialize(in_options?: Workspace_initialize_in_options_TYPE): Promise<BranchNode>;
            /**
             * Create and checkout a branch from the currently active commit
             * @param in_options Additional options
             * @param in_options.metadata.name The human readable name of the branch.
             *   If not specified, it defaults to the guid.
             */
            branch(in_options?: Workspace_branch_in_options_TYPE): Promise<BranchNode>;
            /**
             * Commit the current pending changes. The new commit node will be
             * the new head of the current branch. In detached head state, a new branch will be created.
             * If the the PropertyTree is connected to the backend, the new commit will also be persisted and broadcasted.
             * If SYNC_MODE is set to SYNCHRONIZE, any conflict occurred will be resolved by automatically
             * rebasing the local branch and synchronizing with the remote repository.
             * @param in_options Additional options
             */
            commit(in_options?: Workspace_commit_in_options_TYPE): Promise<CommitNode>;
            /**
             * Check whether the Workspace has checked out a urn
             */
            isCheckedOut(): boolean;
            /**
             * Return the active commit of the workspace
             */
            getActiveCommit(): CommitNode | string;
            /**
             * get the active branch of the workspace if a branch urn was initialized/checkedout
             * Or if you checked out a commit that was not the latest in its branch, this will
             * return 'Repository.DETACHED_HEAD'
             */
            getActiveBranch(): BranchNode | string;
            /**
             * Returns if the active branch is detached. This happens if you checkout a commit
             * that is not at the head of its branch. Your workspace is then detached from
             * the branch. You can still commit changes but they will not be commited to
             * the original branch.
             */
            isDetachedHead(): Boolean;

            /**
             * Get the Urn currently used by the workspace
             * It can be a commit Urn (if the workspace was initialized with a specific commit Urn)
             * or a branch Urn (if the workspace was initialized with a branch Urn)
             */
            getActiveUrn(): string | undefined;
            /**
             * Set whether repository references should be automatically or explicitly loaded.
             */
            setLazyLoadRepositoryReferences(): void;
            /**
             * Returns whether there are changes that have not yet been committed.
             */
            hasPendingChanges(): Boolean;

            /**
             * Returns the ChangeSet of all pending changes.
             */
            getPendingChanges(): ChangeSet;
            /**
             * Whether or not the workspace is up to date with the latest commit of a branch.
             * Will return false if the workspace has local commits not yet pushed to the remote
             * branch, or if the remote branches has commits not yet pulled to the workspace.
             */
            isSynchronized(): Boolean;
            /**
             * Whether a workspace is destroyed
             */
            isDestroyed(): Boolean;
            /**
             * Performs a rebase of a branch onto another branch.
             *
             * This will re-arrange the local commit history to be applied on top of the latest state of the branch.
             * For baseProperties this will be done automatically, for more complex transformations, the user can
             * supply a callback by using Workspace.setRebaseCallback
             * @param in_options Rebase Options has the following members:
             */
            rebase(in_options?: Workspace_rebase_in_options_TYPE): Promise<boolean>;
            /**
             * Resets an existing workspace to pre initialized state/ checkedout state.
             */
            reset(): void;
            /**
             * Reverts the state of the workspace to that of a previous commit.
             * The changes are applied as pending changes.
             * @param in_commitUrn The urn of the commit to revertTo
             * @param in_options Additional options to pass in.
             */
            revertTo(in_commitUrn: string, in_options?: Workspace_revertTo_in_options_TYPE): Promise<void>;
            /**
             * Set the conflict handling configuration of the Workspace.
             * Here you can set a global conflict handling strategy for each commit to be processed by the server.
             * see Workspace.SERVER_AUTO_REBASE_MODES for more info.
             * You can also set the notification callback to react to conflicts during a rebase.
             * @param in_modeopt The server side conflict handling mode on each commit.
             */
            setServerAutoRebaseMode(in_modeopt?: SERVER_AUTO_REBASE_MODES_TYPE, in_options?: object): void;
            /**
             * Set the conflict handling callback to be invoked when a conflict occurs during a rebase operation.
             * @param in_callback Callback invoked for every ChangeSet that is applied
             *       It will be passed an Object with these members:
             *       * {SerializedChangeSet}  transformedChangeSet - The ChangeSet that resulted from performing the
             *                                                                     rebase operation on the base types. This
             *                                                                     ChangeSet can be modified to adapt the changes
             *                                                                     to the changes in the onto-branch.
             *       * {SerializedChangeSet}  originalChangeSet    - The original ChangeSet before the rebase
             *       * {SerializedChangeSet}  ontoBranchChangeSet  - The changes between the common parent commit and
             *                                                                     the tip of the onto branch
             *       * {SerializedChangeSet}  [currentState]       - The normalized ChangeSet for the whole Repository
             *                                                                     before the application of the
             *                                                                     transformedChangeSet. It will only be supplied
             *                                                                     when in_options.trackState===true, since
             *                                                                     computing this state can be expensive.
             *       * {Array.<ConflictInfo>} conflicts            - List with the conflicts that occurred during the
             *                                                                     rebase
             *       * {CommitNode} [commitNode]        - The commit node that is rebased. This is
             *                                                                     undefined, when the pending changes are rebased
             * @param in_options Set of options
             */
            setRebaseCallback(in_callback?: Function | undefined, in_options?: Workspace_setRebaseCallback_in_options_TYPE): void;
            /**
             * Synchronize the workspace with remote branch. This will pull all new remote commits and push
             * all new local commits.
             */
            synchronize(): Promise<boolean>;
            /**
             * Synchronize the workspace with the latest version of the remote branch,
             * but do not push local changes. Local changes will be rebased on top of the
             * pulled changes.
             */
            pull(): Promise<boolean>;
            /**
             * Set the synchronization mode of the Workspace.
             * These include:
             * - MANUAL: Application needs to update and push manually. Commit is local in this mode.
             * - PUSH: Workspace automatically pushes local commits to the server
             * - PULL: Workspace automatically pulls remote changes without pushing it's changes back
             * - SYNCHRONIZE: Workspace updates and pushes automatically
             * Defaults to SYNCHRONIZE
             * @param syncMode The sync mode to set.
             */
            setSynchronizeMode(syncMode: SYNC_MODE_TYPE): void;
            /**
             * Push local commits onto the remote branch. If the local workspace is not up to date
             * with remote commits, it will rebase before pushing the local commits.
             */
            push(): Promise<any>;
            /**
             * Checks out the given Repository into the supplied checkout view.
             * If a commit Urn is passed in, the workspace will checkout that commit. When checking out an old
             * commit, you will no longer be notified of changes to the branch. You will be in detached head
             * state. If you commit new changes, a new branch will be created.
             * If a branch Urn is passed in, the workspace will checkout the latest commit on that branch.
             * @param in_commitOrBranchUrn URN identifying the commit or branch to check out
             * @param in_options List of additional options.
             */
            checkout(in_commitOrBranchUrn: string, in_options?: Workspace_checkout_in_options_TYPE): Promise<any>;
            /**
             * Expand a path to a given property within the PropertySet that the workspace has checked out and
             * return the value at the end.
             * @param in_path Path to be resolved.
             * @param in_options parameter object
             */
            resolvePath<T = BaseProperty>(in_path: string, in_options?: Workspace_resolvePath_in_options_TYPE): T | undefined;
            /**
             * Delays notifications until popModifiedEventScope has been called the same number of times as
             * pushModifiedEventScope.
             * For example, calling pushModifiedEventScope will stop the application from running the
             * on('modified') callback until popModifiedEventScope is called.
             */
            pushModifiedEventScope(): void;
            /**
             * Reenables notifications when popModifiedEventScope has been called the same number of times as
             * pushModifiedEventScope.
             * For example, calling pushModifiedEventScope will stop the application from running the
             * on('modified') callback until popModifiedEventScope is called.
             */
            popModifiedEventScope(): void;
            /**
             * Insert a property at the root of the PropertySet that the workspace has checked out.
             * NOTE: This will throw an error if the workspace is not at the HEAD of the checked out branch
             *       or if the repository hasn't been checked out yet.
             */
            insert(in_id: string, in_property: BaseProperty): void;
            /**
             * Remove a property from the root of the PropertySet that the workspace has checked out.
             * NOTE: This will throw an error if the workspace is not at the HEAD of the checked out branch
             *       or if the repository hasn't been checked out yet.
             */
            remove(in_property: string | BaseProperty): void;
            /**
             * Returns the name of all the properties at the root of the PropertySet that
             * the workspace has checked out.
             */
            getIds(): Array<string>;
            /**
             * Returns the property having the given id at the root of the PropertySet
             * that the workspace has checked out.
             * @param in_ids the ID of the property or an array of IDs
             *       if an array is passed, the .get function will be performed on each id in sequence
             *       for example .get(['position','x']) is equivalent to .get('position').get('x').
             *       If .get resolves to a ReferenceProperty, it will return the property that the ReferenceProperty
             *       refers to.
             * @param in_options parameter object
             */
            get<T extends BaseProperty>(in_ids: string | number | Array<string | number>, in_options?: Workspace_get_in_options_TYPE): T | undefined;
            /**
             * Checks whether a property with the given id exists at the root of the
             * PropertySet that the workspace has checked out.
             */
            has(in_id: string): boolean;
            /**
             * Get all properties at the root of the PropertySet that the workspace has checked out.
             * Caller MUST NOT modify the properties.
             */
            getEntriesReadOnly(): BaseProperty | null;
            /**
             * Returns the number of local commits that have not yet been pushed to the remote branch.
             * The count can be brought back to zero by calling .push() or .synchronize()
             * If there is no remote branch, will return 0.
             */
            getPushCount(): number;
            /**
             * Returns the number of remote commits that have not yet been pulled to the local repository.
             * the count can be brought to zero by calling .pull() or .synchronize()
             * If no remote branch exists, will return 0.
             */
            getPullCount(): number;
            /**
             * Get the root property of the workspace. This is effectively the PropertySet that the workspace has checked out.
             */
            getRoot(): NodeProperty;
            /**
             * Checks if there is a template with a specific name loaded in the workspace, returns it if found.
             * To get all the loaded templates, pass a null name.
             */
            getTemplate(in_name?: string | null): { [index: string]: PropertyTemplateType } | PropertyTemplateType | undefined;
            /**
             * Leaves the branch if working on an active branch then destroys the workspace
             * NOTE: The workspace will no longer be usable after calling this function
             */
            destroy(): Promise<any>;
            /**
             * Generate a human-readable representation of the workspace and all of its objects
             */
            prettyPrint(printFn?: (...args: any[]) => any): void;
            /**
             * Change the AutoUpload flag state. This flag is used to indicate whether to upload binary
             * properties on commit and is set to true by default.
             */
            setAutoUpload(): boolean;
            SYNC_MODE: SYNC_MODE_ENUM;
            static REBASE_CALLBACK_NOTIFICATION_MODES: REBASE_CALLBACK_NOTIFICATION_MODES_ENUM;
            SERVER_AUTO_REBASE_MODES: SERVER_AUTO_REBASE_MODES_ENUM;

        }

        class BranchNode {
            /**
             * Node representing a branch in the commit graph
             * @param in_params List of branch meta data
             * @param in_headNode The head node of the branch
             */
            constructor(in_params: BranchNode_BranchNode_in_params_TYPE, in_headNode: CommitNode);
            /**
             * Returns the name of the branch. If no name was specified, returns a unique id.
             */
            getName(): string;
            /**
             * Check whether this branch is remote
             */
            isRemoteBranch(): boolean;
            /**
             * Get the remote branch
             */
            getRemoteBranch(): BranchNode | undefined;
            /**
             * Get the local branch
             */
            getLocalBranch(): BranchNode | undefined;
            /**
             * Return the Guid of the branch
             * A Guid is a unique identifier for a branch, commit or repository,
             * similar to a URN. Most functions in the API will us a URN but the
             * Guid is used to traverse the commit graph.
             */
            getGuid(): string;
            /**
             * Gets the URN of this branch
             */
            getUrn(): string;
            /**
             * Returns the head of the branch
             */
            getHead(): CommitNode;
            /**
             * Comparison function between this branch node and another one to check
             * for equality.
             */
            isEqual(): boolean;
            /**
             * Returns true if the branch is currently not tracking the server branch, false otherwise.
             */
            isUntracked(): boolean;
            /**
             * Returns true if the branch is currently in the process of tracking the server branch, false otherwise.
             */
            isTracking(): boolean;
            /**
             * Returns true if the server branch is currently properly tracked, false otherwise.
             */
            isTracked(): boolean;
            /**
             * Returns the tracking state as text, either 'UNTRACKED', 'TRACKING' or 'TRACKED'.
             */
            getTrackState(): string;
            /**
             * Returns the local commits that have been pushed to the server but haven't been confirmed yet.
             * If there is no remote branch, will return an empty array.
             */
            getCommitsInFlight(): Array<CommitNode>;
            /**
             * Returns the remote commits that have not yet been pulled to the local repository.
             * If no remote branch exists, will return an empty array.
             */
            getCommitsToPull(): Array<CommitNode>;
            /**
             * Returns the local commits that have not yet been pushed to the remote branch.
             * If there is no remote branch, will return an empty array.
             */
            getCommitsToPush(): Array<CommitNode>;

        }

        class CommitNode {
            /**
             * A commit node in the commit graph
             * The commit node stores the bits of information that are used to represent a
             * particular set of changes with regards to its input (the parent).
             * Change Sets are the data stored by these nodes but there is no logic around
             * the data itself, only the connectivity between N parent nodes to N children nodes.
             * These nodes are used to build the topology for the change graph, but no knowledge
             * about data is kept here.
             *
             * A Commit node has N inputs, and N outputs. Change sets are retrieved from the
             * node itself.
             *
             *          ____________________
             *         |     CommitNode     |
             *         |                    |
             *      ---i [parent]           |
             *         |                    |
             *         |                    |
             *         |                    |
             *         |         [children] o----
             *         |____________________|
             */
            constructor();
            /**
             * Get metadata on this node with a key
             */
            getMetadata(): any;
            /**
             * Copies the meta data from another node.
             */
            copyMetaDataFromNode(): void;
            /**
             * Gets the URN of this commit
             */
            getUrn(): string;
            /**
             * Get a reference to the guid of the old commit that was used to generate this rebased commit
             */
            getRebaseParentGuid(): string;
            /**
             * Returns the primary parent of the commit.
             */
            getFirstParent(): RootProperty | CommitNode | undefined;
            /**
             * Return all the parent nodes of the commit, starting with the primary parent.
             */
            getParents(): Array<RootProperty | CommitNode>;
            /**
             * Return all the children nodes of the commit.
             */
            getChildren(): Array<CommitNode>;
            /**
             * Gets the GUID of this commit
             * A Guid is a unique identifier for a branch, commit or repository,
             * similar to a URN. Most functions in the API will us a URN but the
             * Guid is used to traverse the commit graph.
             */
            getGuid(): string;
            /**
             * Gets the GUID this commit had when it was last pushed to the server (valid only for local commits).
             */
            getGuidOnLastPush(): string | undefined;
            /**
             * Returns the GUIDs this commit had each time it was pushed to the server (valid only for local commits).
             */
            getGuidsOnPush(): Array<string> | undefined;
            /**
             * Comparison function between this commit node and another one to check
             * for equality.
             */
            isEqual(): boolean;
            /**
             * Return the changeset data of a commit node.
             */
            getChangeSetReadOnly(): SerializedChangeSet;
            /**
             * A commit is normalized if the commit node does not contain a ChangeSet relative
             * to its parent, but actually a full serialization as a normalized ChangeSet.
             * (A normalized ChangeSet is a ChangeSet that only contains insert operations as
             * well as base property assignments. So all children definitions and collections
             * only consist of insert operations. Insert operations on strings and arrays
             * MUST insert only one range starting at position 0.)
             */
            isNormalized(): boolean;

            /**
             * Returns the path from the supplied parent commit to this node
             *
             * Note: This function assumes that the given commit is direct parent (e.g. not in a branch of a merge commit,
             *       but a direct ancestor, as returned by getFirstParent).
             *
             * @param in_parentCommit  - The node from which the path is computed.
             *                           If a function is provided, it is used
             *                           as predicate to determine whether the
             *                           node is the parent.
             * @param in_includeParent - Should the  parent node itself be
             *                           included in the supplied path?
             *
             * @return The nodes on the path from the supplied parent
             */
            _getPathFromParentCommit(in_parentCommit: CommitNode, in_includeParent?: boolean): Array<CommitNode>;

        }

        class MapProperty extends IndexedCollectionBaseProperty {
            /**
             * A MapProperty is a collection class that can contain an dictionary that maps from strings to properties.
             */
            constructor();
            /**
             * Returns the full property type identifier for the ChangeSet including the map type id
             * @param  in_hideCollection - if true the collection type (if applicable) will be omitted
             *                since that is not aplicable here, this param is ignored. Default to false
             * @return The typeid
             */
            getFullTypeid(in_hideCollection: boolean): string;
            /**
             * Inserts a property or value into the map
             *
             * Note: This will trigger an exception when this key already exists in the map. If you want to overwrite
             *       existing entries you can use the set function.
             */
            insert(in_key: string, in_property: BaseProperty): void;
            /**
             * Removes the entry with the given key from the map
             */
            remove(in_key: string): any;
            /**
             * deprecated - replaced by set
             */
            setValue(): void;
            /**
             * set all the values
             */
            setValues<T>(in_values: Object): void;
            /**
             * Sets the entry with the given key to the property passed in
             *
             * Note: this will overwrite an already existing value
             */
            set(in_key: string, in_value: any): void;
            /**
             * Checks whether an entry with the given name exists
             * @param in_id	Name of the property
             */
            has(in_id: string): boolean;
            /**
             * Returns all entries of the map as an array.
             *
             * NOTE: This function creates a copy and thus is less efficient as getEntriesReadOnly.
             */
            getAsArray(): Array<BaseProperty | any>;
            /**
             * Returns all keys found in the map
             *
             * NOTE: This function creates a copy and thus is less efficient as getEntriesReadOnly.
             */
            getIds(): Array<string>;
            /**
             * Deletes all values from the Map
             */
            clear(): void;

            getAbsolutePath(): string;

        }

        class ReferenceMapProperty extends StringMapProperty {
            /**
             * A StringMapProperty which stores reference values
             */
            constructor();
            /**
             * Returns the typeid for the target of this reference
             *
             * Note: This is the type that is specified in the typeid of this reference and not the actual type
             * of the referenced object, which might inherit from that typeid.
             */
            getReferenceTargetTypeId(): string;
            /**
             * Removes the entry with the given key from the map
             */
            remove(key: string): string;
            /**
             * Sets the reference to point to the given property object or to be equal to the given path string.
             */
            set(): void;
            /**
             * Inserts the reference that points  to the given property object or a given path string.
             */
            insert(key: string, value: string | BaseProperty | undefined): void;
            /**
             * Checks whether the reference is valid. This is either the case when it is empty or when the referenced
             * property exists.
             */
            isReferenceValid(in_key: string): boolean;
            /**
             * Sets the entry with the given key to the value passed in.
             */
            setValue(): void;
            /**
             * Returns the string value stored in the map
             * @param in_key the key of the reference
             * Returns: the path string
             */
            getValue<T = string>(in_key: string): T;
            /**
             * Given an object that mirrors a PSet Template, assigns the properties to the values
             * found in that object.
             * eg.
             * <pre>
             * Templates = {
             *   properties: [
             *     { id: 'foo', typeid: 'String' },
             *     { id: 'bar', properties: [{id: 'baz', typeid: 'Uint32'}] }
             *   ]
             * }
             * </pre>
             */
            setValues(): void;
            /**
             * Returns all entries of the map as an array.
             *
             * NOTE: This function creates a copy and thus is less efficient as getEntriesReadOnly.
             */
            getAsArray(): Array<BaseProperty | any>;
            /**
             * Returns all keys found in the map
             *
             * NOTE: This function creates a copy and thus is less efficient as getEntriesReadOnly.
             */
            getIds(): Array<string>;
            /**
             * Deletes all values from the Map
             */
            clear(): void;
            getAbsolutePath(): string;

        }

        class ValueMapProperty extends MapProperty {
            /**
             * A ValueMapProperty is a collection class that can contain an dictionary that maps from strings to primitive types.
             */
            constructor();
            /**
             * Inserts a value into the map. Using insert with a key that already exists will throw an error.
             */
            insert(in_key: string, in_value: any): void;
            /**
             * Sets the value of a property into the map.
             */
            set(in_key: string, in_value: any): void;
            /**
             * Given an object that mirrors a PSet Template, assigns the properties to the values
             * found in that object.
             * eg.
             * <pre>
             * Templates = {
             *   properties: [
             *     { id: 'foo', typeid: 'String' },
             *     { id: 'bar', properties: [{id: 'baz', typeid: 'Uint32'}] }
             *   ]
             * }
             * </pre>
             */
            setValues<T>(in_values: Object): void;
            /**
             * Removes the entry with the given key from the map
             */
            remove(key: string): any;
            /**
             * deprecated - replaced by set
             */
            setValue(): void;
            /**
             * Returns all entries of the map as an array.
             *
             * NOTE: This function creates a copy and thus is less efficient as getEntriesReadOnly.
             */
            getAsArray(): Array<BaseProperty | any>;
            /**
             * Returns all keys found in the map
             *
             * NOTE: This function creates a copy and thus is less efficient as getEntriesReadOnly.
             */
            getIds(): Array<string>;
            /**
             * Deletes all values from the Map
             */
            clear(): void;
        }

        class Float32MapProperty extends ValueMapProperty { }

        class Float64MapProperty extends ValueMapProperty { }

        class Uint32MapProperty extends ValueMapProperty { }

        class Uint16MapProperty extends ValueMapProperty { }

        class Uint8MapProperty extends ValueMapProperty { }

        class Int32MapProperty extends ValueMapProperty { }

        class Integer64MapProperty extends ValueMapProperty {
            // TODO: Add Int64 | Uint64 to the accepted values
            /**
             * Sets the entry with the given key to the value passed in
             *
             * Note: this will overwrite an already existing value
             *
             * @param in_key The key under which the entry is stored
             * @param in_value The value or property to store in the map
             */
            set(key: string, value: string | number): void;
        }

        class Int64MapProperty extends Integer64MapProperty { }

        class Uint64MapProperty extends Integer64MapProperty { }

        class Int16MapProperty extends ValueMapProperty { }

        class Int8MapProperty extends ValueMapProperty { }

        class StringMapProperty extends ValueMapProperty { }

        class BoolMapProperty extends ValueMapProperty { }

        class NamedNodeProperty extends NodeProperty {
            /**
             * A NamedNodeProperty is a NodeProperty that has a GUID which unique identifies the property object.
             * This makes it possible to store it in a set collection.
             * @param in_params List of parameters
             */
            constructor(in_params: NamedNodeProperty_NamedNodeProperty_in_params_TYPE);
            /**
             * Appends a property
             */
            insert(): void;
            /**
             * Removes the given property
             */
            remove(): BaseProperty;
            getGuid: NamedProperty['getGuid'];
            getId: NamedProperty['getId'];
            share: NamedProperty['share'];
            unshare: NamedProperty['unshare'];
            getShareInfo: NamedProperty['getShareInfo'];
        }
        class NodeProperty extends IndexedCollectionBaseProperty {
            /**
             * A property object that allows to add child properties dynamically.
             */
            constructor();
            isDynamic(): boolean;
            /**
             * Appends a property
             */
            insert(in_id: string, in_property: BaseProperty): void;
            /**
             * Removes the given property
             */
            remove(in_property: string | BaseProperty): BaseProperty;
            /**
             * Removes all dynamic children
             */
            clear(): void;
            /**
             * Stores the information to which CheckedOutRepositoryInfo object this root property belongs.
             * Note: these functions should only be used internally (within the PropertySets library)
             */
            protected _setCheckedOutRepositoryInfo(): void;
            /**
             * Stores the information to which CheckedOutRepositoryInfo object this root property belongs.
             * Note: these functions should only be used internally (within the PropertySets library)
             */
            protected _getCheckedOutRepositoryInfo(): CheckedOutRepositoryInfo | undefined;
            /**
             * Returns the name of all the static sub-properties of this property.
             */
            getStaticIds(): Array<string>;
            /**
             * Returns the name of all the dynamic sub-properties of this property.
             */
            getDynamicIds(): Array<string>;
            /**
             * Indicate that all static members have been added to the property
             *
             * This function is invoked by the PropertyFactory once all static members have been added to the template
             */
            protected _signalAllStaticMembersHaveBeenAdded(): void;
            /**
             * Returns the name of all the sub-properties of this property.
             */
            getIds(): Array<string>;
            /**
             * Cleans the cache of static children per typeid. Calling this should only be necessary if a template has been
             * reregistered.
             */
            protected _cleanStaticChildrenCache(): void;

        }

        class SetProperty extends IndexedCollectionBaseProperty {
          /**
           * A SetProperty is a collection class that can contain an unordered set of properties. These properties
           * must derive from NamedProperty and their URN is used to identify them within the set.
           */
          constructor();
          /**
           * Returns the path segment for a child
           * @param in_childNode - The child for which the path is returned
           * @return The path segment to resolve the child property under this property
           */
          protected _getPathSegmentForChildNode(in_childNode: NamedProperty): string;
          /**
           * Inserts a property into the set
           */
          insert(in_property: NamedProperty): void;
          /**
           * Adds a property to the set
           * - If the property's key exists, the entry is replaced with new one.
           * - If the property's key does not exist, the property is appended.*
           */
          set(): void;
          /**
           * Removes the given property from the set
           */
          remove(in_entry: NamedProperty | string): NamedProperty;
          /**
           * Returns the name of all the sub-properties of this property.
           */
          getIds(): Array<string>;
          /**
           * Given an object that mirrors a PSet Template, assigns the properties to the values
           * found in that object.
           * eg.
           * <pre>
           * Templates = {
           *   properties: [
           *     { id: 'foo', typeid: 'String' },
           *     { id: 'bar', properties: [{id: 'baz', typeid: 'Uint32'}] }
           *   ]
           * }
           * </pre>
           */
          setValues(): void;
          /**
           * Returns all entries of the set as an array.
           *
           * NOTE: This function creates a copy and thus is less efficient as getEntriesReadOnly.
           */
          getAsArray(): Array<NamedProperty>;
          /**
           * Delete all values from Set
           */
          clear(): void;
          /**
           * Returns the full property type identifier for the ChangeSet including the set type id
           * @param  in_hideCollection - if true the collection type (if applicable) will be omitted
           *                since that is not aplicable here, this param is ignored. Default to false
           * @return The typeid
           */
          getFullTypeid(in_hideCollection: boolean): string;
        }

        class PropertyTemplate {
            /**
             * Constructor for creating a PropertyTemplate based on the given parameters.
             * @param in_params List of parameters
             */
            constructor(in_params: PropertyTemplateType);
            /**
             * Clones the PropertyTemplate
             */
            clone(): PropertyTemplate;
            /**
             * Return the version number of the template.
             */
            getVersion(): string;
            /**
             * Return the serialized parameters passed in the constructor
             */
            serialize(): PropertyTemplateType;
            /**
             * Return the serialized parameters passed in the constructor, in a template canonical form
             */
            serializeCanonical(): object;
            /**
             * Return the typeid of the template without the version number
             * i.e. autodesk.core:color instead of autodesk.core:color-1.0.0
             */
            getTypeidWithoutVersion(): string;
            /**
             * Determines if the argument is a template structure
             */
            public isTemplate(): Boolean;
            /**
             * Extracts typeids directly referred to in a template
             */
            public extractDependencies(): Array<any>;

            constants: any[];

            context: string;

            id: string;

            inherits: string[];

            annotation: { [key: string]: string };

            properties: any[];

            typeid: string;
        }

        class BaseProperty {
            /**
             * Default constructor for BaseProperty
             * @param in_params List of parameters
             */
            constructor(in_params: BaseProperty_BaseProperty_in_params_TYPE);
            getTypeid(): string;
            getContext(): string;
            /**
             * Returns the full property type identifier for the ChangeSet including the enum type id
             * @param  in_hideCollection  if true the collection type (if applicable) will be omitted
             *                since that is not applicable here, this param is ignored. Default to false
             * @return The typeid
             */
            getFullTypeid(in_hideCollection?: boolean): string;
            /**
             * Is this property the root of the property set tree?
             */
            isRoot(): boolean;
            /**
             * Is this property the ancestor of in_otherProperty?
             * Note: A property is not considered an ancestor of itself
             */
            isAncestorOf(): boolean;
            /**
             * Is this property the descendant of in_otherProperty?
             * Note: A property is not considered a descendant of itself
             */
            isDescendantOf(): boolean;
            /**
             * Get the parent of this property
             */
            getParent(): BaseProperty | undefined;
            /**
             * checks whether the property is dynamic (only properties inheriting from NodeProperty are)
             */
            isDynamic(): boolean;
            /**
             * Modifies the property according to the given changeset
             */
            applyChangeSet(in_changeSet: SerializedChangeSet): void;
            /**
             * Removes the dirtiness flag from this property and recursively from all of its children
             */
            public cleanDirty(flags?: MODIFIED_STATE_FLAGS_ENUM): void
            /**
             * Indicates that the property has been modified and a corresponding modified call has not yet been sent to the
             * application for runtime scene updates.
             */
            isDirty(): boolean;
            /**
             * The property has pending changes in the current ChangeSet.
             */
            hasPendingChanges(): boolean;
            /**
             * Returns the ChangeSet of all sub-properties
             */
            getPendingChanges(): ChangeSet;
            /**
             * Get the id of this property
             */
            getId(): string | undefined;
            /**
             * Sets the checkoutview.
             */
            protected _setCheckoutView(): void;

            /**
             * Returns the Workspace
             */
            getWorkspace(): any | undefined;
            /**
             * Returns the path segment for a child
             * @param in_childNode - The child for which the path is returned
             * @return  The path segment to resolve the child property under this property
             */
            protected _getPathSegmentForChildNode(in_childNode: BaseProperty): string;
            /**
             * Resolves a direct child node based on the given path segment
             *
             * @param in_segment  The path segment to resolve
             * @param  in_segmentType - The type of segment in the tokenized path
             *
             * @return  The child property that has been resolved
             * @protected
             */
            protected _resolvePathSegment(in_segment: string, in_segmentType: TOKEN_TYPES_TYPE): BaseProperty | undefined;
            /**
             * Return a clone of this property
             */
            clone(): BaseProperty;
            /**
             * Returns true if the property is a primitive type
             */
            isPrimitiveType(): boolean;
            /**
             * Repeatedly calls back the given function with human-readable string representations
             * of the property and of its sub-properties. By default it logs to the console.
             * If printFct is not a function, it will default to console.log
             */
            prettyPrint(printFn?: (...args: any[]) => any): void;
            /**
             * Returns the path from the given from_property to this node if such a path exists.
             * If more than one paths exist (as might be the case with multiple repository references
             * pointing to the same repository), it will return the first valid path found.
             * For example, if you have this structure:
             * <code>prop1
             * --prop2
             * ----prop3</code>
             * and call: <code>prop1.getRelativePath(prop3);</code>
             * You will get the path from prop3 to prop1, which would be '../../'
             */
            getRelativePath(from_property: BaseProperty): string;
            /**
             * Returns the path from the root of the workspace to this node
             * (including a slash at the beginning)
             */
            getAbsolutePath(): string;
            /**
             * Traverses the property hierarchy upwards until the a node without parent is reached
             */
            traverseUp(): string | undefined;
            /**
             * Returns the root of the property hierarchy
             */
            getRoot(): NodeProperty;
            /**
             * Deserialize takes a currently existing property and sets it to the hierarchy described in the normalized
             * ChangeSet passed as parameter. It will return a ChangeSet that describes the difference between the
             * current state of the property and the passed in normalized property
             */
            deserialize(in_serializedObj: SerializedChangeSet): SerializedChangeSet;
            /**
             * Serialize the property
             * @param in_options Options for the serialization
             */
            serialize(in_options?: BaseProperty_serialize_in_options_TYPE): object;
            /**
             * Indicate that all static members have been added to the property
             *
             * This function is invoked by the PropertyFactory once all static members have been added to the template
             */

            /**
             * Removes the dirtiness flag from this property and recursively from all of its children
             */
            cleanDirty(): void;
            protected _signalAllStaticMembersHaveBeenAdded(): void;
            static REFERENCE_RESOLUTION: REFERENCE_RESOLUTION_ENUM;
            static MODIFIED_STATE_FLAGS: MODIFIED_STATE_FLAGS_ENUM;
            static PATH_TOKENS: PATH_TOKENS_ENUM;

            value: any;
        }

        class NamedProperty extends ContainerProperty {
            /**
             * A NamedProperty has a URN which uniquely identifies the property object. This makes it possible to store it in a
             * set collection.
             * @param in_params List of parameters
             */
            constructor(in_params: NamedProperty_NamedProperty_in_params_TYPE);
            /**
             * Returns the GUID of this named property
             * A Guid is a unique identifier for a branch, commit or repository,
             * similar to a URN. Most functions in the API will us a URN but the
             * Guid is used to traverse the commit graph.
             */
            getGuid(): string;
            /**
             * Returns a string identifying the property
             * If an id has been explicitly set on this property we return that one, otherwise the GUID is used.
             * @return String identifying the property
             */
            getId(): string;
            /**
             * Share property with given subject(s)
             */
            share(permissions: NamedProperty_share_permission_TYPE, options?: NamedProperty_share_options_TYPE): Promise<any>;
            /**
             * Unshare property with given subject(s)
             */
            unshare(permissions: NamedProperty_unshare_permission_TYPE, options?: NamedProperty_unshare_options_TYPE): Promise<any>;
            /**
             * Get share info for the property
             */
            getShareInfo(): Promise<any>;
        }

        class ReferenceProperty extends ValueProperty {
            /**
             * This class serves as a view to read, write and listen to changes in an
             * object's value field. To do this we simply keep a pointer to the object and
             * it's associated data field that we are interested in. If no data field is
             * present this property will have an undefined value.
             */
            constructor();
            /**
             * Returns the typeid for the target of this reference
             *
             * Note: This is the type that is specified in the typeid of this reference and not the actual type
             * of the referenced object, which might inherit from that typeid.
             */
            getReferenceTargetTypeId(): string;
            /**
             * Resolves the referenced property
             * @param in_ids the ID of the property or an array of IDs
             *       if an array is passed, the .get function will be performed on each id in sequence
             *       for example .get(['position','x']) is equivalent to .get('position').get('x').
             *       If .get resolves to a ReferenceProperty, it will return the property that the ReferenceProperty
             *       refers to.
             * @param in_options parameter object
             */
            get<T extends BaseProperty>(in_ids?: string | number | Array<string | number>, in_options?: ReferenceProperty_get_in_options_TYPE): T | undefined;
            /**
             * Expand a path returning the value or property at the end.
             * @param in_path the path
             * @param in_options parameter object
             */
            resolvePath<T = BaseProperty>(in_path: string, in_options?: ReferenceProperty_resolvePath_in_options_TYPE): T | undefined;
            /**
             * Sets the reference to point to the given property object
             */
            set(in_property?: BaseProperty): void;
            /**
             * Checks whether the reference is valid. This is either the case when it is empty or when the referenced
             * property exists.
             */
            isReferenceValid(): boolean;

            /**
             * Evaluates Reference properties as primitives.
             * @return true since Reference properties are primitives.
             */
            isPrimitiveType(): boolean;
        }

        class RepositoryReferenceProperty extends ContainerProperty {
            /**
             * A RepositoryReferenceProperty is used to manage references in between repositories. It stores the
             * reference to a commit in a separate repository (by storing a repository, branch and commit GUID).
             * Adding such a property will trigger loading the corresponding sub-tree into the view.
             *
             * // TODO: Should this inherit from a NamedProperty?
             * @param in_params List of parameters
             */
            constructor(in_params: RepositoryReferenceProperty_RepositoryReferenceProperty_in_params_TYPE);
            /**
             * This method enable write on repository reference by turning then into workspace.
             * Workspace method are then available by calling .getReferencedWorkspace().
             * This will automatically move you to the head of the branch.
             * It will then follow the branch.
             * This change is persisted through the followBranch property.
             */
            enableWrite(): Promise<any>;
            /**
             * This method disable write on repository reference.
             * This change is persisted through the followBranch property.
             */
            disableWrite(): void; getReferencedWorkspace(): Workspace;
            /**
             * Returns the state of this RepositoryReferenceProperty
             */
            getState(): STATE_TYPE;
            /**
             * Load a reference
             */
            load(): void;
            /**
             * Returns the root property of the referenced repository
             */
            getReferencedRepositoryRoot(): NodeProperty;
            /**
             * Checks whether the referenced properties are available
             */
            areReferencesAvailable(): Boolean;
            /**
             * Update the reference and set it to the given commit, branch and repository
             * TODO: Can we also provide automatic updates for the repository when this property is already in a repository?
             */
            updateReference(): void;
            /**
             * Returns an object with all the nested values contained in this property
             */
            getValues<T = object>(): T;
            static STATE: STATE_TYPE;
        }


        /**
         * A primitive property for a boolean value
         */
        class BoolProperty extends ValueProperty<boolean> { }

        class EnumProperty extends Int32Property {
            /**
             * A primitive property for enums.
             */
            constructor();
            /**
             * Returns the current enum string
             */
            getEnumString(): string;
            /**
             * Sets the (internal, integer) value of the property
             */
            setValue(): void;
            /**
             * Sets the property by an enum string
             */
            setEnumByString(): void;
            /**
             * Returns the full property type identifier for the ChangeSet including the enum type id
             * @param  in_hideCollection - if true the collection type (if applicable) will be omitted
             *                since that is not applicable here, this param is ignored. Default to false
             * @return The typeid
             */
            getFullTypeid(in_hideCollection: boolean): string;
            /**
             * let the user to query all valid entries of an enum
             */
            getValidEnumList(): { [key: string]: { value: any, annotation: any } };
            /**
             * Returns true if the property is a primitive type
             */
            isPrimitiveType(): boolean;

        }

        /**
         * A primitive property for a 32 bit floating point value.
         */
        class Float32Property extends ValueProperty<number> { }

        /**
         * A primitive property for a 64 bit floating point value.
         */
        class Float64Property extends ValueProperty<number> { }

        /**
         * A primitive property for an signed 8 bit integer value.
         */
        class Int8Property extends ValueProperty<number> { }

        /**
         * A primitive property for an signed 16 bit integer value.
         */
        class Int16Property extends ValueProperty<number> { }

        /**
         * A primitive property for an signed 32 bit integer value.
         */
        class Int32Property extends ValueProperty<number> { }

        class Integer64Property extends ValueProperty<number> {
            /**
             * A primitive property base class for big integer values.
             */
            constructor();
            getValueHigh(): number;
            getValueLow(): number;
            setValueHigh(value: number): boolean;
            setValueLow(value: number): boolean;
            /**
             * The toString() method returns a string representing the specified Integer64 object.
             */
            toString(): string;
            /**
             * The Integer64.fromString() method parses a string argument updates object's lower and higher 32 bit integer parts.
             */
            fromString(): void;
        }

        /**
         * A primitive property class for big signed integer values.
         */
        class Int64Property extends Integer64Property {
            setValue(): void;
        }

        /**
         * A primitive property class for big unsingned integer values.
         */
        class Uint64Property extends Integer64Property {
            setValue(): void;
        }

        /**
         * A primitive property for an unsigned 8 bit integer value.
         */
        class Uint8Property extends ValueProperty<number> { }

        /**
         * A primitive property for an unsigned 16 bit integer value.
         */
        class Uint16Property extends ValueProperty<number> { }

        /**
         * A primitive property for an unsigned 32 bit integer value.
         */
        class Uint32Property extends ValueProperty<number> { }

        class ValueProperty<T = any> extends BaseProperty {
            /**
             * This class serves as a view to read, write and listen to changes in an
             * object's value field. To do this we simply keep a pointer to the object and
             * its associated data field that we are interested in. If no data field is
             * present this property will fail constructing.
             * @param in_params the parameters
             */
            constructor(in_params: ValueProperty_ValueProperty_in_params_TYPE);
            /**
             * returns the current value of ValueProperty
             */
            getValue(): T;
            setValue(in_value: T): void;
        }

        class CheckedOutRepositoryInfo {
            /**
             * Data-structure that contains information about a specific check out state for a given repository
             */
            constructor();

        }

        class ScopeProperty {
            /**
             * Dummy property used to return the scope to the underlying properties
             * @param in_params BaseProperty parameters
             */
            constructor(in_params: ScopeProperty_ScopeProperty_in_params_TYPE);

        }

        class _createTemplateValidator {
            /**
             * Creates an instance of the TemplateValidator
             */
            constructor();

        }

        /**
         * Switch off validation to increase performance (but you risk modifying read only properties, creating cycles in
         * the tree, etc...)
         *
         * @param enabled - Are the validations enabled?
         */
        function enableValidations(enabled : boolean);
    }
    export = PROPERTY_TREE_NS;
}
