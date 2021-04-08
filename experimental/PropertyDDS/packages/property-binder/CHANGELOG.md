# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [4.3.1] - 2019-10-22
### Changed
- Make 'upgradeType' as an optional parameter in defineRepresentation
### Added
- Adding 'getDataBinderId' to the DataBinder type

## [4.3.0] - 2019-09-23
### Added
- Support npm-style semver matching for data bindings. defineDataBinding now takes an optional 'upgradeType',
  which determines whether a definition will apply to types with a newer patch, minor or major version.
### Fixed
- When listening to collectionInsert on the root of the repository, the absolute path provided in the modification
  context was incorrect. If a property 'thing' was inserted, the absolute path would be ``/[thing]`` instead of
  ``/thing``

## [4.2.0] - 2019-09-23
### Fixed
- the npm-style semver was failing for RelationshipProperty

## [4.1.1] - 2019-09-23
### Fixed
- Fixed underscore import when consuming databinder via script tags

## [4.1.0] - 2019-09-19
### Added
- Support npm-style semver matching for representations. defineRepresentation now takes an optional 'upgradeType',
  which determines whether a definition will apply to types with a newer patch, minor or major version.
### Changed
- Fixed documentation of DataBinding.registerOnValues

## [4.0.3] - 2019-09-17
### Fixed
- Fixed HFDM import when consuming databinder via script tags

## [4.0.2] - 2019-09-06
### Fixed
- Remove dependency on `forge-appfw-hfdm`.

## [4.0.1] - 2019-09-06
### Fixed
- Fix traversal of `visitTypeHierarchy` when inherits is a string

## [4.0.0] - 2019-08-30
### Breaking
- Upgrade dependency `@adsk/forge-hfdm`.
- Upgrade dependency `@adsk/forge-appfw-hfdm`.
### Changed
- Upgrade dependency `underscore`.

## [3.1.4] - 2019-08-29
### Fixed
- Expose correct type definitions for ModificationContext.

## [3.1.3] - 2019-08-12
### Fixed
- Change `getTemplate` checks to include both local and remote

## [3.1.2] - 2019-07-26
### Changed
- Improve typescript types to allow libraries using strict mode consume databinder

## [3.1.1] - 2019-06-28
### Fixed
- The `forEachProperty` method now works correctly with Property trees containing instances of EnumArrayProperty.

## [3.1.0] - 2019-06-21
### Added
- Exported the `forEachProperty` method which allows the recursive traversal of a Property tree starting from the given
  Property.

## [3.0.7] - 2019-05-24
### Fixed
- Passing a populated workspace to the constructor and modifying it later caused a crash.

## [3.0.6] - 2019-05-22
### Fixed
- Revert deprecation of the `initializeComponent` method, since it is still required under certain conditions.

## [3.0.5] - 2019-05-06
### Deprecated
- Calling the `initializeComponent` method is not necessary and it got deprecated.
### Changed
- Remove the peer dependency to `@adsk/forge-appfw-component-helpers`.

## [3.0.4] - 2019-05-06
### Changed
- Internal refactoring: remove dependency on `forge-appfw-guidutils`.

## [3.0.3] - 2019-05-03
### Changed
- Internal refactoring: remove dead code

## [3.0.2] - 2019-05-02
### Fixed
- The static type cache didn't always take into account remotely registered Schemas resulting in
  some bindings not being instantiated.

## [3.0.1] - 2019-04-15
### Changed
- Fixed missing 'stateless' flag in types package index.d.ts

## [3.0.0] - 2019-04-02
### Changed
- The former peer dependency to the `@adsk/forge-appfw-di` package is now only a dev dependency.
- The `DataBinder` class does now accept an optional workspace instance in the constructor, which will automatically
  attach the databinder to that instance. You can still attach it to a workspace using the `attachTo` method as well.
### Deprecated
- The `DataBinderComponent` class has been removed from this package. You can simply register the `DataBinder` class as
  a provider in the `ComponentTree`. For backwards-compatibility, this class is still exported as `DataBinderComponent`
  as well, but this will be removed in an upcoming major version release.
### Breaking
- Introduced a new peer dependency to the `@adsk/forge-appfw-component-helpers` package.
- The `getDataBinder` method of the `DataBinderComponent` doesn't exist anymore. Instead, an instance of the
  `DataBinder` will directly be injected into any component that depends on it. This is a consequence of porting the
  DataBinder to the new AppComponent interface as defined in `@adsk/forge-appfw-component-helpers`.
- The TypeScript declarations for this package have been moved into the package, which makes the
  `@adsktypes/adsk__forge-appfw-databinder` package obsolete. This could be a breaking change for TS project which did
  not use the type declarations before.

## [2.0.1] - 2019-03-28
### Changed
- Internal refactoring: DataBinding base classes have been combined into a single class
### Fixed
- getDataBinder(), getUserData(), getBindingType() now work for Stateless bindings

## [2.0.0] - 2019-03-19
### Breaking
- removed EventEmitter dependency. DataBindings using this functionality can use the
  EventEmitter.makeEventEmitter() call to emulate this behaviour. Applications who relied
  on events emitted by DataBinder itself, will need to keep track of Bindings created/removed
  by themselves.

## [1.5.10] - 2019-03-19
### Changed
- Load minified package only with production configuration [LYNXDEV-9118](https://jira.autodesk.com/browse/LYNXDEV-9118)

## [1.5.9] - 2019-03-18
### Fixed
- modificationContext.getProperty() now works correctly for stateless DataBindings.

## [1.5.8] - 2019-02-21
### Fixed
- Improved performance of activating databindings

## [1.5.7] - 2019-02-21
### Fixed
- improved performance of activating databindings
- Mostly internal changes relating to the performance of activating data bindings. Edge cases
  in special cases, such as map\<\>, are now handled.

## [1.5.6] - 2019-02-18
### Fixed
- Revert non-functional hotfix.
- Don't pass the internal tree node to DataBindings (it was unnecessary)

## [1.5.5] - 2019-02-18
### Fixed
- Fixed crash if an HFDM schema declaration where the inherited type of the schema
  was provided as a simple string instead of an array with a single string.

## [1.5.4] - 2019-02-13
### Fixed
- Hotfix for HFDM SDK 1.13 and later.

## [1.5.3] - 2019-02-13
### Fixed
- Performance improvements when attaching to a workspace, and when activating data bindings

## [1.5.2] - 2019-02-11
### Fixed
- Fix a crash caused by trying to manipulate non-string path segments as if they were strings (LYNXDEV-8835)

## [1.5.1] - 2019-02-08
### Fixed
- Performance improvements for cases where databindings are activated for the entire repository

## [1.5.0] - 2019-02-06
### Changed
- SingletonDataBinding is now called StatelessDataBinding. The old name and API still work, but are deprecated.

## [1.4.3] - 2019-02-04
### Fixed
- Performance improvement for repos with many strings

## [1.4.2] - 2019-01-31
### Removed
- ReferenceChangeContext removed (never occurs as of 1.3.0, since referenceChanged was removed)

### Fixed
- Regression in the reference callback code. The modification context provided in
  the callback would return the wrong value for context.getDataBinding() in some
  cases when following through references (LYNXDEV-8582)
- Issues with dereferencing using the PropertyElement
- Issues with PropertyElement in arrays of primitive entries for index 0

## [1.4.1] - 2019-01-31
### Fixed
- Supply an empty context to runtime representation callbacks classic functions (LYNXDEV-8517)

## [1.4.0] - 2019-01-30
### Added
- Support for 'stateless' runtime representations. Whenever representations of this type are requested
  (using the options: stateless: true flag), they are built on the fly. (LYNXDEV-8462)

## [1.3.5] - 2019-01-28
### Changed
- Update package dependencies to reference ES5 packages consistently.

## [1.3.4] - 2019-01-24
### Fixed
- Don't crash when trying to access a representation associated with a removed Property (LYNXDEV-8406)

## [1.3.3] - 2019-01-24
### Fixed
- Bad deploy

## [1.3.2] - 2019-01-22
### Fixed
- Regression in the reference callback code. The modification context provided in
  the callback would return the wrong value for context.getDataBinding()

## [1.3.1] - 2019-01-22
### Changed
- Released bundles are now ES5.

## [1.3.0] - 2019-01-21
### Fixed
- Fixed a wide range of binding errors where the bound path goes through a reference or multiple
  references [LYNXDEV-8090]

### Breaking
- Removed the referenceChanged event. Occurrences of the event will print a warning, and replace it with
  an insert and a remove event. This is not quite the same thing but will likely handle most of the cases.
  It will not handle, for example, changing one reference in a long chain of references where the target
  remains the same. It will also call the callback twice when changing a reference from one valid reference
  to another; you will first be called back to be told that the old value was 'removed', and then called
  back that the new value was 'inserted'. [LYNXDEV-8090]

## [1.2.3] - 2019-01-16
### Changed
- Better performance when attaching to an already populated Workspace with many long paths

## [1.2.2] - 2019-01-11
### Fixed
- Take into account the path delimiter `.` when considering a subpath in minimalRootPaths

## [1.2.1] - 2018-12-20
### Fixed
- When unregistering databindings / detaching a Workspace don't undefine internal bindings
  This was causing absolute path callbacks (DataBinder.registerOnPath) to be
  unregistered (LYNXDEV-6263)

## [1.2.0] - 2018-12-13
### Changed
- Update to use HFDM 1.10.0 to fix LYNXDEV-8061 . HFDM would crash WGS
  (_getPathSegmentForChildNode) when modifying an array property from
  the HFDM Inspector.

## [1.1.0] - 2018-12-10
### Changed
- Make `getCurrentChangeSetId` public in `DataBinder` class

## [1.0.1] - 2018-11-27
### Added
- new interfaces were added to the forge-appfw-databinder project to properly
  document all the options of activateDataBinding etc.

## [1.0.0] - 2018-11-27
### Changed
- Version bump

## [0.9.0] - 2018-11-22
### Fixed
- Fixed includePrefix/excludePrefix/exactPath when they enter into a reporeference
- Fixed the documentation of 'events' in registerOnPath, registerOnValue etc.
- LYNXDEV-6336 isDeferred option was ignored by registerOnValues, registerOnProperty etc
- creating a deferred callback inside a constructor will now wait until post changeset processing
- Fixed some documentation links
- Fixed an issue where registrations of a DataBinding would not fire when used in multiple DataBinders
- a referenceInsert callback on a reference property would not fire if the reference property did not resolve
  to a valid property
- registering on referenceChanged could crash going from an undefined to a defined reference
- LYNXDEV-6013: handle references even with contracted path segments

### Added
- DataBinder.registerOnPath, registerOnValues etc. now accept arrays of paths.
  As with the DataBinding version, the associated callback will only be called once
  per changeset
- 'main' entry point added to the package.json
- SingletonDataBinding class is now exposed; please refer to the documentation for more details
- hasDataBinding has been added to the DataBinder to allow checking for if a databinding has been
  defined for a given bindingType / typeID
- Moved the DataBinderComponent (AppComponent) from the now deprecated `forge-appfw-core` package into this package.
- isSimulated is now present on the ModificationContext and RemovalContext. If true, it means that the
  callback that is being called is being simulated for properties that were already present in the workspace.
  For example, when attaching to an existing workspace, 'inserts' will be simulated for all properties that
  have active databindings.

### Breaking
- An 'insert' callback on a reference will now fire whenever the reference becomes valid. Previously
  this occurred, but only if the properties existed at time of definition. This also includes handling
  insert callbacks on the path a.ref.b; when 'ref' becomes valid, you will receive your 'insert'
  notification for b.
- A 'remove' callback on a reference will now fire whenever the reference becomes invalid or changes
  to a different target.

## [0.8.0] - 2018-08-08
### Fixed
- LYNXDEV-6095 multiple relative path callbacks registered in the same call pass wrong the arguments
- LYNXDEV-6400 requestChangeSetPostProcessing now works in absolute path registers for existing properties

### Added
- RST documentation in the DOCUMENTATION subdirectory

### Breaking
- LYNXDEV-5776 userData is now specified during DataBinding activation, not definition
- LYNXDEV-6092 forge-appfw-events is now a peer dependency, and will need to be added to clients if
  not already present.
  - EventEmitter is no longer exported in the forge-appfw-databinder package. Use forge-appfw-events
    instead
  - NOTE: This means the ES6 method for instantiating classes _must_ be used (i.e., using the 'new'
    keyword) to instantiate DataBinder now.

## [0.7.6] - 2018-06-12
### Fixed
- LYNXDEV-5602 referenceChanged crashes due to missing ReferenceChangeContext clone
- LYNXDEV-5729 Avoid crash when detaching workspace with references
- LYNXDEV-5732 Performance: don't recurse on primitive collections like uintarrays, float arrays
- LYNXDEV-5733 Potential infinite loop when using array\<Reference\> or map\<Reference\>
- LYNXDEV-5746 call relative path callbacks only after onPostCreate/onModify/onInsert
- LYNXDEV-5915 call changeset post-processing when adding/removing a binding when
  the workspace already contains a property of that type
- LYNXDEV-5940 representation returned by getRepresentation in a databinding constructor can be lost

### Added
- LYNXDEV-5541 associateRepresentation allows hooking an existing representation to a
  property

## [0.7.5] - 2018-05-18
### Fixed
- LYNXDEV-5675 fire for referenceInsert when reference already exists
- LYNXDEV-5708 better handling of references when bindings are created retroactively
- LYNXDEV-5708 better handling of postprocessing: fixed case where deferred callbacks
  were processed inside another deferred callback

### Changed
- LYNXDEV-5693 Updated HFDM dependency to 0.1.60
- LYNXDEV-5597 DataBinder.detach() destroys all bindings as if properties were removed; binding
   definitions and activations are destroyed unless detach(false) is called.
- LYNXDEV-5597 DataBinder.detach() will destroy any created runtime representations.
- LYNXDEV-5618 registerRuntimeModel was deprecated in favor of defineRepresentation, etc., in general
   'runtimeModel' was replaced with 'representation'
- LYNXDEV-5650 unregisterAllDataBinders renamed to unregisterDataBindings

## [0.7.4] - 2018-05-15
### Fixed
- LYNXDEV-5650 Incorrect throw with maps of references to objects when calling insert callbacks

### Changed
- LYNXDEV-5571 activateDataBinding will affect all types inheriting from the provided type
- LYNXDEV-5571 DataBinding to be instantiated is chosen based on the property type, rather than
   the activation type
- LYNXDEV-5571 activating the same bindingtype / typeid multiple times will not throw, it is handled

### Added
- LYNXDEV-5571 unregisterAllDataBinders provided for unbinding / deactivating databindings based on
   binding type

## [0.7.3] - 2018-05-11
### Breaking
- (As of the previous release) userData is not provided in the parameters to the DataBinding
  constructor. Use this.getUserData() instead

### Fixed
- LYNXDEV-5645 Fixed a crash with node properties with invalid references and collectionInsert callbacks
- LYNXDEV-5645 Fixed a crash with references when activating bindings ('register')

## [0.7.2] - 2018-05-08
### Fixed
- LYNXDEV-5563 Fix absolute path callbacks for references that are not valid at first
- LYNXDEV-5570 register/activateDataBinding takes schema type inheritance into account

## [0.7.1] - 2018-05-04
### Added
- Tests for the UMD bundle (#100)

### Changed
- Update to HFDM version 3.0.0-alpha.59 (#104)

### Fixed
- Fixed the regression caused by upgrading to Webpack 4 (#100)

## [0.7.0] - 2018-05-02
### Added
- LYNXDEV-4544 registerRuntimeModel, getRuntimeModel permits associating runtime models with properties
- LYNXDEV-4543 DataBinding.registerOnPath now permits registering to multiple paths (and getting called back once)

### Changed
- Update to HFDM version 3.0.0-alpha.58 (#98)
- LYNXDEV-5205 No need to call DataBinding's on* callbacks anymore (except the constructor). (#95)

### Breaking
- LYNXDEV-5446 DataBinder.resolve() will return undefined when no suitable Binding is found and a bindingType
  is provided (#96)

## [0.6.0] - 2018-03-29
### Added
- registerOnPath, registerOnProperty, registerOnModify etc. now return a handle that allows the registration to be
  undone

### Changed
- dataBindings are now created/removed retroactively for Properties already present in the Workspace when registering

### Fixed
- the order of registration for registerOnPath and its variants is no longer relevant
- unregisterAllOnPathListeners called on a parent class would previously still lead to callbacks on the child class

### Breaking
- the replaceExisting flag for registerOnPath is deprecated. The behaviour is now always equivalent
  to replaceExisting = false

## [0.5.0] - 2018-03-06
### Added
- New: support for arrays of references (#85)

### Breaking
- renamed register to registerToEvent
- renamed unregister to unregisterFromEvent
- renamed bind to attachTo
- renamed unbind to detach
- renamed registerEntity to register
- renamed unregisterEntity to unregister
- renamed EntityManager to DataBinder
- renamed *Entity to *DataBinding

## [0.0.6] - 2018-02-05
### Added
- support for maps of references (LYNXDEV-3934) (#82)
- new ES6 Entity class (#92)

### Changed
- Update to HFDM version 3.0.0-alpha.51 (#93)

### Fixed
- collectionInsert callbacks of "on demand" Entities are called correctly (LYNXDEV-3820) (#86)
- correctly bind to properties under already loaded repository refs (LYNXDEV-4258) (#87)

## [0.0.5] - 2018-01-15
### Changed
- Update to HFDM version 3.0.0-alpha.47 (#83)
- Fix: speed up BaseEntity._invokeReferenceChangedAfterRemoval() (#81)
- Fix: references that point to not-yet-existing arrays will work. (#80)

## [0.0.4] - 2017-12-15
### Changed
- Fix: path to removed Entities was not set or was set incorrectly in some cases. (#79)
- New: support registering 'Reference' (and 'array\<Reference\>' etc.) as base type for references (#77)
- Fix: resolvePath() should not resolve removed Entities. (#78)
- New: support registering 'Reference' (and 'array\<Reference\>' etc.) as base type for references
- Fix: unregistering on demand Entities at the root property should work now. (#76)
- Fix removed entities check (#75)
- Keep removed Entities (#69)
- fix multiple creation of on demand Entities (#73)
- optional feature: registerOnProperty() & friends will only call the callback when the property is valid (#74)
- misc. fixes: unregister on demand, collection properties (#72)
- added convenience resolveProperty() function to entity manager (#54)
- Allow specifying BaseProperty (and map\<\> / array\<\> / etc.) to instant… (#71)
- Fix: don't resolve the leaf reference when creating on demand Entities. (#70)
- added getOperationType to RemovalContext (#68)
- more tests for referenceChanged & bind to reference. (#67)
- Better handling of absolute paths. Rename includePath/excludePath (#66)
- use NO_LEAFS as reference resolution mode where necessary. (#65)
- use BaseProperty.REFERENCE_RESOLUTION.NEVER instead of '*' when calling ContainerProperty.resolvePath() (#64)
- port to HFDM 3.0.0-alpha-36 (#63)
- feature: unregister ondemand Entities (#62)
- allow binding of entities to collections. (#61)
- Better support for arrays that contain nodes with path callbacks. (#59)
- Better error message when an EntityTree node is not found. (#60)
- Partial fix for deleting subtrees that contain path callbacks (#58)
- Support for on demand Entities. (#53)
- Fix LYNXDEV-3104: modificationContext should always correctly report the absolute path now (even for remove ops) (#56)
- Create Entities for each different EntityType when applicable (#55)
- Fix for getEntities() when called in a remove operation. (#52)
- Fix getEntities() when called for a removal context (#51)
- Fixed bug that caused an error when not returning an entity in registerEntity (#50)
- Added getworkspace function (#49)
- Fixing BaseEntity.getPropertyForTokenizedSubpath. It is now able to handle primitive collections properly. (#47)
- Pass the correct rel. tokenized path for modification contexts (#46)
- Delete ref to associated property, return undefined when accessing (#45)
- Performance improvements (#43)
- Fix: Fix parameters for collection callbacks (#41)
- Fix ModificationContext._relativeTokenizedPath and therefore getEntities and getProperty (#42)
- App Framework stabilization (#38)
- replaceExisting option now defaults to true. (#39)
- Only one parameter object for functions in EntityUtils now. The - Add two new events to the entity
  creation/removal workflows. (#37)
- Merge back the results of the big refactoring (parallel traversal etc.) (#36)

## [0.0.1-alpha.6] - 2017-06-21
### Changed
- BinaryDataSource symbol exported

## [0.0.1-alpha.5] - 2017-06-19
### Changed
- Equivalent to version 0.0.1 of the module-robotized version.

## [0.0.1-alpha.4] - 2017-05-22
### Changed
- Update to latest PropertySets library (with binary support). Misc fixes.

## [0.0.1-alpha.3] - 2017-05-05
### Changed
- Update to latest PropertySets library. Misc fixes.

## [0.0.1-alpha.2] - 2017-04-25
### Changed
- Minor fixes.

## [0.0.1-alpha.1] - 2017-04-21
### Changed
- Fixed dependencies.

## [0.0.1-alpha.0] - 2017-04-21
### Added
- First release.
