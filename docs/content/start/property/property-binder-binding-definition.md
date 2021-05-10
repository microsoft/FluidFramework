---
title: Defining and activating PropertyBindings
menuPosition: 3
---

An *Application* may have any number of *DataBinder* instances. A given *DataBinder* instance may only be
attached to a single *Property DDS* at a time, although multiple *DataBinders* can technically be attached to a single
*Property DDS*. During the lifetime of a *DataBinder*, it may be attached to different *Property DDS*.
Since most operations and callbacks only make sense when a *DataBinder* instance is attached, in the following we
will assume that a *DataBinder* is attached to an *Property DDS* unless otherwise noted. However, the *DataBinder*
supports attaching to a *Propery DDS* that is already populated with data.

## Defining DataBindings



A new *DataBinding* may be defined by calling the [defineDataBinding()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-definedatabinding-Method" >}}) function on a *DataBinder* instance
(e.g. ``myDataBinder.defineDataBinding()``) with the appropriate parameters. This may happen before or after
the *DataBinder* instance (e.g. ``myDataBinder``) is attached to a *Property DDS*. Note that just defining
a *DataBinding* will not cause any bindings to be instantiated, they will also need to be activated by
calling [activateDataBinding()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-activatedatabinding-Method" >}}) (this will be explained in more detail shortly). Once one or more *DataBindings*
are activated and a *Property DDS* is attached, every insertion of a *Schema* whose *TypeId* matches the *TypeId*
specified by any of the (defined and activated) *DataBindings* will cause a new instance of the corresponding
*DataBinding* to be created. Similarly, if such a *Schema* is removed from the *Property DDS* its associated
*DataBinding* will also be removed.

### Binding Types

Note that only one DataBinding may be registered to any given *bindingType* / *typeId* (Property *Schema*) pair.
If an *Application* wishes to have more than one *DataBinding* per *TypeId*, it will need to define those
using different *bindingTypes*. The full syntax for the [defineDataBinding()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-definedatabinding-Method" >}}) function is:

```javascript
  myDataBinder.defineDataBinding('VIEW', 'example:light-1.0.0', LightDataBinding);
```

All three arguments are mandatory. The first argument is the *bindingType*, the second is the *Typeid* for which we
want to bind, and the third is the constructor of the *DataBinding* class. The *DataBinder* chooses the most appropriate
*DataBinding* based on the type-inheritance hierarchy. For example, if a *DataBinding* is defined (and activated)
for a "base" *TypeId*, it will also be instantiated for *Properties* whose Schema *inherits* from this “base”
*TypeId*, unless there is another *DataBinding* registered for either for the exact *typeId* of this Property, or
for a *TypeId* which is closer to the exact *TypeId* in the inheritance chain than the “base” *typeId*. All this
is considered per *bindingType*.

### Schema Inheritance


Let’s look at an example: let’s assume that we have the following *Schemas* in our *Property DDS*:
``example:object3d-1.0.0``, ``example:mesh-1.0.0``, ``example:trianglemesh-1.0.0``, ``example:camera-1.0.0``,
``example:perspectivecamera-1.0.0`` where the inheritance tree looks like this:

![Inheritace Figure](/images/databinder_inheritance_fig.png)

Where the arrows denote inheritance.

Let's assume we have *DataBindings* defined for ``example:object3d-1.0.0``, ``example:mesh-1.0.0`` and
``example:perspectivecamera-1.0.0``. Now if a Property with a *TypeId* ``example:trianglemesh-1.0.0`` is inserted
into the *Property DDS*, the *DataBinding* defined for ``example:mesh-1.0.0`` will be instantiated since we don’t have a
binding for ``example:trianglemesh-1.0.0`` and the binding for ``example:mesh-1.0.0`` is closer in the inheritance
tree than the one for ``example:object3d-1.0.0``.

Similarly, if a *Property* with the *TypeId* ``example:camera-1.0.0`` is inserted into the *Property DDS*,
the instantiated *DataBinding* will be the one that is defined for ``example:object3d-1.0.0`` - the one for
``example:perspectivecamera-1.0.0`` can’t be instantiated since ``example:camera-1.0.0`` does not inherit from
``example:perspectivecamera-1.0.0``.

Special cases for *TypeIds*: ``BaseProperty``, ``map<>``, ``array<>``, ``Reference``, ``map<Reference>``,
``array<Reference>``. The *TypeId* ``BaseProperty`` will match any non-collection *typeId*, while the *typeIds*
``map<>`` and ``array<>`` will match any map and array collection respectively. The remaining special cases will
similarly match any (single) References, any maps of References (ReferenceMapProperty) and any arrays of References
(ReferenceArrayProperty) respectively.

## Activating DataBindings

Defining *DataBindings* is only half of the story. In order for *DataBinder* to actually instantiate any
*DataBindings*, they must also be activated by calling [activateDataBinding()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-activatedatabinding-Method" >}}). This is separated
from the definition for multiple reasons. The major reason is that the definition of a *DataBinding* will often come
from another component, but the application will want to control how this definition is applied. In particular, any
customization with ``includePrefix`` or ``userData`` is usually only known by the application *using* the
*DataBinding*, and not by the component *defining* the *DataBinding*.

For example, the application may want to have a certain *DataBinding* only under certain
paths in the Property DDS but not under any other path, in this case the application can activate this *DataBinding*
multiple times with different ``includePrefix`` options that correspond to the allowed paths. The other reason
is that by requiring definition and activation to be done separately *DataBinder* can make sure that every binding
is properly defined before it starts to instantiate bindings.

When activating *DataBindings* the pattern of defining every related *DataBinding* and then activating all of
them in a single call to calling [activateDataBinding()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-activatedatabinding-Method" >}}) is very common. In code it looks something like this:

```javascript
  // activates all DataBindings that have the 'VIEW' bindingType
  myDataBinder.activateDataBinding('VIEW');

  // activates all DataBindings that have the
  // 'VIEW' bindingType; each instance created will
  // receive the object specified via myViewUserData
  myDataBinder.activateDataBinding('VIEW', undefined, {userData: myViewUserData});
```

It is also possible (but less common) to just activate a specific *DataBinding* for a given *bindingType*/*typeId*
pair as shown by the following examples:

```javascript
  myDataBinder.defineDataBinding('VIEW', 'example:light-1.0.0', LightDataBinding);
  myDataBinder.defineDataBinding('VIEW', 'example:pointlight-1.0.0', PointLightDataBinding);
  myDataBinder.defineDataBinding('VIEW', 'example:directionallight-1.0.0', DirectionalLightDataBinding);
```

Of course a typical Application may use more than one *bindingType* and may have a lot more definitions. The
order of definition does not matter here, but all bindings must be defined before activating this way in order to
enable *DataBinder* to instantiate the correct binding for each Property. The full syntax for
the [activateDataBinding()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-activatedatabinding-Method" >}}) function is:

```javascript
  myDataBinder.activateDataBinding('VIEW', 'example:light-1.0.0' {includePrefix: 'scene',
  excludePrefix: 'some.other.path', userData: myUserDataObject});
```

As shown by the examples above, only the first parameter (the *bindingType*) is mandatory, everything else is
optional. If only the first parameter is given, all *DataBindings* of the specified *bindingType* will be activated
with no path restrictions and no user data passed to them. If the second parameter (the *TypeId*) is also given, only
the *DataBinding* defined for the given *bindingType*/*TypeId* pair will be activated. The third option
lets Applications restrict under which paths *DataBindings* will be instantiated as well as to specify a *userData*
object which will be passed to all *DataBinding* instances created by this activation. The *userData* object passed
here will be available via the [getUserData()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-getuserdata-Method" >}}) function of the *DataBinding* instance.

### Activation scopes

The activation of *DataBindings* may be delayed by using the functions [pushBindingActivationScope()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-pushbindingactivationscope-Method" >}})
and [popBindingActivationScope()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-popbindingactivationscope-Method" >}}). These functions work similarly to the *Property DSS* functions
[popNotificationDelayScope()]({{< ref "docs/apis/property-dds/sharedpropertytree#property-dds-sharedpropertytree-popnotificationdelayscope-Method" >}}) and [pushNotificationDelayScope()]({{< ref "docs/apis/property-dds/sharedpropertytree#property-dds-sharedpropertytree-pushnotificationdelayscope-Method" >}}). All [activateDataBinding()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-activatedatabinding-Method" >}}) calls made after
a call to [pushBindingActivationScope()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-pushbindingactivationscope-Method" >}}) will be delayed until a corresponding [popBindingActivationScope()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-popbindingactivationscope-Method" >}}) call
is made. Note that calls to [pushBindingActivationScope()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-pushbindingactivationscope-Method" >}}) and [popBindingActivationScope()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-popbindingactivationscope-Method" >}}) may be nested and no
activation will happen until the calls balance themselves. This functionality should be used with care,
since unbalanced push/pop bracketing can render the *DataBinder* permanently disabled.
Consider doing push/pop scopes using try/catch blocks, for example.

Delaying the activation of *DataBindings* is mostly useful when the application needs to activate a number
of *DataBindings* with different *bindingTypes* (and/or path options) and the *DataBinder* is already attached to a
populated *Property DDS*. Generally the *DataBinder* needs to traverse the *Property DDS* for each [activateDataBinding()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-activatedatabinding-Method" >}})
call which may be expensive in case of a large *Property DDS*. However, if the activation calls are scoped there will
only be one traversal when [popBindingActivationScope()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-popbindingactivationscope-Method" >}}) is called. Activation scopes are also useful when the
application needs to activate *DataBindings* that bind to different *typeIds* where one *typeId* is derived from
the other(s) and the *Property DDS* is already populated. If not put in a scope, there is the danger that
a more generic *DataBinding* is instantiated for *Properties* with a more specialized *typeId*. However, if these
activations are scoped, *DataBinder* will instantiate the most appropriate *DataBinding* for each *Property*.

### Path Restrictions


Normally, *DataBindings* will be instantiated everywhere in the Property DDS where *Properties*
of their associated *typeId* are present. To limit where *DataBindings* are instantiated, the following path
restriction options can be used:

* ``includePrefix``: the *DataBinding* will only be created if this string is a prefix of the absolute path in the
  Property DDS leading to the Property that triggered the *DataBinding's* creation. Defaults to the empty string. If
  it overlaps with an ``excludePrefix`` also specified for the given binding in the same [activateDataBinding()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-activatedatabinding-Method" >}}) call,
  the ``excludePrefix`` option takes precedence (i.e. the instance won’t be created).

* ``excludePrefix``: the *DataBinding* will only be created if this string is not a prefix of the absolute path in
  the Property DDS leading to the Property that triggered the *DataBinding's* creation. Defaults to the empty string
  (which is ignored).

* ``exactPath``: the *DataBinding* will only be created if the absolute path in the Property DDS leading to the Property
  that triggered the DataBinding’s creation is exactly this string. This option takes precedence over both
  ``includePrefix`` and ``excludePrefix``, i.e. if ``exactPath`` is specified both prefix options will be ignored.

These paths are interpreted as absolute paths starting at the root of the Property DDS. They may be optionally be
prefixed by ``/``, but the *DataBinder* assumes they are all relative to the root.

A *DataBinding* may be activated activated more than once with different path restrictions; the *DataBinder* will
ensure only one instance is created for a given *Property*. For example a *DataBinding* may be activated with
different ``exactPath`` options to instantiate at different predetermined paths in the *Property DDS*, but nowhere else.

Notes:

* Passing different userdata in different activations results in undefined behavior if for a given *DataBinder*
  instance more than one ``userData`` object would be applicable.

* Path restrictions are not combined between different [activateDataBinding()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-activatedatabinding-Method" >}}) calls. This is useful
  for example to activate bindings with different ``exactPath`` options (and potentially different userdata objects).

### UserData

The ``userData`` option lets the Application pass a JavaScript object that in turn will be passed to all
*DataBinding* instances created by this call. It is possible to activate a *DataBinding* multiple times with
different ``userData`` options. However, if for a given *DataBinding* instance there would be more than one applicable
``userData`` objects it is undefined which one will be passed to the instance. For example given a suitable *Property*
in the *Property DDS* at the path ``/foo`` and the following two activations, it is undefined which ``userData`` object
the *DataBinding* instance will get:

```javascript
  myPropertyBinder.activateDataBinding('VIEW', undefined, {exactPath: '/foo', userData: myUserDataObj});
  myPropertyBinder.activateDataBinding('VIEW', undefined, {exactPath: '/foo', userData: myOtherUserDataObj});
```
The following will work as expected (assuming suitable *Properties* at paths ``/foo`` and ``/bar`` in the *Property DDS*),
the *DataBinding* instance at ``/foo`` will get ``myUserDataFoo`` while the *DataBinding*
instance at ``/bar`` will get ``myUserDataBar``:

```javascript
  myPropertyBinder.activateDataBinding('VIEW', undefined, {exactPath: '/foo', userData: myUserDataFoo});
  myPropertyBinder.activateDataBinding('VIEW', undefined, {exactPath: '/bar', userData: myUserDataBar});
```

Note that when a call to [activateDataBinding()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-activatedatabinding-Method" >}}) causes multiple *DataBinding* instances to be instantiated
for a given *Property* (e.g. when the insertion of a *Property* causes multiple bindings to be created)
the relative order of the creation of the instances is not guaranteed. The only ordering guarantee the *DataBinder*
gives is for the pre- and postorder callbacks [DataBinding Callbacks]({{< ref "property-binder-callbacks.md" >}}) for details) and even that is not guaranteed
in some cases (details will be discussed later).

### Example: choosing the right DataBinding

Let’s assume that in an Application we have the following *Schemas* (among possibly others): there is
a general **Light** *Schema* (``example:light-1.0.0``) as well as two specialized light types that both
inherit from the **Light** *Schema*: **PointLight** (``example:pointlight-1.0.0``) and
**DirectionalLight** (``example:pointlight-1.0.0``). Let's assume we have bindings for both **Light** and
**PointLight** (but not for **DirectionalLight**).

The intention is to instantiate the appropriate binding for the appropriate *Property*: if a **PointLight**
*Property* is inserted into the *Property DDS*, the binding defined for ``example:pointlight-1.0.0``
should be instantiated. If a **DirectionalLight** *Property* is inserted into the *Property DDS*, however, *DataBinder*
should instantiate the "generic" **Light** *DataBinding* since there is no corresponding *DataBinding* definition.

At this point *DataBinder* must know all possible definitions to be able to choose the right one for a given
*Property*. If the *Property DDS* is already populated when the *DataBindings* are defined this can only be done
when the actual activation (that causes bindings to be instantiated) happens in a single call.

### Schema Versions

Databinding definitions can be applied that handle multiple versions in a forward-compatible way, using the optional
upgradeType:

```javascript
  myDataBinder.defineDataBinding('VIEW', 'example:light-1.0.0', LightDataBinding, {
    upgradeType: UpgradeType.MINOR
  });
```

With this option, the databinding implicitly applies to all versions of light from version 1.0.0 and up, but below
version 2.0.0.

If there are multiple definitions with ranges, the best type is chosen:

```javascript
  myDataBinder.defineDataBinding('VIEW', 'example:light-1.0.0', LightDataBinding, {
    upgradeType: UpgradeType.MINOR
  });
  myDataBinder.defineDataBinding('VIEW', 'example:light-1.3.0', NewLightDataBinding, {
    upgradeType: UpgradeType.MINOR
  });
```
Here, ``LightDataBinding`` is used for versions 1.0.0 up to but excluding 1.3.0, and ``NewLightDataBinding`` is used
for version 1.3.0 up to but excluding 2.0.0.

Note that when using databindings like this, the version defined must be explicitly activated. Continuing the above
example, if the activation is:

```javascript
  myDataBinder.activateDataBinding('VIEW', 'example:light-1.0.0');
```

then only the ``LightDataBinding`` will be activated, and not the ``NewLightDataBinding``. To have the
``NewLightDataBinding`` also be activated, it must be done explicitly:


```javascript
  myDataBinder.activateDataBinding('VIEW', 'example:light-1.3.0');
```

## Attaching to and detaching from a Property DDS

After both the attachment to a *Property DDS* and the activation of a *DataBinding*
happened (regardless of which happens first) *DataBindings* will be created retroactively for all existing suitable
*Schemas* in the *Property DDS*. When the *Property DDS* is detached from the *DataBinder*, the instantiated *DataBindings*
will be destroyed, with all remove callbacks called. Optionally existing *DataBinding* definitions and
activations will also be removed.


When *DataBinder* is attached to a *Property DDS*, (by calling [attachTo()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-attachto-Method" >}})) it will retroactively create all
necessary bindings for the *Properties* present in the *Property DDS* at the time of attachment as if they were
just inserted: any instantiated *DataBinding* will have their ``Constructor`` and ``onPostCreate()`` callback called,
as well as any relative path callbacks that listen to ``insert``, ``collectionInsert`` and ``referenceInsert`` events
will be called.

Absolute path callbacks set on *Properties* present in the *Property DDS* listening to these events will
also be called. For details on these callbacks see :ref:`DataBinding Callbacks`. Note that in order for a *DataBinding* to
be instantiated it must be both defined and activated.

This is referred to as 'simulating' the insert callbacks, since they didn't really occur at this moment. If
a callback needs to know whether an insert is being simulated, the modification context has a 'isSimulated'
function.

When *DataBinder* is detached from a *Property DDS*, a similar behavior occurs: the *DataBinder* will call all callbacks
and remove all *DataBindings* as if the *Properties* themselves were removed from the *Property DDS*.
Every existing *DataBinding* will have its ``onPreRemove()`` and ``onRemove()`` callback called as well
as any relative path callbacks defined that listen to ``remove``, ``collectionRemove`` and ``referenceRemove``
events. Absolute path callbacks set on *Properties* present in the *Property DDS* listening to these events will also
be called. Again, for details on these callbacks see :ref:`DataBinding Callbacks`.

Note that when detaching a *Property DDS* by default *DataBinder* will deactivate and undefine all existing
*DataBinding* definitions and activations. The reasoning behind this is that these are usually tied to a specific
*Property DDS* and the *Properties* it contains. However, this behavior may be overridden by supplying *false* as the
optional argument to [detach()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-detach-Method" >}})), e.g. as *myDataBinder.detach(false)*. This will only detach the current *Property DDS*,
but keep all *DataBinding* definitions and activations intact so these will be in effect if a new *Property DDS* is
attached to the *DataBinder*.



As with the inserts, if detaching fires simulated 'remove' events, the provided RemovalContext ``isSimulated()``
will return true. Note: there are some outstanding bugs here, removals are not consistently fired.

## Stateless DataBindings

Stateless *DataBindings* are special *DataBindings* that cannot hold any 'state' (hence the name) and only one
instance is created for all corresponding *Properties*. This instance will have its usual callbacks
(e.g. ``constructor``, ``onPostCreate``, ``onModify``, ``onRemove``, etc.) called as usual and *DataBinder* will
make sure that the *Property* that is returned by the [getProperty()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-getproperty-Method" >}})) call will always point to the current
*Property* for which the callback is called. Note that relative path callbacks are not supported
for Stateless *DataBindings* currently.

Using Stateless *DataBindings* is recommended whenever possible in order to save memory by only having one instance
for all *Properties* in the *Property DDS*. Stateless *DataBindings* may be registered using the
[registerStateless()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-registerstateless-Method" >}})) call. The usual activation options (path restrictions, user data) may be supplied to this call.

Note that Stateless *DataBindings* must derive from the class ``StatelessDataBinding`` (as opposed to ``DataBinding``).

## Deactivating and undefining DataBindings


An application may wish to fine-tune the above behavior, this is possible using [unregisterDataBindings()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-unregisterdatabindings-Method" >}})). By
default this function will deactivate and undefine all existing *DataBinding* definitions and activations, exactly
like when the *Property DDS* is detached. By supplying one or more of the three optional arguments to
[unregisterDataBindings()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-unregisterdatabindings-Method" >}})). The first argument restricts the effect of the function to a specific *bindingType*.
The second argument specifies whether the bindings should be deactivated (it defaults to true) while the third
(and last) optional argument specifies whether the bindings should be undefined (it also defaults to true).
Here are a few examples on how to use this function:

```javascript

  myDataBinder.unregisterDataBindings('VIEW'); // deactivates and undefines all DataBindings that have the ‘VIEW’ bindingType
  myDataBinder.unregisterDataBindings(); // deactivates and undefines all DataBindings
  myDataBinder.unregisterDataBindings('VIEW', true, false); // deactivates all DataBindings that have the ‘VIEW’ bindingType
                                                            // - but keeps their definition so they may be reactivated later
                                                            // (possibly with different options)
  myDataBinder.unregisterDataBindings(undefined, true, false); // deactivates all DataBindings but keeps their definition
                                                               // so they may be reactivated later (possibly with different options)
```
The typical use case for this function is only deactivating bindings (but keeping them defined): the bindings are
defined by a different component, but the application decides on their usage.

When bindings are deactivated, but kept defined, no further bindings will be created for corresponding *Properties*
that are inserted into the *Property DDS*, but currently instantiated bindings will receive ``modify`` and ``remove``
related callbacks if their corresponding *Properties* are modified or removed. Inactive but defined
bindings may be reactivated any time either with the same options as the original activation, or with new ones
(e.g. different path restrictions or ``userData`` objects).

## Undefining or deactivating bindings per instance (advanced)

An application may also wish to undefine or deactivate only certain *DataBinding* instances. For this purpose, both
[defineDataBinding()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-definedatabinding-Method" >}}) and [activateDataBinding()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-activatedatabinding-Method" >}}) returns a handle and calling ``destroy()`` on these handles
will undefine or deactivate the *DataBinding* which belongs to the handle with the same effects as if it was done
via [unregisterDataBindings()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-unregisterdatabindings-Method" >}})). While these handles may be used, they should be considered legacy before
[unregisterDataBindings()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-unregisterdatabindings-Method" >}})) was implemented and in general it is recommended that when necessary,
[unregisterDataBindings()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-unregisterdatabindings-Method" >}})) should be used.

## Undefining active bindings (advanced)


It is also possible to undefine *DataBindings* but keep them active using this function, but it’s not
generally recommended as the behavior can be unintuitive.

Similarly when bindings are kept active, but undefined, no further bindings will be created for corresponding
*Properties* that are inserted into the *Property DDS*, but currently instantiated bindings will receive ``modify`` and
``remove`` related callbacks if their corresponding Properties are modified or removed. Active but undefined bindings
may be redefined any time, although they will not be retroactively created unless re-activated (this is a current
*DataBinder* limitation).

## Other Resources
* [defineDataBinding()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-definedatabinding-Method" >}})
* [activateDataBinding()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-activatedatabinding-Method" >}})
* [getUserData()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-getuserdata-Method" >}})
* [getProperty()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-getproperty-Method" >}})
* [attachTo()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-attachto-Method" >}})
* [detach()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-detach-Method" >}})
* [unregisterDataBindings()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-unregisterdatabindings-Method" >}})
* [popBindingActivationScope()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-popbindingactivationscope-Method" >}})
* [pushBindingActivationScope()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-pushbindingactivationscope-Method" >}})
* [registerStateless()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-registerstateless-Method" >}})
* [popBindingActivationScope()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-popbindingactivationscope-Method" >}})
* [popNotificationDelayScope()]({{< ref "docs/apis/property-dds/sharedpropertytree#property-dds-sharedpropertytree-popnotificationdelayscope-Method" >}})
