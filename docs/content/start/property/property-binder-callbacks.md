---
title: Property Binding Callbacks
menuPosition: 4
---

As mentioned previously, *DataBindings* implement the business logic that reacts to changes to its corresponding
*Property* in the *Property DDS*. This is implemented via various callback functions: these callbacks are called when a
*Property* with a *TypeId* that either corresponds to or inherits from the *DataBinding’s* registered *TypeId*
is inserted into the *Property DDS*, when the *Property* is modified and when the *Property* is removed from
the *Property DDS*.

## DataBinding implementation


All *DataBinding* classes must derive from the ``DataBinding`` class using standard JavaScript inheritance, and
in their constructor must call the constructor of the superclass (``DataBinding``). Please see the next sections
for an explanation of which callback functions are called when. Below is a complete sample implementation for a
minimal DataBinding class that shows the just-mentioned requirements in code:

```javascript
  class PointDataBinding extends DataBinding {
    constructor(in_params) {
      // call our parent's ctor which will do some setup for us
      super(in_params);
      // other setup for our business logic object, for example instantiate a renderer object:
      this._renderer = new PointRenderer();
    }
  }
```

This small example *DataBinding* implementation instantiates a "renderer" object in  the constructor which
is responsible for displaying the point (that is associated with the *Property*) in the HTML page. The *DataBinding*
is essentially a wrapper around this renderer object which represents the business logic that does not need to know
anything about *Properties* or *Property DDS*. This pattern is quite common both when adding *Fluid Property DDS* support to existing
applications and when developing new applications and helps to keep the business logic independent of the
details of dealing with *Fluid Property DDS* and *Properties*.


All *DataBindings* have access to the *DataBinder* instance that created them and are able to call its methods. For
example, a *DataBinding* may call [requestChangesetPostProcessing()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-requestchangesetpostprocessing-Method" >}}) in order to delay some of their processing
(more details later). Or, the *DataBinding*
may also access a different *DataBinding* with a known path (or one that exists at a known *Property*): calling
the [resolve()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-resolve-Method" >}}) method of *DataBinder* will return the *DataBindings* present at the given absolute path/*Property*
(may optionally be filtered by *BindingType*). This is not recommended, however, since the lifetime of the
*DataBindings* is not predictable - they may have been already been removed or haven't been instantiated yet if
they are in a different subtree in the *Property* hierarchy. For accessing alternative views of the *Property DDS* data,
it is recommended to use [DataBinder Runtime Representations]({{< ref "property-binder-runtime-representation.md" >}}) instead.

### Modifying Properties

One important limitation of any *DataBinding* callback is that **modifying** *Properties* (including insert/remove
operations) in the *Property DDS* is forbidden. If any callbacks wish to modify *Properties* in the *Property DDS*, they
can schedule a callback to be called after the processing of the current *ChangeSet* is finished: these callbacks
may be scheduled by calling [requestChangesetPostProcessing()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-requestchangesetpostprocessing-Method" >}}) and supplying the callback as an argument. They may
freely modify any *Properties* in the callback.


## Constructor and onPostCreate()

As mentioned above, *DataBinder* constructs the *DataBinding* objects via calling their constructor (which is supplied
to [defineDataBinding()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-definedatabinding-Method" >}}) as mentioned in [PropertyBinder Binding Definition and Activation]({{< ref "property-binder-binding-definition.md" >}}). A *DataBinding* constructor is expected
to take one parameter object argument, which must be passed to the super class *DataBinding*. Most of these parameters
should be considered private, with the exception of the modificationContext, of type `ModificationContext`, which provides
additional information about the *ChangeSet* that triggered the creation of this *DataBinding*.

The constructor is necessarily the first callback regarding the lifespan of the property, that will be called. It is
called preorder during the *ChangeSet* traversal. This means that if there should be other
*DataBindings* (regardless of whether these are implemented by the same *DataBinding* class or not) due to other
*Properties* inserted by the same *ChangeSet* in the subtree rooted at the just-created *DataBinding*, these will
not be created yet. Any initialization that involves these children will therefore fail.

Initialization code that is required to be run after the subtree was traversed (or in other words, postorder
with respect to the traversal) should be put in the ``onPostCreate()`` callback. This callback will have a single
argument which is a `ModificationContext`. Since ``onPostCreate()`` is called postorder, all *DataBindings* "below"
the current one have already been created (and their constructor called) when this callback is called.

## The onPreModify() and onModify() callbacks

You can override the ``onModify()`` to be called back for any modifications in the subtree rooted at the property
associated with the *DataBinding*. The method is called by *DataBinder* whenever the associated *Property* subtree
is modified, postorder during the *ChangeSet* traversal. Similarly, the ``onPreModify()`` callback will
be called preorder when the associated *Property* is modified. For both callbacks, the *Property* object stored in
the binding (as well as all other *Properties* in the *Property DDS*) will already have been updated by *Fluid* to the
new value when these callbacks are called. Both callbacks will have a single argument which is a `ModificationContext`.

Let's look at how the ``onModify()`` function might look in our example ``PointDataBinding``:

```javascript
  onModify(in_modificationContext) {
    // this is the callback where we react to any modifications to the Property we're
    // registered for (or anything below). DataBinder also provides a "context" object
    // that details what has changed but we won't use that in this small example.
    // By the time this callback gets called, our Property is already updated to the new
    // value(s) so we can just read it and update the renderer with the values
    var property = this.getProperty();
    this._renderer.setPosition({x: property.get('x').value, y: property.get('y').value});
  }
```
In this example we take advantage of the fact that by the time *DataBinder* calls the ``onModify()``
callback, the *Property* associated with our *DataBinding* is already updated to reflect the modified values. This
makes it very easy to just call our business logic with the updated values.

## The onPreRemove() and onRemove() callbacks

These callbacks get called by *DataBinder* when the *Property* associated with the *DataBinding* is removed from the
*Property DDS*. The ``onPreRemove()`` callback will be called preorder, that is before it’s called for any *DataBindings*
that are in the subtree of the current *Property* and the ``onRemove()`` callback will be called postorder, i.e. after
all *DataBindings* that are in the subtree of the current *Property* have been processed (including calling their
``onPreRemove()`` and ``onRemove()`` callbacks). These callbacks are mainly used for cleaning up, for example to inform the
wrapped object that implements our business logic that it’s no longer part of the model. Note that when these callbacks
(including ``onPreRemove()``) are called the associated *Property* has already been removed by *Property DDS* so
[getProperty()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-getproperty-Method" >}}) will return undefined.

This is how such a callback could look in our example:

```javascript
  onRemove(in_removalContext) {
    // cleanup: remove the visible representation from the body of the HTML document
    this._renderer.remove();
  }
```

Depending on the exact implementation details, this functionality could also have be implemented in the
``onPreRemove()`` callback, or in a more complicated case it could have been split between the two callbacks.

Both the  ``onPreRemove()`` and the ``onRemove()`` callbacks take exactly one argument which is a `RemovalContext`.
This will be discussed in detail in the next section.

## ModificationContext and RemovalContext

While the *DataBinding*’s constructor as well as the ``onPostCreate()``, ``onPreModify()`` and ``onModify()``
callbacks all get a `ModificationContext` object as argument (in the case of the constructor it’s part of the
parameter object it gets, i.e. ``in_param.modificationContext``) the ``onPreRemove()`` and ``onRemove()``
callbacks get a `RemovalContext` as argument.

The exact content of these traversal contexts is not yet finalised, but it is not expected that existing functionality
will be significantly changed or removed. More convenience functions may be added in the future.

The current functionality offered by `ModificationContext` and `RemovalContext` is very similar.
Note however that `RemovalContext` will always return certain values for some query functions:

* ``getProperty()`` will always return ``undefined``, as the property has already been removed
* ``getNestedChangeSet()`` will always return ``undefined``
* ``getContext()`` will always return ``''`` (the empty string)
* ``getOperationType()`` will always return ``remove``


## Relative path callbacks

As already mentioned, *DataBindings* are usually registered to complex *Property* *Schemas*. In practice these
*Schemas* tend to get fairly complicated. We could react to all the various changes to the complex *Property* in the
``onModify()`` callback, but it would be much cleaner to have the ability to register different callbacks for the
different sub-properties.

The *DataBinder* supports this by allowing a *DataBinding* to register callback functions that
will be called when a sub-property at a given relative path changes (inserted, modified, removed…).

Following is an example implementation where we update (some) values relevant for a Three.JS Object3D
instance.

The schema for the Object3D is as follows:

```javascript
const Object3DSchema = {
  typeid: 'autodesk.samples:object3D-1.0.0',
  properties: [
    { id: 'pos', typeid: 'autodesk.samples:vector3D-1.0.0' },
    { id: 'scale', typeid: 'autodesk.samples:vector3D-1.0.0' },
    { id: 'name', typeid: 'String' }
  ]
};
```

And we define the data binding as follows:
```javascript
  class Object3DDataBinding extends DataBinding {
      constructor(in_params) {
        super(in_params);

        this._object = new THREE.Object3D();
      }

      // Callback called when the 'pos' sub-property is changed. The DataBinder produces a
      // deep copy of the current values of the property and provides them to the callback
      changePosition(values) {
        this._object.position.set(values.x, values.y, values.z);
      }

      // Callback called when the 'pos' sub-property is changed. The DataBinder provides the
      // property that was modified. We manually extract the values.
      changeScale(property) {
        this._object.scale.set(
          property.get('x').value,
          property.get('y').value,
          property.get('z').value
        );
      }

      // The most general callback variant which gives us a modification context.
      changeName(modificationContext) {
        this._object.name = modificationContext.getProperty().value;
      }

      // We initialize our class with the static function that will register on each
      // of the following
      static initialize() {
        this.registerOnValues('pos', ['insert', 'modify'], this.prototype.changePosition);
        this.registerOnProperty('scale', ['insert', 'modify'], this.prototype.changeScale);
        this.registerOnPath('name', ['insert', 'modify'], this.prototype.changeName);
      }
    }
    Object3DDataBinding.initialize();
```

In the static ``initialize()`` function we may register any number of relative callbacks using the static functions
``registerOnPath``, ``registerOnProperty``, and ``registerOnValues``. Note that ``this`` refers to the *class* and
not to an instance in a static function. In other words, these registrations will affect every instance of the
*DataBinding* that are created.

Also note that this static function must be called by the application's
initialization code during startup to register these relative path callbacks; it won't be called automatically.
(If using Decorators, such static initialization functions are no longer required. See [Decorators]({{< ref "#decorators-advanced" >}}) for
more details.) Relative-path callbacks may be registered by one of the following functions (all provided by the
``DataBinding`` class):



* [registerOnPath()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-registeronpath-Method" >}}) gives you a `ModificationContext` containing a nested Property *ChangeSet*
  for the relative path we have bound to. We can also access the modified property from here.
* [registerOnProperty()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-registeronproperty-Method" >}}) gives you the changed *Property* (unless you register to the ``remove`` event, where
  the *Property* has already been removed by *Property DDS* and *DataBinder* doesn't have access to it when processing the
  *ChangeSet* which contains the relevant ``remove`` event).
* [registerOnValues()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-registeronvalues-Method" >}}) gives you the result of calling ``getValue()`` when we register for a primitive (i.e. builtin)
  *Property* which will be a JavaScript builtin type. Otherwise it gives you the result of calling ``getValues()``
  on the *Property* object we have bound to under the relative path which will be a JSON representation of the
  value of the associated property and any recursive sub-properties.

Note that as with the ``onModify()`` etc. callbacks, **modifying** *Properties* (including insert/remove operations) is also
forbidden in relative path callbacks. If any relative-path callbacks wish to modify *Properties* in the *Property DDS*,
they can signal that they wish to be executed after the processing of the current *ChangeSet* is finished (details
for this will be discussed in the next Sections).

Please also note that the same callback function may be registered multiple times (even via different functions);
it will be called for all registered paths and events with the appropriate arguments.

Let's take a look at these functions in more detail.

### registerOnPath

An example for calling the [registerOnPath()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-registeronpath-Method" >}}) function with all possible options may look like this:

```javascript
  this.registerOnPath(['path1', 'path2'], ['insert', 'modify'], this.callback, {isDeferred: true});
```
The first argument is either a string that specifies a relative path from the *Property* that corresponds to the
current *DataBinding* instance, or an array of such strings. Note that it is possible to register for events at the
*Property* that corresponds to the current *DataBinding* instance (i.e. the empty path), in this case the empty string
`''` should be used as path.

The second argument is an array of strings where each string specifies an event that this callback should be called
for. The valid event types are as follows:

* ``insert`` / ``modify`` / ``remove`` which correspond to the *Property* at the specified relative path being
  inserted, modified or removed, unless it is a reference, in which case the target is tracked.
* ``collectionInsert`` / ``collectionModify`` / ``collectionRemove`` these events are only valid if the
  *Property* at the specified relative path is a collection *Property* (such as an Array or a Map). These events will
  fire if a new element is inserted into the collection, an element is modified,
  or an element is removed, respectively.
* ``referenceInsert`` / ``referenceModify`` / ``referenceRemove`` these events are only valid if the
  *Property* at the specified relative path is a reference *Property*. By default the standard
  ``insert`` / ``modify`` / ``remove`` events refer to the *Property* that is being *referenced*. However, an
  application may wish to listen to changes to the reference itself. These events will fire if the
  reference *Property* itself is inserted into the Property DDS (at the relative path specified), modified (i.e. it
  references something else) or removed, respectively.

The third argument is the callback itself. Usually this will be a method of the current *DataBinding* class, but
it may be any function (except for arrow functions which are not supported). When the callback is called the
*DataBinder* will set ``this`` to the *DataBinding* instance.


The fourth argument is an optional ``options`` argument. Currently only one option is supported: ``isDeferred`` which
is a boolean value defaulting to ``false``. If this option is set to ``true``, the callback will be executed after
the processing of the current *ChangeSet* is finished and may freely modify *Properties* in the *Property DDS*. Of
course relative path callbacks may also use [requestChangesetPostProcessing()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-requestchangesetpostprocessing-Method" >}}) of the *DataBinder* class.

The callbacks registered using this function either receive a single `ModificationContext` or `RemovalContext` argument
when the registered event is one of the non-collection events (i.e.  one of ``insert`` / ``modify`` / ``remove`` /
``referenceInsert`` / ``referenceModify`` / ``referenceRemove``), or two arguments when the registered event is
one of ``collectionInsert`` / ``collectionModify`` / ``collectionRemove``. In this case the first argument will be
a key, and the second argument will be a `ModificationContext` (or `RemovalContext`) object. The key passed as the
first argument is the key to the element in the collection that was changed, so it is always a non-negative
number for Arrays and a unique identifier for Maps and Sets.

### registerOnProperty


This function is a convenience function which gives callbacks the *Property* associated with the relative path instead
of the `ModificationContext` given by [registerOnPath()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-registeronpath-Method" >}}).

An example for calling the [registerOnProperty()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-registeronproperty-Method" >}}) function with all possible options may look like this:

```javascript
  this.registerOnProperty('path', ['insert', 'modify'], this.callback, {isDeferred: true, requireProperty: true});
```

The first three arguments have the same meaning as for [registerOnPath()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-registeronpath-Method" >}}), except that the relative path supplied
in the first argument must be a single string (it can't be an array of paths). The fourth argument is an optional
options argument here as well, but beside the ``isDeferred`` option which has the same meaning as for
[registerOnPath()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-registeronpath-Method" >}}), it also supports the ``requireProperty`` option which is also a binary value that defaults to ``false``.
If this option is set to ``true``, the callback will only be executed if a valid *Property* can be passed to it (e.g.
it won't be executed for ``remove`` events when the associated *Property* does not exist anymore).

Similarly to [registerOnPath()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-registeronpath-Method" >}}), the callbacks registered using this function either receive a single argument when
the *Property* associated with the relative path is a non-collection *Property*, or two arguments when the associated
*Property* is a collection *Property*. In the first case the callbacks will either get the *Property* itself (which
makes updating the business logic with the *Property's* value very easy) or ``undefined`` if the *Property* is not
valid and the ``requireProperty`` option hasn't been set. In the second case the callbacks get a key as the first
argument and the collection *Property* as the second argument (or ``undefined`` if the *Property* is not valid
and the ``requireProperty`` option hasn't been set). The key passed as the first argument is the key to the element
in the collection that was changed, so it is always a non-negative number for Arrays and a unique identifier
for Maps and Sets.

### registerOnValues

Similarly to [registerOnProperty()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-registeronproperty-Method" >}}), this function is a convenience function which gives callbacks the value of the
*Property* associated with the relative path instead of the `ModificationContext` given by [registerOnPath()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-registeronpath-Method" >}}).

```javascript
  this.registerOnProperty('path', ['insert', 'modify'], this.callback, {isDeferred: true, requireProperty: true});
```

Here all arguments have the same meaning as for [registerOnProperty()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-registeronproperty-Method" >}}).

The callbacks registered using this function will always receive a single argument. If the *Property* associated with
the relative path is a primitive (i.e. builtin) *Property DDS* *Property*, it will be the value of that *Property* as a
JavaScript builtin type. If the *Property* associated with the relative path is not a primitive *Property* (e.g. a
user defined complex *Schema*), it will be a JSON serialization of that *Property* and its sub-properties' values
as returned by the *Property DDS* *Property* ``getValues``.

## References

It is important to note some important facts about binding to references:

* When using 'insert'/'modify'/'remove' on a path that ends at a reference, the reference is dereferenced,
  and the target property (if it exists) is what will be tracked.
* If you are interested in the changes to the actual reference, e.g. when it is inserted into Property DDS, modified, or removed,
  use the 'referenceInsert'/'referenceModify'/'referenceRemove' events.
* If the path for the callback includes a reference (including ending on a reference), you will receive 'insert'/'remove'
  notifications when the reference changes. For example, consider being registered on a path 'a.ref.text' for inserts
  and removes, where 'ref' is a reference that is currently invalid.

  * If 'ref' is pointed at a property 'A' (with a child 'text'), you will receive an 'insert' for A.text.
  * If 'ref' is pointed to a property 'B' (with a child 'text'), you will receive a 'remove' for A.text and an 'insert' for B.text.
  * If 'ref' is then pointed to something invalid, you will receive a 'remove' for B.text.

## Callback ordering (advanced)

With different type callbacks it is not always straightforward in which order they will be fired with respect to each
other as well as to the traversal itself. In the following we will discuss the exact order for the various operations.

### Insert

For each *Property* whose insertion causes one or more associated *DataBindings* to be instantiated, the callbacks
will be called in the following order:

1. JavaScript constructor for the *DataBinding*. If more than one *DataBindings* need to be instantiated, the order in
   which their constructor is called is not defined.
2. Recursive creation of *DataBindings* below the currently processed *Property* in the *Property DDS*.
3. ``onPostCreate`` callback. Again, if there are more than one *DataBindings* associated with the current *Property*,
   the order in which these are called is not defined. This method may assume that all *DataBindings* below the
   current one are fully initialized.
4. All relative-path callbacks that need to be called. If there are more *DataBindings* associated with the current
   *Property*, the order in which their relative path callbacks are called is not defined. All relative path callbacks
   may assume however, that the finalizing method (``onPostCreate``) for their binding has been called.

### Modify

For each modified *Property* that has one or more associated *DataBindings*, the callbacks will be called in the
following order:

1. ``onPreModify`` callback. If there are more than one *DataBindings* associated with the current *Property*,
   the order in which these are called is not defined.
2. Recursive traversal below the currently processed *Property* in the *Property DDS*. Any necessary callbacks to
   ``onPreModify``, ``onModify`` and relevant relative path callbacks for *DataBindings* below the current one
   will be fired.
3. ``onModify`` callback. Again, if there are more than one *DataBindings* associated with the current *Property*,
   the order in which these are called is not defined. This method may assume that all *DataBindings* below the
   current one had their ``onPreModify``, ``onModify`` and relevant relative path callbacks fired.
4. All relative path callbacks that need to be called. If there are more *DataBindings* associated with the current
   *Property*, the order in which their relative path callbacks are called is not defined. All relative path callbacks
   may assume however, that the finalizing callback (``onModify``) for their binding has been called.

### Remove

For each removed *Property* that has one or more associated *DataBindings*, the callbacks will be called in the
following order:

1. ``onPreRemove`` callback. If there are more than one *DataBindings* associated with the current *Property*,
   the order in which these are called is not defined.
2. Recursive traversal below the currently processed *Property* in the *Property DDS*. Any necessary callback to
   ``onPreRemove``, ``onRemove`` and relevant relative path callbacks for *DataBindings* below the current one
   will be fired.
3. All relative path callbacks that need to be called. If there are more *DataBindings* associated with the current
   *Property*, the order in which their relative path callbacks are called is not defined. All relative path callbacks
   may assume however, that the finalizing callback (``onRemove``) for their binding has *not* been called yet.
4. ``onRemove`` callback. Again, if there are more than one *DataBindings* associated with the current *Property*,
   the order in which these are called is not defined. This callback may assume that all *DataBindings* below the
   current one had their ``onPreRemove``, ``onModify`` and relevant relative path callbacks fired. The relative
   path callbacks registered for the current *DataBinding* have been called as well so that this callback may perform
   any necessary final cleanups.

The callback execution order above may be disturbed by the following two conditions:

1. If any relative path callbacks have their ``isDeferred`` option set, they will only be executed after
   the traversal has ended.
2. If a relative path callback crosses a reference into a distinct subtree, it will be executed "out of order" from
   the point of view of the *referenced* subtree.

If any *Property* in the *Property DDS* has more than one child, the order in which they are traversed is not defined.


## Absolute path callbacks

So far we have discussed how to define various callbacks that would be called for every instance of a *Property* of a
certain *TypeId* in a *Property DDS*. However, an application may wish to hear about changes to one specific *Property*,
rather than about changes to *any* *Property* of the same *TypeId*. This is possible using absolute path
callbacks, which can be registered with [dataBinder.registerOnPath()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-registeronpath-Method" >}}). An example for calling the
[dataBinder.registerOnPath()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-registeronpath-Method" >}}) function with all possible options may look like this:

```javascript
  dataBinder.registerOnPath('/myProperty.color.green', ['insert', 'modify'], myCallback, {isDeferred: true});
```

The arguments expected by this function have the same meaning as for [registerOnPath()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-registeronpath-Method" >}}), except the first one. The
first argument must be a string, and it represents an *absolute path* inside the *Property DDS*: this is the exact path
that we want to listen to. It may or may not start with ``/``, it is always assumed to be an absolute path starting at
the root of the *Property DDS*. The callback will be fired for all events specified in the second argument that happen
at the *Property* specified in the path. Note that the path may contain collections. The path may even end inside a
collection provided the collection is not of a primitive type - that is, it actually contains *Properties*.

Note that just like with any callbacks that have been discussed so far, **modifying** *Properties*
(including insert/remove operations) is also forbidden in absolute path callbacks. If any absolute path callbacks
wish to modify *Properties* in the *Property DDS*, they can signal that they wish to be executed after the processing of
the current *ChangeSet* is finished via setting the ``isDeferred`` option in the fourth callback or via registering
a callback with  [requestChangesetPostProcessing()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-requestchangesetpostprocessing-Method" >}}).


## Decorators (advanced)


The standard pattern for registering relative path callbacks is to use a static ``initialize`` function and register
the relative path callbacks in this function. Alternatively, the *DataBinder* supports Decorators,
an experimental JavaScript feature. Instead of registering the callback with one of the methods listed earlier, the
callback functions can be *decorated* with ``onPathChanged``, ``onPropertyChanged``, and ``onValuesChanged``. These
correspond to
registrations via ``registerOnPath``, ``registerOnProperty``, and ``registerOnValues`` respectively, and take the
same arguments with the same meanings (with the exception that no callback is provided; the callback is the function
being decorated).

Here is how the ``Object3D`` class from the previous sections may look using decorators:

The schema for the Object3D is as follows:
```javascript
const Object3DSchema = {
  typeid: 'autodesk.samples:object3D-1.0.0',
  properties: [
    { id: 'pos', typeid: 'autodesk.samples:vector3D-1.0.0' },
    { id: 'scale', typeid: 'autodesk.samples:vector3D-1.0.0' },
    { id: 'name', typeid: 'String' }
  ]
};
```

And we define the data binding as follows:

```javascript
class Object3DDataBinding extends DataBinding {
      constructor(in_params) {
        super(in_params);

        this._object = new THREE.Object3D();
      }

      // Callback called when the 'pos' sub-property is changed. The DataBinder produces a
      // deep copy of the current values of the property and provides them to the callback
      @onValuesChanged('pos', ['insert', 'modify'])
      changePosition(values) {
        this._object.position.set(values.x, values.y, values.z);
      }

      // Callback called when the 'pos' sub-property is changed. The DataBinder provides the
      // property that was modified. We manually extract the values.
      @onPropertyChanged('scale', ['insert', 'modify'])
      changeScale(property) {
        this._object.scale.set(
          property.get('x').value,
          property.get('y').value,
          property.get('z').value
        );
      }

      // The most general callback variant which gives us a modification context.
      @onPathChanged('name', ['insert', 'modify'])
      changeName(modificationContext) {
        this._object.name = modificationContext.getProperty().value;
      }
    }
```

## Limitations (advanced)

1. Reference integrity is not guaranteed: if the *Property* tree structure changes in a way that would change or
invalidate the path to the referenced *Property*, *DataBinder* will not detect this. For example, if a reference
references a *Property* at ``/foo.bar[5]``, where ``bar`` is a non-primitive Array, if an element is inserted to
or removed from the ``bar`` array below the index 5, this reference will reference a different (or possibly even
a non-existing) *Property*.

2. Dependent bindings are not supported. If a *DataBinding* depends on the outcome of some other *DataBinding*, this
needs to be solved outside *DataBinder*.

3. *Modify* type callbacks will not have access to the old value of the modified *Properties*. Likewise, *remove* type
callbacks will not have access to the removed *Properties*. This is mostly a *Property DDS* limitation, by the time
*DataBinder* processes the changes to the *Property DDS* the *Properties* are already updated (removed) and the
*ChangeSet* does not contain this information.

4. It is not possible to bind *DataBindings* or References to entries in primitive type collections (i.e. it is not
possible to bind to an entry in an ``Int32`` Map or Array). It’s possible to bind to the entire collection though and
``collectionInsert`` / ``collectionModify`` / ``collectionRemove`` events will work as expected. This is mostly an
*Propertsy DDS* limitation as primitive type collections don't contain actual *Properties*. However, *Property DDS* allows References to
point to entries in a collection of References (e.g. elements in a ``ReferenceArrayProperty`` or in a
``ReferenceMapProperty``), but *DataBinder* does not support this yet.

5. ``collectionRemove`` listeners will not be called if the subtree containing the collection is removed above
the collection itself. This is again mainly a limitation due to the *ChangeSet* format.

## Other Resources
* [defineDataBinding()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-definedatabinding-Method" >}})
* [activateDataBinding()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-activatedatabinding-Method" >}})
* [getUserData()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-getuserdata-Method" >}})
* [attachTo()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-attachto-Method" >}})
* [detach()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-detach-Method" >}})
* [unregisterDataBindings()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-unregisterdatabindings-Method" >}})
* [getDataBinder()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-getdatabinder-Method" >}})
* [getDataBindingType()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-getdatabindingtype-Method" >}})
* [getProperty()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-getproperty-Method" >}})
* [resolve()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-resolve-Method" >}})
* [requestChangesetPostProcessing()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-requestchangesetpostprocessing-Method" >}})
* `ModificationContext`
* `RemovalContext`
* [registerOnPath()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-registeronpath-Method" >}})
* [registerOnProperty()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-registeronproperty-Method" >}})
* [registerOnValues()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-registeronvalues-Method" >}})
* [dataBinder.registerOnPath()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-registeronpath-Method" >}})
