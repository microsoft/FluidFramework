/**
 * @fileoverview This file was derived from using the tsd-jsdoc tool (https://www.npmjs.com/package/tsd-jsdoc).
 * Specifically, by running 'jsdoc -t node_modules/tsd-jsdoc -r src/' in the databinder repo. The following
 * modifications had to be made after running this tool (ideally, the above tool would output the correct
 * declaration file without modification):
 *
 * 1. The addition of a 'declare module' statement so that *.ts files that import '@adsk/forge-appfw-databinder'
 *    pick up definitions from this file.
 * 2. By wrapping everything in the 'declare module' statement, all of the 'declare' statements had to change to
 *    'export'.
 * 3. tsd-jsdoc appears to not handle object parameters correctly, adding them as
 *    (params: any, params.arg0: any, ..., params.argn: any), which is a syntax error in typescript.
 */
declare module "@fluid-experimental/property-binder" {
    import { BaseProperty, ContainerProperty, ValueProperty, Workspace } from '@adsk/forge-hfdm';
    namespace ForgeAppfwDatabinder {
        class DataBinderHandle {
            constructor(
                destroyCallback: (handle: DataBinderHandle, userData: Object|undefined) => void,
                userData?: Object
            );
            valid(): boolean;
            destroy(): void;
        }
        // This type name was incorrect -- keeping for backwards compatibility
        type DataBinderRegistrationHandle = DataBinderHandle;

        enum UpgradeType {
            NONE = 0,     // Only applies for exact matches
            PATCH = 1,    // Allow a higher patch version
            MINOR = 2,    // Allow a higher minor version
            MAJOR = 3,    // Allow a higher major version
        }

        /**
         * @classdesc Provides the abstract base class for all contexts passed to data binding callbacks.
         * @alias BaseContext
         * @public
         */
        class BaseContext {
            constructor(in_operationType: any, in_context: any, in_path: any, in_DataBinding?: DataBinding, in_nestedChangeSet?: any, in_retroactive?: any);

            /**
             * Returns the nested ChangeSet for this modification
             * @return {external:SerializedChangeSet} The ChangeSet that corresponds to this modification
             * @public
             */
            getNestedChangeSet(): any;

            /**
             * Returns the operation type
             * @return {String} one of 'insert', 'modify' or 'remove'
             * @public
             */
            getOperationType(): string;

            /**
             * Returns the modification property context if defined (it's not defined for remove operations)
             * @return {String} one of 'single', 'map', 'set', 'array', 'template', 'root', or ''
             * @public
             */
            getContext(): string;

            /**
             * Returns the absolute (full) path from the root of the workspace to the modification
             * @return {string} the path
             * @public
             */
            getAbsolutePath(): string;

            /**
             * Returns the data binding (if it exists) at the path associated with this the modification.
             * If an optional DataBindingType is supplied, data bindings that correspond to that type are returned, otherwise data
             * bindings which have the same type as the binding that triggered the event of this modificationContext are returned.
             * @param {String} [in_bindingType] - The requested data binding type. If none has been given, data bindings with
             *   the same data binding type as the DataBinding that triggered this modification context are returned
             * @return {DataBinding|undefined} - a data binding (of the given
             * type) which may be empty, if no data binding of the given type is present at the path associated
             * with this modification.
             * @public
             */
            getDataBinding(in_bindingType?: string): DataBinding | any;

            /**
             * Returns the Property at the root of the modification (if it exists).
             * @return {external:BaseProperty|undefined} - the property at the root of this modification
             * @public
             */
            getProperty(): BaseProperty | undefined;

            /**
             * When a new DataBinding is registered, data bindings will be created for newly-created properties that
             * arrive in the future, or retroactively on existing properties. This flag answers whether the modification
             * is being handled retroactively.
             * @return {boolean} true if this modification is being done retroactively.
             * @public
             */
            isRetroactive(): boolean;

            /**
             * clones the context object
             * @return {BaseContext} the cloned context
             * @package
             * @hidden
             */
            _clone(): BaseContext;

        }

        /**
         * A Component that is defined in the `@adsk/forge-appfw-hfdm` package and represents an HFDM workspace.
         */
        type HFDMWorkspaceComponent = {
          initializeComponent(): Promise<Workspace>
        }

        /**
         * @classdesc  A DataBinder allows one to register a number of bindings for different HFDM property types. The
         * DataBinder can then be bound to
         * a {@link https://pages.git.autodesk.com/LYNX/HFDM_SDK/doc/latest/Workspace.html|Workspace} to have the
         * data bindings created automatically.
         * These data bindings are notified of the modification and removal of the underlying HFDM property.
         *
         * Default provider registration type: <i>DataBinderComponent</i>.
         *
         * It depends on:
         * - HFDMWorkspaceComponent: A component that represents an HFDM workspace.
         *
         * You can use this component without calling an `initializeComponent` method.
         * @public
         */
        class FluidBinder {

            /**
             * Constructor for the DataBinder.
             * @param in_workspace - The Workspace to bind to.
             */
            constructor(in_workspace?: Workspace | HFDMWorkspaceComponent);

            /**
             * Registers a data binding.
             * @param {String} in_bindingType             - The type of the binding.  (ex. 'VIEW', 'DRAW', 'UI', etc.)
             * @param {String} in_typeid                  - The id to use for this registration, usually the type id of the
             *                                              objects being represented (like a PropertySet template id).
             * @param {function} in_constructor           - The constructor for the data binding. Must take a parameter object as
             *                                              its only argument.
             * @param {object} [in_options]               - An object containing optional parameters.
             * @param {String} [in_options.includePrefix] - the binding is only created when this parameter is a prefix of
             *                                              its path in the workspace. Defaults to the empty string.
             * @param {String} [in_options.excludePrefix] - the binding is only created when this parameter is not a prefix of its
             *                                              path in the workspace. Defaults to the empty string and in this
             *                                              case it's ignored.
             * @param {String} [in_options.exactPath]     - the binding is only created when its path in the workspace is exactly
             *                                              this parameter. Defaults to the empty string and in this case it's
             *                                              ignored. If both in_options.exactPath and at least one of
             *                                              in_options.includePrefix/in_options.excludePrefix are specified, then
             *                                              in_options.exactPath takes precedence.
             * @param {Object} [in_options.userData]      - A user supplied object that will be passed to each binding created
             * @return {DataBinder~DataBinderHandle|undefined} A handle that can be used to unregister this data
             *  binding. It returns undefined if an data binding of the same time is already registered
             * @public
             * @hidden
             */
            _createHandle(in_bindingType: any, in_typeid: any, in_constructor: any, in_options?: any): DataBinderHandle | any;

            /**
             * Registers a singleton data binding. The provided singleton will be called for all bindings.
             * @param {string} in_bindingType             - The type of the binding.  (ex. 'VIEW', 'DRAW', 'UI', etc.)
             * @param {string} in_typeid                  - The id to use for this registration, usually the type id of the
             *                                              objects being represented (like a PropertySet template id).
             * @param {DataBinding} in_singleton          - The singleton to bind. Must take a parameter object as its
             *                                              only argument.
             * @param {object} [in_options]               - An object containing optional parameters.
             * @param {string} [in_options.includePrefix] - the binding is only created when this parameter is a prefix of
             *                                              its path in the workspace. Defaults to the empty string.
             * @param {string} [in_options.excludePrefix] - the binding is only created when this parameter is not a prefix of its
             *                                              path in the workspace. Defaults to the empty string and in this
             *                                              case it's ignored.
             * @param {string} [in_options.exactPath]     - the binding is only created when its path in the workspace is exactly
             *                                              this parameter. Defaults to the empty string and in this case it's
             *                                              ignored. If both in_options.exactPath and at least one of
             *                                              in_options.includePrefix/in_options.excludePrefix are specified, then
             *                                              in_options.exactPath takes preference.
             * @param {Object} [in_options.userData]      - A user supplied object that will be passed to each binding created
             * @return {Object}                           - A handle that can be used to unregister this data binding
             */
            registerSingleton(in_bindingType: string, in_typeid: string, in_singleton: DataBinding, in_options?: any): any;

            /**
             * Registers a new data binding. Either includePrefix or exactPath MUST be specified. This function will
             * retroactively create bindings
             * @param {string} in_bindingType              - The type of the data binding.  (ex. 'BINDING', 'DRAW', 'UI', etc.)
             * @param {string} in_typeid                   - The id to use for this registration, usually the type id of the
             *                                               objects being represented (like a PropertySet template id).
             * @param {function} in_dataBindingConstructor - The constructor for the data binding. Must take a parameter object
             *                                               as its only argument.
             * @param {object} in_options                  - An object containing additional parameters.
             * @param {string} [in_options.includePrefix]  - the data binding is only created when this parameter is a prefix of
             *                                               its path in the workspace. Defaults to the empty string.
             * @param {String} [in_options.excludePrefix]  - the binding is only created when this parameter is not a prefix of its
             *                                               path in the workspace. Defaults to the empty string and in this
             *                                               case it's ignored.
             * @param {String} [in_options.exactPath]      - the binding is only created when its path in the workspace is exactly
             *                                               this parameter. Defaults to the empty string and in this case it's
             *                                               ignored. If both in_options.exactPath and at least one of
             *                                               in_options.includePrefix/in_options.excludePrefix are specified, then
             *                                               in_options.exactPath takes precedence.
             * @param {Object} [in_options.userData]       - A user supplied object that will be passed to each Data Binding created
             * @return {Object}                            - A handle that can be used to unregister this data binding
             * @public
             */
            register(in_bindingType: string, in_typeid: string, in_dataBindingConstructor: any, in_options?: any): any;

            /**
             * Delay the registration of bindings until the popRegistrationScope.
             * @public
             * @deprecated please use {@link DataBinder#pushBindingActivationScope} instead
             */
            pushRegistrationScope(): void;

            /**
             * Pop the registration scope. When the push and pop balance themselves, any pending
             * registrations will be done, and all the entities will be created
             * @public
             * @deprecated Please use {@link DataBinder#popBindingActivationScope} instead
             */
            popRegistrationScope(): void;

            /**
             * A unique key per running application; each instance of the databinder will have a different Id.
             *
             * @return {number} The id of this DataBinder instance.
             * @public
             */
            getDataBinderId(): number;

            /**
             * Normalize the paths provided for registration - ensure there's a / - and compute the starting path
             * @param {Object} in_options - the path options from a registration handle
             * @return {{startPath: string, exactPath: string, excludePrefix: string}} the normalized paths
             * @hidden
             */
            _parsePathOptions(in_options: any): any;

            /**
             * Registers a handler that is called every time a ChangeSet affects a given path
             * @param {String}   in_absolutePath - Path to register the handler for
             * @param {Array.<string>} in_operations -
             *     the operations for which the callback function gets called
             *     (of of 'insert', 'modify', 'remove', 'collectionInsert', 'collectionModify', 'collectionRemove')
             * @param {Function} in_callback - The callback to invoke
             * @param {Object}         [in_options] -
             *     Additional user specified options for the callback and its registration
             * @param {Boolean} [in_options.isDeferred] - If true,
             *                    the callback is wrapped into requestChangesetPostProcessing
             * @return {DataBinder~DataBinderHandle} A handle that can be used to unregister the callback
             * @public
             */
            registerOnPath<TBinding extends DataBinding>(in_absolutePath: any, in_operations: string[], in_callback: ((this: TBinding, context: any) => any) | ((this: TBinding, key: string, context: any) => any) | ((this: TBinding, key: number, context: any) => any), in_options?: any): DataBinderHandle;

            /**
             * Attaches this data binder to the given Workspace. The change sets produced by the Workspace will be
             * processed and the corresponding data bindings will be created, updated or removed as appropriate.
             * @param {external:Workspace} workspace - The Workspace to bind to.
             * @public
             */
            attachTo(workspace: any): void;

            /**
             * Detaches from a Workspace if currently bound. All existing data bindings instances will
             * be destroyed as if the properties had been removed from the workspace.
             *
             * If in_unregisterAll is true (the default), all DataBindings are undefined and deactivated.
             * If false, it will leave them, and when attaching to a new Workspace, the DataBindings will
             * be applied.
             *
             * @param {Boolean=} [in_unregisterAll=true] if true (the default), all DataBindings are undefined and
             *   deactivated. If false, they remain, and will apply
             * @public
             */
            detach(in_unregisterAll?: boolean): void;

            /**
             * Forcibly unregister all DataBindings that are still registered with this databinder.
             * @public
             */
            unregisterAllDataBinders(): void;

            /**
             * Return true if this DataBinder is attached to a Workspace.
             * @return {boolean} true if the DataBinder is attached to a Workspace.
             * @public
             */
            isAttached(): boolean;

            /**
             * Return the data bindings (if any) that correspond to the given path or property. May be filtered by binding type.
             * @param {string|external:BaseProperty} in_pathOrProperty - Absolute path to a data binding or property corresponding
             * to a data binding
             * @param {string} [in_bindingType]  - The requested bindingType. If none has been given, all bindings will be returned
             * @return {Array.<DataBinding>|DataBinding} An array of data bindings (either of the given type or all in
             * registration order) which may be empty if no suitable bindings are present at the given path. If a binding type is
             * provided, only one data binding is returned
             * @public
             */
            resolve<T extends DataBinding = DataBinding>(in_pathOrProperty: string | BaseProperty, in_bindingType: string): T;
            resolve<T extends DataBinding = DataBinding>(in_pathOrProperty: string | BaseProperty): T[];
            /**
             * Return the removed Data Binding (if any) that correspond to the given path and type.
             * @param {string} in_path       - absolute path to an data binding
             * @param {string} in_bindingType - The requested bindingType
             * @return {DataBinding|undefined} - A data binding (of the given
             * type) which may be undefined if no suitable data binding is present at the given path.
             * @package
             * @hidden
             */
            _resolveRemovedDataBindingByType(in_path: string, in_bindingType: string): DataBinding | any;

            /**
             * @param {function} callback - A post creation callback function for each data binding called
             *                                            after the changeSet has been processed
             * @param {Object} context - The value to be passed as
             *                      the this parameter to the target function when the bound function is called
             * @public
             */
            requestChangesetPostProcessing(callback: any, context?: any): void;

            /**
             * @return {external:Workspace|undefined} Workspace the Databinder is attached to
             * @public
             */
            getWorkspace(): Workspace | undefined;

            /**
             * @return {DataBinderHandle} A handle that can be used to deactivate this instance of the binding
             * @public
             */
            activateDataBinding(in_bindingType: string, in_typeID?: string, in_options?: any): DataBinderHandle;

            /**
             * @return {boolean} true if the databinding pair is registered
             */
            hasDataBinding(in_bindingType: string, in_typeID: string): boolean;

            /**
             * @return {DataBinderHandle} A handle that can be used to undefine the binding
             * @public
             */
            defineDataBinding(in_bindingType: string, in_typeID: string, in_bindingConstructor: any, in_options?: any): DataBinderHandle;

            /**
             * Delay the activation of bindings until the popBindingActivationScope.
             *
             * @public
             */
            pushBindingActivationScope(): void;

            /**
             * Pop the activation scope. When the push and pops balance themselves, any pending
             * binding activations will be done, and all the corresponding bindings will be created.
             *
             * @public
             */
            popBindingActivationScope(): void;

            /**
             * Register a generator to be used to build a new runtime representation for the given bindingType / typeID.
             * The function will be called lazily based on calls to {@link DataBinder#getRepresentation}.
             * By design, the generator functions can themselves call getRepresentation for other properties in the system, and
             * their generators will be recursively built. The DataBinder will detect cycles in these inter-dependencies but
             * does not directly resolve them.
             * It is possible to define runtime representations for multiple levels of an inherited type. When
             * {@link DataBinder#getRepresentation} is called for a property, the most specialized runtime represenation
             * registered will be called. Care should be taken by the user to ensure all runtime representations are defined
             * before they begin to be built.
             *
             * @param {string} bindingType - The binding type to associate this runtime representation with. Allows multiple
             * runtime representations to be built for the same property.
             * @param {string} typeID - The type id for which to generate this runtime representation. Care must be taken when
             * defining types that inherit from each other; all types should be registered before the runtime representations
             * begin to be created.
             * @param {representationGenerator} generator - Callback to create a new runtime representation for the provided
             * property. The bindingType, and the userData specified here in the options are provided to the callback function.
             * Note, if the creation needs to be broken into two states, see the options.initializer option.
             * @param {Object=} options - Options block
             * @param {representationInitializer=} options.initializer - Optional callback called immediately after the
             *   generator result is added to the databinder.
             * @param {representationDestroyer=} options.destroyer - Optional callback to clean up a runtime object as it is being
             * removed from the DataBinder, due to the property being destroyed, or unregistering of the runtime representation.
             * After this function is called, the runtime representation is no longer known by the DataBinder, but there are
             * no guarantees that the instance is not in use in another system.
             *
             * @example
             * // Register a generator for runtime representations for the Dog Property
             * myDataBinder.defineRepresentation('PETSTORE', 'Types:Dog-1.0.0', (property) => new DogRepresentation());
             *
             * // Get an HFDM workspace and insert a new property
             * const workspace = getHFDMWorkspace();
             * myDataBinder.attachTo(workspace);
             *
             * workspace.insert('Fido', PropertyFactory.create('Types:Dog-1.0.0', 'single'));
             *
             * // Request the runtime representation associated with the property
             * const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
             * console.assert(fido instanceof DogRepresentation);
             *
             * @return {DataBinderHandle} A handle to permit unregistering of the runtime representation
             *
             * @throws If there is already runtime representation associated with the provided bindingType/typeID.
             *
             * @public
             */
            defineRepresentation(
                bindingType: string,
                typeID: string,
                generator: (property: BaseProperty, bindingType: string, userData?: any | undefined) => any,
                options?: {
                    destroyer?: (representation: any, bindingType: string, userData: any | undefined) => void;
                    initializer?: (repesentation: any, property: BaseProperty, bindingType: string) => void;
                    stateless?: boolean;
                    userData?: any;
                    upgradeType?: UpgradeType;
                }
            ): any;

            /**
             * Return the representation associated to the given property, for the particular binding type.
             * If the representation has not been built before, it will be created on the fly.
             *
             * @param {external:BaseProperty} property - The property for which we want the runtime representation
             * @param {string} bindingType - The binding type of the runtime representation
             *
             * @return {Object|undefined} the initialized runtime representation, or undefined if there is none registered
             *
             * @throws If there is a cycle in the generators for the creation of the runtime representations. Avoid the cyclic
             * calls, or use the 'initializer' option when specifying the generator in {@link DataBinder#defineRepresentation}
             * @throws If the generator or a recursively-used generator fails to return a runtime representation when called.
             * @throws If not connected to a workspace
             * @throws If the property is not in the workspace the DataBinder is attached to.
             *
             * @public
             */
            getRepresentation<T>(property: BaseProperty, bindingType: string): T | undefined;

            /**
             * Return the representation associated to the given property, for the particular binding type.
             * If the representation has not been built before, it will be created on the fly.
             *
             * @param {string} path - The path to the property for which we want the runtime representation
             * @param {string} bindingType - The binding type of the runtime representation
             *
             * @return {Object|undefined} the initialized runtime representation, or undefined if there is none registered
             *
             * @throws If there is a cycle in the generators for the creation of the runtime representations. Avoid the cyclic
             * calls, or use the 'initializer' option when specifying the generator in {@link DataBinder#defineRepresentation}
             * @throws If the generator or a recursively-used generator fails to return a runtime representation when called.
             * @throws If not connected to a workspace
             * @throws If the property is not in the workspace the DataBinder is attached to.
             *
             * @public
             */
            getRepresentationAtPath<T>(path: string, bindingType: string): T | undefined;

            /**
             * Return the unique id for the current/last changeset to be processed.
             * This id is guaranteed to change for every changeset that enters.
             *
             * @return {Number} A unique changeset id, greater than or equal to zero.
             *
             * @public
             */
            public getCurrentChangeSetId(): number;

            /**
             * Defines the dependencies of this component in a format that the Forge DI system is able to parse.
             * Note that the order of dependencies must match the order of constructor parameters.
             * @return Array of dependency definitions
             *
             * @public
             */
            static defineDependencies(): any[];

            /**
             * The initialization method of this component.
             * @return {Promise<DataBinder>} A promise that resolves as soon as the component has been initialized and
             *  rejects on error. Unlike most other components, the DataBinder can already be used before this promise
             *  resolves, for example to register DataBindings.
             * @public
             */
            public initializeComponent(): Promise<DataBinder>;

            /**
             * Uninitialize the component instance.
             * @return {Promise<void>} A promise that resolves as soon as the instance is fully uninitialized and
             *  rejects on error.
             */
            public uninitializeComponent(): Promise<void>;
        }

        class DataBinder {

            /**
             * Constructor for the DataBinder.
             * @param in_workspace - The Workspace to bind to.
             */
            constructor(in_workspace?: Workspace | HFDMWorkspaceComponent);

            /**
             * Registers a data binding.
             * @param {String} in_bindingType             - The type of the binding.  (ex. 'VIEW', 'DRAW', 'UI', etc.)
             * @param {String} in_typeid                  - The id to use for this registration, usually the type id of the
             *                                              objects being represented (like a PropertySet template id).
             * @param {function} in_constructor           - The constructor for the data binding. Must take a parameter object as
             *                                              its only argument.
             * @param {object} [in_options]               - An object containing optional parameters.
             * @param {String} [in_options.includePrefix] - the binding is only created when this parameter is a prefix of
             *                                              its path in the workspace. Defaults to the empty string.
             * @param {String} [in_options.excludePrefix] - the binding is only created when this parameter is not a prefix of its
             *                                              path in the workspace. Defaults to the empty string and in this
             *                                              case it's ignored.
             * @param {String} [in_options.exactPath]     - the binding is only created when its path in the workspace is exactly
             *                                              this parameter. Defaults to the empty string and in this case it's
             *                                              ignored. If both in_options.exactPath and at least one of
             *                                              in_options.includePrefix/in_options.excludePrefix are specified, then
             *                                              in_options.exactPath takes precedence.
             * @param {Object} [in_options.userData]      - A user supplied object that will be passed to each binding created
             * @return {DataBinder~DataBinderHandle|undefined} A handle that can be used to unregister this data
             *  binding. It returns undefined if an data binding of the same time is already registered
             * @public
             * @hidden
             */
            _createHandle(in_bindingType: any, in_typeid: any, in_constructor: any, in_options?: any): DataBinderHandle | any;

            /**
             * Registers a singleton data binding. The provided singleton will be called for all bindings.
             * @param {string} in_bindingType             - The type of the binding.  (ex. 'VIEW', 'DRAW', 'UI', etc.)
             * @param {string} in_typeid                  - The id to use for this registration, usually the type id of the
             *                                              objects being represented (like a PropertySet template id).
             * @param {DataBinding} in_singleton          - The singleton to bind. Must take a parameter object as its
             *                                              only argument.
             * @param {object} [in_options]               - An object containing optional parameters.
             * @param {string} [in_options.includePrefix] - the binding is only created when this parameter is a prefix of
             *                                              its path in the workspace. Defaults to the empty string.
             * @param {string} [in_options.excludePrefix] - the binding is only created when this parameter is not a prefix of its
             *                                              path in the workspace. Defaults to the empty string and in this
             *                                              case it's ignored.
             * @param {string} [in_options.exactPath]     - the binding is only created when its path in the workspace is exactly
             *                                              this parameter. Defaults to the empty string and in this case it's
             *                                              ignored. If both in_options.exactPath and at least one of
             *                                              in_options.includePrefix/in_options.excludePrefix are specified, then
             *                                              in_options.exactPath takes preference.
             * @param {Object} [in_options.userData]      - A user supplied object that will be passed to each binding created
             * @return {Object}                           - A handle that can be used to unregister this data binding
             */
            registerSingleton(in_bindingType: string, in_typeid: string, in_singleton: DataBinding, in_options?: any): any;

            /**
             * Registers a new data binding. Either includePrefix or exactPath MUST be specified. This function will
             * retroactively create bindings
             * @param {string} in_bindingType              - The type of the data binding.  (ex. 'BINDING', 'DRAW', 'UI', etc.)
             * @param {string} in_typeid                   - The id to use for this registration, usually the type id of the
             *                                               objects being represented (like a PropertySet template id).
             * @param {function} in_dataBindingConstructor - The constructor for the data binding. Must take a parameter object
             *                                               as its only argument.
             * @param {object} in_options                  - An object containing additional parameters.
             * @param {string} [in_options.includePrefix]  - the data binding is only created when this parameter is a prefix of
             *                                               its path in the workspace. Defaults to the empty string.
             * @param {String} [in_options.excludePrefix]  - the binding is only created when this parameter is not a prefix of its
             *                                               path in the workspace. Defaults to the empty string and in this
             *                                               case it's ignored.
             * @param {String} [in_options.exactPath]      - the binding is only created when its path in the workspace is exactly
             *                                               this parameter. Defaults to the empty string and in this case it's
             *                                               ignored. If both in_options.exactPath and at least one of
             *                                               in_options.includePrefix/in_options.excludePrefix are specified, then
             *                                               in_options.exactPath takes precedence.
             * @param {Object} [in_options.userData]       - A user supplied object that will be passed to each Data Binding created
             * @return {Object}                            - A handle that can be used to unregister this data binding
             * @public
             */
            register(in_bindingType: string, in_typeid: string, in_dataBindingConstructor: any, in_options?: any): any;

            /**
             * Delay the registration of bindings until the popRegistrationScope.
             * @public
             * @deprecated please use {@link DataBinder#pushBindingActivationScope} instead
             */
            pushRegistrationScope(): void;

            /**
             * Pop the registration scope. When the push and pop balance themselves, any pending
             * registrations will be done, and all the entities will be created
             * @public
             * @deprecated Please use {@link DataBinder#popBindingActivationScope} instead
             */
            popRegistrationScope(): void;

            /**
             * A unique key per running application; each instance of the databinder will have a different Id.
             *
             * @return {number} The id of this DataBinder instance.
             * @public
             */
            getDataBinderId(): number;

            /**
             * Normalize the paths provided for registration - ensure there's a / - and compute the starting path
             * @param {Object} in_options - the path options from a registration handle
             * @return {{startPath: string, exactPath: string, excludePrefix: string}} the normalized paths
             * @hidden
             */
            _parsePathOptions(in_options: any): any;

            /**
             * Registers a handler that is called every time a ChangeSet affects a given path
             * @param {String}   in_absolutePath - Path to register the handler for
             * @param {Array.<string>} in_operations -
             *     the operations for which the callback function gets called
             *     (of of 'insert', 'modify', 'remove', 'collectionInsert', 'collectionModify', 'collectionRemove')
             * @param {Function} in_callback - The callback to invoke
             * @param {Object}         [in_options] -
             *     Additional user specified options for the callback and its registration
             * @param {Boolean} [in_options.isDeferred] - If true,
             *                    the callback is wrapped into requestChangesetPostProcessing
             * @return {DataBinder~DataBinderHandle} A handle that can be used to unregister the callback
             * @public
             */
            registerOnPath<TBinding extends DataBinding>(in_absolutePath: any, in_operations: string[], in_callback: ((this: TBinding, context: any) => any) | ((this: TBinding, key: string, context: any) => any) | ((this: TBinding, key: number, context: any) => any), in_options?: any): DataBinderHandle;

            /**
             * Attaches this data binder to the given Workspace. The change sets produced by the Workspace will be
             * processed and the corresponding data bindings will be created, updated or removed as appropriate.
             * @param {external:Workspace} workspace - The Workspace to bind to.
             * @public
             */
            attachTo(workspace: any): void;

            /**
             * Detaches from a Workspace if currently bound. All existing data bindings instances will
             * be destroyed as if the properties had been removed from the workspace.
             *
             * If in_unregisterAll is true (the default), all DataBindings are undefined and deactivated.
             * If false, it will leave them, and when attaching to a new Workspace, the DataBindings will
             * be applied.
             *
             * @param {Boolean=} [in_unregisterAll=true] if true (the default), all DataBindings are undefined and
             *   deactivated. If false, they remain, and will apply
             * @public
             */
            detach(in_unregisterAll?: boolean): void;

            /**
             * Forcibly unregister all DataBindings that are still registered with this databinder.
             * @public
             */
            unregisterAllDataBinders(): void;

            /**
             * Return true if this DataBinder is attached to a Workspace.
             * @return {boolean} true if the DataBinder is attached to a Workspace.
             * @public
             */
            isAttached(): boolean;

            /**
             * Return the data bindings (if any) that correspond to the given path or property. May be filtered by binding type.
             * @param {string|external:BaseProperty} in_pathOrProperty - Absolute path to a data binding or property corresponding
             * to a data binding
             * @param {string} [in_bindingType]  - The requested bindingType. If none has been given, all bindings will be returned
             * @return {Array.<DataBinding>|DataBinding} An array of data bindings (either of the given type or all in
             * registration order) which may be empty if no suitable bindings are present at the given path. If a binding type is
             * provided, only one data binding is returned
             * @public
             */
            resolve<T extends DataBinding = DataBinding>(in_pathOrProperty: string | BaseProperty, in_bindingType: string): T;
            resolve<T extends DataBinding = DataBinding>(in_pathOrProperty: string | BaseProperty): T[];
            /**
             * Return the removed Data Binding (if any) that correspond to the given path and type.
             * @param {string} in_path       - absolute path to an data binding
             * @param {string} in_bindingType - The requested bindingType
             * @return {DataBinding|undefined} - A data binding (of the given
             * type) which may be undefined if no suitable data binding is present at the given path.
             * @package
             * @hidden
             */
            _resolveRemovedDataBindingByType(in_path: string, in_bindingType: string): DataBinding | any;

            /**
             * @param {function} callback - A post creation callback function for each data binding called
             *                                            after the changeSet has been processed
             * @param {Object} context - The value to be passed as
             *                      the this parameter to the target function when the bound function is called
             * @public
             */
            requestChangesetPostProcessing(callback: any, context?: any): void;

            /**
             * @return {external:Workspace|undefined} Workspace the Databinder is attached to
             * @public
             */
            getWorkspace(): Workspace | undefined;

            /**
             * @return {DataBinderHandle} A handle that can be used to deactivate this instance of the binding
             * @public
             */
            activateDataBinding(in_bindingType: string, in_typeID?: string, in_options?: any): DataBinderHandle;

            /**
             * @return {boolean} true if the databinding pair is registered
             */
            hasDataBinding(in_bindingType: string, in_typeID: string): boolean;

            /**
             * @return {DataBinderHandle} A handle that can be used to undefine the binding
             * @public
             */
            defineDataBinding(in_bindingType: string, in_typeID: string, in_bindingConstructor: any, in_options?: any): DataBinderHandle;

            /**
             * Delay the activation of bindings until the popBindingActivationScope.
             *
             * @public
             */
            pushBindingActivationScope(): void;

            /**
             * Pop the activation scope. When the push and pops balance themselves, any pending
             * binding activations will be done, and all the corresponding bindings will be created.
             *
             * @public
             */
            popBindingActivationScope(): void;

            /**
             * Register a generator to be used to build a new runtime representation for the given bindingType / typeID.
             * The function will be called lazily based on calls to {@link DataBinder#getRepresentation}.
             * By design, the generator functions can themselves call getRepresentation for other properties in the system, and
             * their generators will be recursively built. The DataBinder will detect cycles in these inter-dependencies but
             * does not directly resolve them.
             * It is possible to define runtime representations for multiple levels of an inherited type. When
             * {@link DataBinder#getRepresentation} is called for a property, the most specialized runtime represenation
             * registered will be called. Care should be taken by the user to ensure all runtime representations are defined
             * before they begin to be built.
             *
             * @param {string} bindingType - The binding type to associate this runtime representation with. Allows multiple
             * runtime representations to be built for the same property.
             * @param {string} typeID - The type id for which to generate this runtime representation. Care must be taken when
             * defining types that inherit from each other; all types should be registered before the runtime representations
             * begin to be created.
             * @param {representationGenerator} generator - Callback to create a new runtime representation for the provided
             * property. The bindingType, and the userData specified here in the options are provided to the callback function.
             * Note, if the creation needs to be broken into two states, see the options.initializer option.
             * @param {Object=} options - Options block
             * @param {representationInitializer=} options.initializer - Optional callback called immediately after the
             *   generator result is added to the databinder.
             * @param {representationDestroyer=} options.destroyer - Optional callback to clean up a runtime object as it is being
             * removed from the DataBinder, due to the property being destroyed, or unregistering of the runtime representation.
             * After this function is called, the runtime representation is no longer known by the DataBinder, but there are
             * no guarantees that the instance is not in use in another system.
             *
             * @example
             * // Register a generator for runtime representations for the Dog Property
             * myDataBinder.defineRepresentation('PETSTORE', 'Types:Dog-1.0.0', (property) => new DogRepresentation());
             *
             * // Get an HFDM workspace and insert a new property
             * const workspace = getHFDMWorkspace();
             * myDataBinder.attachTo(workspace);
             *
             * workspace.insert('Fido', PropertyFactory.create('Types:Dog-1.0.0', 'single'));
             *
             * // Request the runtime representation associated with the property
             * const fido = myDataBinder.getRepresentation(workspace.get('Fido'), 'PETSTORE');
             * console.assert(fido instanceof DogRepresentation);
             *
             * @return {DataBinderHandle} A handle to permit unregistering of the runtime representation
             *
             * @throws If there is already runtime representation associated with the provided bindingType/typeID.
             *
             * @public
             */
            defineRepresentation(
                bindingType: string,
                typeID: string,
                generator: (property: BaseProperty, bindingType: string, userData?: any | undefined) => any,
                options?: {
                    destroyer?: (representation: any, bindingType: string, userData: any | undefined) => void;
                    initializer?: (repesentation: any, property: BaseProperty, bindingType: string) => void;
                    stateless?: boolean;
                    userData?: any;
                    upgradeType?: UpgradeType;
                }
            ): any;

            /**
             * Return the representation associated to the given property, for the particular binding type.
             * If the representation has not been built before, it will be created on the fly.
             *
             * @param {external:BaseProperty} property - The property for which we want the runtime representation
             * @param {string} bindingType - The binding type of the runtime representation
             *
             * @return {Object|undefined} the initialized runtime representation, or undefined if there is none registered
             *
             * @throws If there is a cycle in the generators for the creation of the runtime representations. Avoid the cyclic
             * calls, or use the 'initializer' option when specifying the generator in {@link DataBinder#defineRepresentation}
             * @throws If the generator or a recursively-used generator fails to return a runtime representation when called.
             * @throws If not connected to a workspace
             * @throws If the property is not in the workspace the DataBinder is attached to.
             *
             * @public
             */
            getRepresentation<T>(property: BaseProperty, bindingType: string): T | undefined;

            /**
             * Return the representation associated to the given property, for the particular binding type.
             * If the representation has not been built before, it will be created on the fly.
             *
             * @param {string} path - The path to the property for which we want the runtime representation
             * @param {string} bindingType - The binding type of the runtime representation
             *
             * @return {Object|undefined} the initialized runtime representation, or undefined if there is none registered
             *
             * @throws If there is a cycle in the generators for the creation of the runtime representations. Avoid the cyclic
             * calls, or use the 'initializer' option when specifying the generator in {@link DataBinder#defineRepresentation}
             * @throws If the generator or a recursively-used generator fails to return a runtime representation when called.
             * @throws If not connected to a workspace
             * @throws If the property is not in the workspace the DataBinder is attached to.
             *
             * @public
             */
            getRepresentationAtPath<T>(path: string, bindingType: string): T | undefined;

            /**
             * Return the unique id for the current/last changeset to be processed.
             * This id is guaranteed to change for every changeset that enters.
             *
             * @return {Number} A unique changeset id, greater than or equal to zero.
             *
             * @public
             */
            public getCurrentChangeSetId(): number;

            /**
             * Defines the dependencies of this component in a format that the Forge DI system is able to parse.
             * Note that the order of dependencies must match the order of constructor parameters.
             * @return Array of dependency definitions
             *
             * @public
             */
            static defineDependencies(): any[];

            /**
             * The initialization method of this component.
             * @return {Promise<DataBinder>} A promise that resolves as soon as the component has been initialized and
             *  rejects on error. Unlike most other components, the DataBinder can already be used before this promise
             *  resolves, for example to register DataBindings.
             * @public
             */
            public initializeComponent(): Promise<DataBinder>;

            /**
             * Uninitialize the component instance.
             * @return {Promise<void>} A promise that resolves as soon as the instance is fully uninitialized and
             *  rejects on error.
             */
            public uninitializeComponent(): Promise<void>;
        }

        /**
         * @deprecated Should be imported as `DataBinder`.
         */
        class DataBinderComponent extends DataBinder {}

        /**
         * Helper function: returns true iff the given string parses as a non-negative integer.
         * @param {string} str - The string we want to check whether it is
         * @return {boolean} - True if the string is a non-negative integer, false otherwise.
         * @package
         * @hidden
         */
        function isNormalInteger(str: string): boolean;

        /**
         * Helper function: reconstruct a tokenized path up to (but not including) a position.
         * @param {Array.<string> } in_tokenizedPath - tokenized path
         * @param {Array.<PathHelper.TOKEN_TYPES>} in_pathDelimiters - token types for the path
         * @param {number} in_position - position in the path (must be >= 0 <= the length of the tokenized path)
         * @return {string} - reconstructed path
         * @constructor
         * @package
         * @hidden
         */
        class concatTokenizedPath {
            constructor(in_tokenizedPath: string[], in_pathDelimiters: any[], in_position: number);

        }

        /**
         * Removes all path listeners from the data binding
         * @param {DataBinding} in_dataBindingConstructor -
         *     constructor object for the data binding class
         * @package
         * @hidden
         */
        export function _cleanupPathListeners(in_dataBindingConstructor: DataBinding): void;

        /**
         * Escapes a string so that it can safely be stored in a nested map, freeing the
         * __ namespace for use by the caller
         * @param {String} in_string - The input string
         * @return {String} the escaped string
         * @package
         * @hidden
         */
        export function escapeTokenizedStringForMap(in_string: any): any;

        /**
         * Unescapes a string that has been escaped by escapeTokenizedPathForMap
         * @param {String} in_string - The input string
         * @return {String} the unescaped string
         * @package
         * @hidden
         */
        export function unescapeTokenizedStringForMap(in_string: any): any;

        /**
         * Determine the minimal paths to the roots described by the given paths, removing redundant paths.
         * For example, given the paths /a.b.c, /a.b.c.d and /a.x, the minimal roots are /a.b.c and /a.x, because
         * /a.b.c.d is under the hierarchy of /a.b.c
         * @param {Array.<String>} in_paths - the array of paths to minimize
         * @return {Array.<String>} the minimal set of roots
         */
        export function minimalRootPaths(in_paths: any[]): any[];

        /**
         * Recursively visit all HFDM properties, starting from in_rootProperty, calling in_callback on each item.
         * TODO: Add as a service to HFDM
         * @param {BaseProperty} in_rootProperty - the property from which to recurse from
         * @param {function()}
         *        in_callback - function to call for each path. Recursion continues if the function returns true.
         *    function inputs in_property: BaseProperty, in_path: string, in_tokenizedPath: Array.<string>
         *    function should return a boolean saying whether to continue recursing
         */
        export function recursivelyVisitProperties(in_rootProperty: any, in_callback: any): void;

        /**
         * @classdesc Provides the contextual information for the onModify callbacks.
         */
        export class ModificationContext extends BaseContext {
            constructor(in_nestedChangeSet: any, in_operationType: any, in_path: any, in_context: any, in_DataBinding?: DataBinding, in_relativeTokenizedPath?: any[], in_retroactive?: any);

            /**
             * Returns the data binding (if it exists) at the path associated with this the modification.
             * If an optional DataBindingType is supplied, data bindings that correspond to that type are returned, otherwise data
             * bindings which have the same type as the binding that triggered the event of this modificationContext are returned.
             * @param {String} [in_bindingType] - The requested data binding type. If none has been given, data bindings with
             *   the same data binding type as the DataBinding that triggered this modification context are returned
             * @return {DataBinding|undefined} - a data binding (of the given
             * type) which may be empty, if no data binding of the given type is present at the path associated
             * with this modification.
             * @public
             */
            getDataBinding<T = DataBinding>(in_bindingType?: string): T | undefined;

            /**
             * Returns the Property at the root of the modification.
             * @return {external:BaseProperty} - the property at the root of this modification
             * @public
             */
            getProperty(): BaseProperty | undefined;

            /**
             * Return the tokenized path relative to the DataBinding on which we are called.
             * For a path registered on the DataBinder, this path will be relative to the root.
             *
             * @return The tokenized path, relative to the binding point
             * @public
             */
            getRelativeTokenizedPath(): string[];

        }

        /**
         * The base class all data bindings should inherit from. using {@link DataBinder.defineDataBinding} and
         * {@link DataBinder.activateDataBinding}, the class can be instantiated for properties in the HFDM workspace
         * attached to the DataBinder.
         *
         * The DataBinding class is told of onPreModify, onModify, onPreRemove, onRemove etc. These can be overloaded
         * to get the expected behaviors.
         * In addition, {@link DataBinding.registerOnPath} can be used to register for more granular events regarding
         * insert, modify and delete for subpaths rooted at the associated property.
         *
         */
        export class DataBinding {
            constructor(params: any);

            /**
             * Returns the userData associated with the data binding (if set).
             * @return {Object|undefined} - The userData, or undefined if it wasn't specified.
             * @public
             */
            getUserData(): any | any;

            /**
             * Returns the corresponding property set.
             * @return {external:BaseProperty} - The represented property
             * @public
             */
            getProperty(): BaseProperty;

            /**
             * Returns a string that represents the type of this data binding.
             * @return {string} The type of this service.
             * @public
             */
            getDataBindingType(): string;

            /**
             * Returns the Data Binder instance associated with this Data Binding
             * @return {DataBinder} - The Data Binder instance
             * @public
             */
            getDataBinder(): DataBinder;

            /**
             * Handler that is called during the initial creation of the data binding, once all its children have been created
             * @param {Array.<ModificationContext>} in_modificationContext - The modifications
             * @public
             */
            onPostCreate(in_modificationContext: (ModificationContext)[]): void;

            /**
             * Handler that is called when this data binding's corresponding property or any of its child properties are modified.
             * This function will be called before any of the children's onPreModify and onModify handlers.
             * @param {ModificationContext} in_modificationContext - The modifications
             * @public
             */
            onPreModify(in_modificationContext: ModificationContext): void;

            /**
             * Handler that is called when this data binding's corresponding property or any of its child properties are modified.
             * This function will be called after all of the children's onPreModify and onModify handlers.
             * @param {ModificationContext} in_modificationContext - The modifications
             * @public
             */
            onModify(in_modificationContext: ModificationContext): void;

            /**
             * Handler that is called when the data binding is removed.
             * This is called before any of the children's onRemove and onPreRemove handlers are called.
             * @param {RemovalContext} in_removalContext - The removal context
             * @public
             */
            onPreRemove(in_removalContext: RemovalContext): void;

            /**
             * Handler that is called when the data binding is removed
             * This is called after all the children's onRemove and onPreRemove handlers are called.
             * @param {RemovalContext} in_removalContext - The removal context
             * @public
             */
            onRemove(in_removalContext: RemovalContext): void;

            /**
             * Helper function to return the runtime object associated to the property this DataBinding is associated with.
             * By default, it will return the runtime representation for the same binding type of the DataBinding, i.e.,
             * {@link DataBinding#getDataBindingType}.
             *
             * Runtime representations are defined with {@link DataBinder#defineRepresentation}
             *
             * @param {string=} [in_bindingType] - optional binding type to fetch; otherwise it will use the same
             *   binding type as the DataBinding.
             *
             * @return {Object|undefined} The runtime representation associated with the property this binding
             *   is associated with, or undefined if there is no runtime representation registered for this
             *   binding type.
             */
            getRepresentation<T>(in_bindingType?: string): T | undefined;

            /**
             * Returns the Property at the tokenized path supplied. The path is assumed to be absolute, or relative
             * from the Property corresponding to this DataBinding. If the Property is already deleted it returns
             * undefined.
             * @param {Array.<String>} in_tokenizedPath - the tokenized sub-path / absolute path
             * @return {external:BaseProperty|undefined} - the property at the sub-path (or undefined).
             * @package
             * @hidden
             */
            getPropertyForTokenizedPath(in_tokenizedPath: any[]): any | any;

            /**
             * Returns the data binding (if it exists) at the tokenized path supplied. The path is assumed to be absolute,
             * or relative to the position of this DataBinding. If an optional data binding type is supplied, bindings that
             * correspond to that type are returned, otherwise a data binding which has the same type as this Data Binding
             * is returned.
             * @param {Array.<String>} in_tokenizedPath - the tokenized sub-path / absolute path
             * @param {String} [in_bindingType] - The requested bindingType. If none has been given, a data binding with the same
             *     bindingType as this DataBinding will be returned
             * @return {DataBinding} - a DataBinding (of the given
             * type) which may be empty if no suitable data binding is present at the tokenized path.
             * @package
             * @hidden
             */
            getDataBindingForTokenizedPath(in_tokenizedPath: any[], in_bindingType?: any): DataBinding;

            /**
             * Register a callback to a relative property path. It will be triggered on the given events. The callback will
             * receive the property represented by the relative path as a parameter.
             * @param {String} path Relative property path.
             * @param {Array.<String>} events Array of the event names to bind to:<br>
             * - modify: Triggered when the property found via the provided path is modified. When the path contains a
             *   ReferenceProperty this event tells us if the referenced property has been modified.<br>
             * - insert: Triggered when the property found via the provided path is inserted. when the path contains a
             *   ReferenceProperty this event tells us if the referenced property has been inserted.<br>
             * - remove: Triggered when the property found via the provided path is removed. when the path contains a
             *   ReferenceProperty this event tells us if the referenced property has been removed.<br>
             * - collectionModify: Triggered when the property found via path is a collection, and an entry is modified.
             * - collectionInsert: Triggered when the property found via path is a collection, and an entry is inserted.
             * - collectionRemove: Triggered when the property found via path is a collection, and an entry is removed.
             * - referenceModify: Triggered when the ReferenceProperty found via path is modified.
             * - referenceInsert: Triggered when the ReferenceProperty found via path is inserted.
             * - referenceRemove: Triggered when the ReferenceProperty found via path is removed.
             * @param {Function} callback The function to call, when the property behind the relative path changes. It receives
             * the property found via path, and a key / index if it gets triggered for one of the collection events.
             * @param {Object} [options] Additional user specified options on how the callback should be registered.
             * @param {Boolean} [options.requireProperty] -
             *     If true the callback will only be called if the corresponding Property exists, i.e. it won't be called for
             *     'remove' events. The default is false.
             * @public
             */
            static registerOnProperty<TBinding extends DataBinding>(path: any, events: any[], callback: (this: TBinding, property: ValueProperty | ContainerProperty) => void, options?: any): void;

            /**
             * Same as registerOnProperty, but the callback will get a ModificationContext instead of a property.
             * @param {String} path Relative property path.
             * @param {Array.<String>} events Array of the event names to bind to: modify, insert, remove.
             * @param {Function} callback The function to call when the property behind the relative path changes.
             * @param {Object} [options] Additional user specified options on how the callback should be registered.
             * @public
             */
            static registerOnPath<TBinding extends DataBinding>(path: any, events: any[], callback: ((this: TBinding, context: any) => any) | ((this: TBinding, key: string, context: any) => any) | ((this: TBinding, key: number, context: any) => any), options?: any): void;

            /**
             * Same as registerOnProperty, but the callback will get a JSON representation of the property.
             * @param {String} path Relative property path.
             * @param {Array.<String>} events Array of the event names to bind to. Possible values are: modify, insert, remove.
             * @param {Function} callback The function to call, when the property behind the relative path changes.
             * @param {Object} [options] - See {@link DataBinding#registerOnProperty} parameter
             * @public
             */
            static registerOnValues<TBinding extends DataBinding>(path: any, events: any[], callback: (this: TBinding, value: any) => any, options?: any): void;

            /**
             * Helper function to return the runtime object associated to the property this DataBinding is associated with.
             * By default, it will return the runtime representation for the same binding type of the DataBinding, i.e.,
             * {@link DataBinding#getDataBindingType}.
             *
             * Runtime representations are defined with {@link DataBinder#defineRepresentation}
             *
             * @param {string=} [in_bindingType] - optional binding type to fetch; otherwise it will use the same
             *   binding type as the DataBinding.
             *
             * @return {Object|undefined} The runtime representation associated with the property this binding
             *   is associated with, or undefined if there is no runtime representation registered for this
             *   binding type.
             */
            getRepresentation<T>(in_bindingType?: string): T | undefined;
        }

        /**
         * @classdesc Context which describes a remove operation
         */
        export class RemovalContext {
            constructor(in_subTree: any, in_DataBinding: DataBinding, in_path: any, in_retroactive?: any);

            /**
             * Returns the Data Bindings (if it exists) at the root of the removal. If an optional DataBindingType is supplied,
             * Bindings that correspond to that type are returned, otherwise Bindings which have the same type as the
             * Binding that triggered the event of this this RemovalContext are returned.
             * @param {String} [in_bindingType] - The requested bindingType. If none has been given, data bindings with the same
             *     bindingType as the DataBinding that triggered this removal context
             * @return {DataBinding|undefined} - A data binding (of the given
             * type or the one associated with the data binding) or undefined if no binding is present.
             * @public
             */
            getDataBinding(in_bindingType?: any): any | any;

            /**
             * Returns whether a node existed in the subtree removed by the operation associated with this context at given pos.
             * @param {Array.<string> } in_tokenizedPath - tokenized path (relative to the root of the removal operation)
             * @return {Bool} true if a node existed at the position given by the path above.
             * @package
             * @hidden
             */
            _didNodeExist(in_tokenizedPath: string[]): any;

            /**
             * clones the context object
             * @return {RemovalContext} the cloned context
             * @package
             * @hidden
             */
            _clone(): RemovalContext;

        }

        /**
         * Definition of the options block for {@link StatelessDataBinding}
         */
        interface IStatelessDataBindingOptions {
          /**
           * A user supplied object
           */
          userData?: any;
        }

        /**
         * The StatelessDataBinding class. When creating a stateless databinding class ```D``` to be
         * registered with the DataBinder (see {@link DataBinder.registerStateless}), ```D``` needs to inherit from
         * this class. Only one instance of ```D``` will be created.
         *
         * @extends DataBinding
         */
        export class StatelessDataBinding extends DataBinding {
            /**
             * Constructor
             *
             * @param {IStatelessDataBindingOptions} params - An object containing the initialization parameters.
             */
            constructor(params: IStatelessDataBindingOptions);

            /**
             * Returns the corresponding property set.
             * @return {BaseProperty} - The represented property
             */
            getProperty(): BaseProperty;

            /**
             * Returns the Data Binder instance associated with this Data Binding
             * @return {DataBinder} - The Data Binder instance
             */
            getDataBinder(): DataBinder;

            /**
             * Setup to do before a callback is called
             * @param {BaseProperty} in_property - the property to use during the callback
             * @hidden
             */
            _preCall(in_property: any): void;

            /**
             * Teardown after a callback is called
             * @param {BaseProperty} in_property - the property used during the callback
             * @hidden
             */
            _postCall(in_property: any): void;

        }

        /**
         * Inserts an object into a nested Object hierarchy. If an entry already exists, it will be overwritten.
         * @param  {Object}     in_object   - The object in which we search for the entry
         * @param  {...number}  in_path     - The path within the hierarchy
         * @param  {*}          in_newEntry - The new entry to insert
         * @return {boolean} Has there already been an entry?
         * @alias insertInNestedObjects
         * @package
         * @hidden
         */
        export function insertInNestedObjects(in_object: any, in_path: number[], in_newEntry: any): boolean;

        /**
         * Checks, whether an entry exists under the given path in a nested Object hierarchy
         * @param  {Object}     in_object  - The object in which we search for the entry
         * @param  {...number}  in_path    - The path within the hierarchy
         * @return {boolean} Did an entry exist under the given path in a hierarchy
         * @alias existsInNestedObjects
         * @package
         * @hidden
         */
        export function existsInNestedObjects(in_object: any, in_path: number[]): boolean;

        /**
         * Returns an entry from a nested hierarchy of objects
         * @param  {Object}     in_object  - The object in which we search for the entry
         * @param  {...number}  path       - The path within the hierarchy
         * @return {boolean} Did an entry exist under the given path in a hierarchy
         * @alias getInNestedObjects
         * @package
         * @hidden
         */
        export function getInNestedObjects(in_object: any, path: number[]): boolean;

        /**
         * Deletes an entry from a nested hierarchy of objects.
         * It will also delete all no longer needed levels of the hierarchy above the deleted entry
         * @param {Object}     in_object  - The object in which we search for the entry
         * @param {...number}  in_path    - The path within the hierarchy
         * @alias deleteInNestedObjects
         * @package
         * @hidden
         */
        export function deleteInNestedObjects(in_object: any, in_path: number[]): void;

        /**
         * Traverses a hierarchy of nested objects and invokes the callback function for each entry
         * @param {Object}   in_object                - The nested object hierarchy to traverse
         * @param {Number}   in_levels                - The number of levels to descend in the hierarchy
         * @param {Boolean}  in_invokeForHigherLevels - If this is set to true, the callback will also be invoked in
         *                                              cases where there were not in_levels many levels present in the
         *                                              hierarchy.
         * @param {function} in_callback              - Callback that will be invoked with the keys of all nested levels as
         *                                              parameters, followed by the value at that level. If not all levels
         *                                              were existent in the hierarchy, it will be passed undefined parameters
         *                                              to fill up to in_levels keys.
         * @alias traverseNestedObjects
         * @package
         * @hidden
         */
        export function traverseNestedObjects(in_object: any, in_levels: any, in_invokeForHigherLevels: any, in_callback: any): void;

        /**
         * A wrapper class for StatelessDataBinding that's used during registering a StatelessDataBinding.
         * @param {Object} params - An object containing the initialization parameters.
         * @param {BaseProperty} params.property - The property set that this binding represents.
         * @param {DataBinder} params.dataBinder - The DataBinder that created this binding
         * @param {Object} params.activationInfo - the information relating to the activation (userData, databinder...)
         * @constructor
         * @extends DataBinding
         */
        export class StatelessDataBindingWrapper extends DataBinding {
            constructor(params: any);

            /**
             * Handler that is called during the initial creation of the DataBinding, once all its children have been created
             * @param {Array.<LYNX.AppFramework.ModificationContext>} in_modificationContext - The modifications
             */
            onPostCreate(in_modificationContext: any[]): void;

            /**
             * Handler that is called when this DataBinding's corresponding property or any of its child properties are modified.
             * This function will be called before any of the children's onPreModify and onModify handlers.
             * @param {LYNX.AppFramework.ModificationContext} in_modificationContext - The modifications
             */
            onPreModify(in_modificationContext: any): void;

            /**
             * Handler that is called when this DataBinding's corresponding property or any of its child properties are modified.
             * This function will be called after all of the children's onPreModify and onModify handlers.
             * @param {LYNX.AppFramework.ModificationContext} in_modificationContext - The modifications
             */
            onModify(in_modificationContext: any): void;

            /**
             * Handler that is called when the DataBinding is removed.
             * This is called before any of the children's onRemove and onPreRemove handlers are called.
             * @param {LYNX.AppFramework.RemovalContext} in_removalContext - The removal context
             */
            onPreRemove(in_removalContext: any): void;

            /**
             * Handler that is called when the DataBinding is removed
             * This is called after all the children's onRemove and onPreRemove handlers are called.
             * @param {LYNX.AppFramework.RemovalContext} in_removalContext - The removal context
             */
            onRemove(in_removalContext: any): void;

        }

        /**
         * The PropertyElement is a helper class that abstracts an element in the HFDM property set tree,
         * whether it is a specific property, or an element of a primitive collections (array/map). It allows code to be
         * written with less special cases when it comes to primitive collections.
         */
        export class PropertyElement {
            constructor(in_property: BaseProperty, in_childToken?: string | undefined);

            /**
             * Return the current property. If getChildToken is defined, then we are actually inspecting an element
             * of this.getProperty(), which by definition must be a container.
             *
             * @return {BaseProperty|undefined} the property the PropertyElement represents, or the container
             */
            getProperty<T = BaseProperty>(): T | undefined;

            /**
             * Return the child token, in the case where the current property element is focused on an element
             * of a primitive container. If not defined, the property element represents this.getProperty().
             * If defined, the property element represents this.getProperty()[this.getChildToken()]
             *
             * @return {String|Number|undefined} the token in the container this.getProperty(), or undefined if not a
             *   container element.
             */
            getChildToken(): string|number|undefined;

            /**
             * Returns true if the element is currently representing a value within a primitive collection, e.g.,
             * a string in an array of strings, a float in a map of floats...
             *
             * @return {boolean} true if the current element is part of a primitive collection.
             */
            isPrimitiveCollectionElement(): boolean;

            /**
             * If this element is part of a primitive collection (e.g. a string in an array of strings), return the
             * context of the collection we are in (e.g., an array if a string in an array of strings)
             *
             * @return {string|undefined} the context of the parent container if this is a primitive collection element.
             */
            getPrimitiveCollectionContext(): string|undefined;

            /**
             * Return the value represented by this property element. If representing a property, it will return the
             * property value. If representing an element within a container, it will give that container element value.
             *
             * @return {undefined|*} the value of the property element represented.
             */
            getValue<T>(): T | undefined;

            /**
             * Return the value represented by this property element. If representing a property, it will return the
             * property value. If representing an element within a container, it will set the container element value.
             *
             * @param {*} value - the new value
             */
            setValue<T>(value: any): void;

            /**
             * Return the absolute path to this property element, including a container dereference if it
             * represents an element within a container
             *
             * @return {String} the path from the workspace root
             */
            getAbsolutePath(): string;

            /**
             * Return the tokenized path to this property element, including a container dereference if it
             * represents an element within a container.
             *
             * @return {Array.<String>} the tokenized path from the workspace root
             */
            getTokenizedPath(): string[];

            /**
             * Return the typeid of this property element. If representing an element of a container, it will be the
             * container element type.
             *
             * @return {String} the id of this property element.
             */
            getTypeId(): string;

            /**
             * Return the context of this property element. If representing an element of a container, it will be the
             * container element context.
             *
             * @return {String} the context
             */
            getContext(): string;

            /**
             * Get a console-friendly printout of the path represented by this property element.
             *
             * @return {String} the console-friendly printout
             */
            toString(): string;

            /**
             * Return whether this represents a valid property or element within a container property.
             *
             * @return {Boolean} true if a valid property element
             */
            isValid(): boolean;

            /**
             * Return whether the element is a reference. Note, this means that if this property element represents an element
             * within a primitive array/map of references, this will return true.
             *
             * @return {Boolean} true if the value represents a reference
             */
            isReference(): boolean;

            /**
             * Returns whether the property element is currently representing a primitive collection.
             *
             * @return {Boolean} true if we are representing a primitive collection.
             */
            isPrimitiveCollection(): boolean;

            /**
             * Return the child (token or tokenized path)
             *
             * @param {Array.<String>|String} in_child - the tokenized path, or single child
             * @param {Object} in_options - parameter object
             * @param {Object.<{referenceResolutionMode:LYNX.Property.BaseProperty.REFERENCE_RESOLUTION}>} }
             *    [in_options.referenceResolutionMode=ALWAYS] How should this function behave
             *    during reference resolution?
             *
             * @return {PropertyElement} the element representing the child.
             */
            getChild(in_child: string|string[], in_options: object): PropertyElement;

            /**
             * Get the element referenced by this element.
             *
             * @return {Array.<String>|undefined} the ids of the children, or undefined if not a container
             */
            getChildIds(): string[] | undefined;

            /**
             * Return a property element representing the target of the reference.
             *
             * @return {PropertyElement} the target of the reference
             */
            resolveRef(): PropertyElement;

            /**
             * Become the child (token or tokenized path). If the child does not exist, then this.isValid() will
             * be false.
             *
             * @param {Array.<String>|String} in_child - the tokenized path, or single child
             * @param {Object} in_options - parameter object
             * @param {Object.<{referenceResolutionMode:LYNX.Property.BaseProperty.REFERENCE_RESOLUTION}>} }
             *    [in_options.referenceResolutionMode=ALWAYS] How should this function behave
             *    during reference resolution?
             *
             */
            becomeChild(in_child: string|string[], in_options?: object): PropertyElement;

            /**
             * Get the parent.
             *
             * @return {PropertyElement} the parent property element; may not be valid
             */
            getParent(): PropertyElement;

            /**
             * Become the parent. If the parent does not exist, then this.isValid() will
             * be false.
             */
            becomeParent(): PropertyElement;

            clone(): PropertyElement;
        }

        export function onPathChanged(in_path: string|string[], in_events: string[], in_options?: {isDeferred?: boolean}): Function;
        export function onPropertyChanged(in_path: string, in_events: string[], in_options?: {isDeferred?: boolean, requireProperty?: boolean}): Function;
        export function onValuesChanged(in_path: string, in_events: string[], in_options?:{isDeferred?: boolean, requireProperty?: boolean}): Function;

        export function forEachProperty<D extends BaseProperty = BaseProperty>(in_rootProperty: BaseProperty, in_callback: (in_property: D) => boolean): void;
    } // namespace ForgeAppfwDatabinder

    export = ForgeAppfwDatabinder;
} // module "@adsk/forge-appfw-databinder"
