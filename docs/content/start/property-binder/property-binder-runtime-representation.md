---
title: Property DataBinder Runtime Representation
menuPosition: 5
draft: true
---

<!-- markdownlint-disable MD036 -->

The goal of the *DataBinder* runtime representation mechanism is to provide
a way of associating one or more alternate representations of a model to
a *Property*, other than the bare-bones model represented by the *Property DDS*
*BaseProperty*. The *DataBinder* provides a central place for fetching
these alternate representations, and helps manage their lifetime.

Runtime representations may be *Property DDS*-independent classes, perhaps even
implemented by third parties. Like THREE.js objects, topology
classes for a mesh, and UI widgets.

Alternatively, or in addition, a runtime representation may also be a
helper class that provides convenience functions for modifying and updating
the *Property DDS* data. For example:

* a Camera runtime representation may have a LookAt function that updates
  the *Property DDS* data model given a target look-at position, or
* a Vector runtime representation may have a .normalize() function that
  sets the correct length

## Runtime Representation and DataBinding Relationship


DataBindings are intended to map values from the *Property DDS* to runtime
representations, while the runtime representation represents an alternate
view of the *Property*. The DataBinding and the runtime representations can
work together to manage the state in the application.

For example, consider a Camera object that is represented using a THREE.js
THREE.PerspectiveCamera.

In this example, we will use two additional runtime representations to
represent the camera. The THREE.PerspectiveCamera object used by THREE
for rendering and a CameraModel class to include helper functions, such
as a LookAt(position) function that will update the *Property DDS* with the
appropriate rotation.

The pieces can be viewed as follows:

![Property DataBinder Overview](/images/property_binder_representations.png)

The relationships, described by the arrows, are as follows:

* The *Property DDS* contains the ground truth of the state of the Camera,
  and changes are propagated to and from the remote repository through this
  object
* THREE.PerspectiveCamera is used by THREE.js for rendering the graphics
  scene
* The CameraModel object provides the lookAt function which directly reads
  and writes the *Property*
* The CameraDataBinding maps values in the *Property* to the
  THREE.PerspectiveCamera

The *Property DDS*, the THREE.PerspectiveCamera and the CameraModel are all
different runtime representations representing the underlying *Property* data.

Any external changes to the camera automatically update the THREE
representation. In addition, any changes using the CameraModel will be
transmitted to the remote repository, but will also lead to the
THREE.PerspectiveCamera being updated by the CameraDataBinding.

## Defining and Creating Runtime Representations

The *DataBinder* provides functionality for managing the definition,
creation and fetching of runtime representations associated with Property DDS
properties.

Typically, a component will register one or more runtime representations
for a given *Property* with the *DataBinder*, to provide functionality to users
of the component. Users of the runtime representation can use the *DataBinder*
to fetch the instance of a runtime representation for a given *Property*, and
the *DataBinder* will create it if it doesn't already exist. The *DataBinder*
will also take care to destroy the runtime representations when the
associated *Property* is destroyed. In the case of the example above, both
the CameraModel and THREE.PerspectiveCamera runtime representations will be
destroyed (as well as the *BaseProperty*, of course).

### Runtime Representation Definition


The definition of a runtime representation is done with [defineRepresentation()]({{< ref
"docs/apis/property-binder/databinder#property-binder-databinder-definerepresentation-Method" >}}). The function takes
as arguments a bindingType, an *Property* schema typeId, a maker function, an initializer function, and a destroyer
function. Please see the documentation for more parameters to the definition function, such as providing user data.


**Binding type**

The bindingType allows multiple representations to be associated with a
specific *Property*. In the Camera example above, the CameraModel class could
have a bindingType of ‘MODEL', while the THREE.PerspectiveCamera could have
a bindingType of ‘VIEW'. Later, clients can fetch the desired runtime
representation using the appropriate bindingType.

**TypeId**

The typeId provided tells the *DataBinder* what *Property* type the runtime
representation will be built for. Inheritance is supported, see Type
Inheritance below.

Normally, a representation will be associated with a property with precisely the provided typeId. However, you can
optionally pass an *upgradeType* to the [defineRepresentation()]({{< ref
"docs/apis/property-binder/databinder#property-binder-databinder-definerepresentation-Method" >}}) function, and this
will allow forward-compatibility based on the semantic version associated with the type and the representation.

For example, if the *upgradeType* is MINOR, then a representation associated
with the semantic version 1.2.0 will apply to all versions greater than or
equal to 1.2.0, but less than 2.0.0. Other upgrade types are MAJOR and PATCH,
corresponding to the first and last number of the semantic version, respectively.

**Maker function**

The maker function takes as argument a *Property*, and returns the appropriate
runtime representation. A function is used for creation, rather than a
constructor, to give the implementation more control over the initialization
of the instance. Note, it is permitted for a maker function to fetch other
runtime representations during creation.

**Initializer function**

The initializer function is an optional function that is called immediately
after the maker function is called. The two stages of creation are provided
as a last-resort way of breaking cycles in the initialization of runtime
representations. In the case of an unavoidable cycle, the maker would be
used to create the runtime representations, and the fetching and use of other
runtime representations would be moved to the initializer function.

**Destroyer function**

The destroyer function is an optional function that the *DataBinder* will use
when the associated *Property* is removed from the *Property DDS*. If present,
the *DataBinder* will call this function, and internally forget the instance
of the runtime representation. This gives the definer of the runtime
representation a chance to clean up any related data structures. Note,
however, that there is no guarantee that the runtime representation isn't
still being used in another part of the application (e.g., in a THREE scene).
This is the responsibility of the hosting application to maintain.

### Creation and Fetching

Once a runtime representation has been defined for a given *Property* type, it can be fetched using the
[dataBinder.getRepresentation()]({{< ref
"docs/apis/property-binder/databinder#property-binder-databinder-getrepresentation-Method" >}}) function.


The creation of runtime representations is lazy, i.e., the runtime
representations are only created if requested. This is to avoid unnecessary
creation of instances, but it also alleviates creation-order problems when
there are interdependencies between runtime representations.

Once they are created, the instance of the runtime representation is preserved until the *Property* is destroyed. Note
that it is no longer possible to fetch the runtime representation once its associated *Property* is removed. This
includes calling either data binding's [getRepresentation()]({{< ref
"docs/apis/property-binder/databinding#property-binder-databinding-getrepresentation-Method" >}}) convenience function
or [dataBinder.getRepresentation()]({{< ref
"docs/apis/property-binder/databinder#property-binder-databinder-getrepresentation-Method" >}}) in onPreRemove and
onRemove data binding callbacks since when these callbacks are called *Property DDS* has already removed the associated
*Property* from the Property DDS.

When using [dataBinder.getRepresentation()]({{< ref
"docs/apis/property-binder/databinder#property-binder-databinder-getrepresentation-Method" >}}), you provide the
*Property* for which you want the runtime representation for, and the bindingType, to get the appropriate
representation.

### Type Inheritance

Often there will be specializations of runtime representations for different
specializations of a given *Property* schema. For example, a runtime representation
Object3DModel may be defined to handle all *Property DDS* properties of type
Object3D-1.0.0, but then a specialization Mesh3DModel may be needed for schema
Mesh3D-1.0.0, that inherits from Object3D-1.0.0.

The *DataBinder* supports this; simply register multiple runtime representations
for a given bindingType, but with the different *Property* types. When
getRuntimeModel is called for a *Property*, the *DataBinder* will create the most
specialized runtime representation for the given *Property* type and binding
type.

For example:

```javascript
   dataBinder.defineRepresentation(
     'MODEL', 'Object3D-1.0.0', () => new Object3DModel()
   );
   dataBinder.defineRepresentation(
     'MODEL', 'Mesh3D-1.0.0', () => new Mesh3DModel()
   );
```

If `Camera3D-1.0.0` and `Mesh3D-1.0.0` both inherit from `Object3D-1.0.0`,
then the creation of a `Camera3D-1.0.0` *Property* would lead to the creation
of an Object3DModel, while the creation of a `Mesh3D-1.0.0` *Property* would
lead to the creation of a Mesh3DModel.

### Stateless Representations

A Runtime Representation may be marked 'stateless' using the ``stateless: true`` flag in the optional ``options``
argument for [defineRepresentation()]({{< ref
"docs/apis/property-binder/databinder#property-binder-databinder-definerepresentation-Method" >}}), for example:

```javascript
   datadataBinder.defineRepresentation(
     'VIEW', 'Object3D-1.0.0', () => new Object3DView(),  {stateless: true}
   );
```

A Stateless Representation differs from a 'standard' one in that it's not stored by *DataBinder*, it is always recreated
on demand when it is requested via [dataBinding.getRepresentation()]({{< ref
"docs/apis/property-binder/databinding#property-binder-databinding-getrepresentation-Method" >}}) or
[dataBinder.getRepresentation()]({{< ref
"docs/apis/property-binder/databinder#property-binder-databinder-getrepresentation-Method" >}}). A Stateless
Representation may specify an Initializer function similarly to 'standard' Representations in order to break up cycles
in the initialization of Runtime Representations. However, the Destroyer function will be ignored - since this
Representation can not contain any state, there should be no need for a cleanup; in addition, the *DataBinder* is not
tracking the object so cannot even call the function at the appropriate time. Note that it is possible for multiple
instances of the stateless runtime representation to exist, so applications that define Stateless Representations must
take this into account. For example it doesn't make sense to cache or compare such representations as they're always
recreated on the fly.


## Other Resources

<!-- markdownlint-disable -->
* [dataBinder.defineRepresentation()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-definerepresentation-Method" >}})
* [dataBinder.getRepresentation()]({{< ref "docs/apis/property-binder/databinder#property-binder-databinder-getrepresentation-Method" >}})
* [dataBinding.getRepresentation()]({{< ref "docs/apis/property-binder/databinding#property-binder-databinding-getrepresentation-Method" >}})
<!-- markdownlint-enable -->
