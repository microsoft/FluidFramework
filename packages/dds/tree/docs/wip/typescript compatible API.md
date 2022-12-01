# Javascript / Typescript compatible API
(do we have a more catchy name for this module?)

## Goals

The overall design goal for this API is to design an API which is a good choice for the majority of web development use cases. It should be convenient to use when developing JS/Typescript applications, while providing a reasonable performance in the majority of use cases.

### Developer experience close to native JS objects

Reading and manipulating data in the tree should feel very similar to using native JS/Typescript objects. For this, we will present a data model that is very similar to JSON, but with added types and schemas. The ES6 proxy will be used to present the underlying data transparently to the users and to track modifications.

Where the use of a proxy / existing JS APIs has disadvantages, e.g. with regard to performance or intention tracking, we will try to provide two separate APIs, one which is as close as possible to a native JS API and a second advanced API for users that need higher performance or additional functionality.

#### Example
This is a hypothetical example how a user might be using the API:
```TypeScript
const person = sharedTree.root as Person;

person.name = "John";
person.age = 43;
person.salary = Int32(5000);
person.address = {
  street: "Main Street",
    zip: "90000"
}
console.log(person.address.street); // prints "Main Street"
person.address.street = "Side Street";
console.log(person.address.street); // prints "Side Street"

delete person.age

sharedTree.context.commit();
```

Users can directly modify and use the data model like native JS objects. Internally, the types will be deduced from the schema, where possible. If there is an ambiguity in the types it should be conveniently possible to provide type information via constructor / function call like syntax.

If no schemas / type information is provided at all, it should be possible to seamlessly fall back to completely untyped JSON.
```TypeScript
person.annotations =  {
    education: [
        {
            type: "primary school",
            ages: {
                start: 5,
                end: 9
            }
        },
        {
            type: "university",
            city: "New York"
        }
    ]
}
```

Note: The code example shown above should only serve as illustration of the intention. In the implementation we might find cases/limitations, where we will have to implement a somwhat different API

### Good integration with TypeScript

We will provide the capability to compile schemas to corresponding TypeScript interfaces. Together with the proxy, these interfaces will provide a good level of static type safety while manipulating data in the shared tree.

For the example above, the typescript type might look like this:
```TypeScript
type Person = {
  name: String;
  age?: Int32;
  salary?: Int32 | Float64;
  address?: Address;
  annotations: any;
};
```

Even though we primarily target TypeScript, the API should also be easy to use as a pure javascript API.

### Staging of changes

Users will be able to directly perform modifications in the data model and stage multiple changes. It will be possible to read back the staged changes before those are submitted. Once a set of changes has been compiled, they can then be committed as a single transactions.

An open question here is, whether we will allow keeping staged changes within the tree, while receiving updates from collaborators (e.g asynchronous modifications of the tree).

### Eventing / Binding to application objects

It should be possible to register for granular events on all modifications of the data model. In addition to that, it should also be possible to bind application objects to schemas. The system should then automatically take care of managing the live time of these object, i.e. creating them when such properties are inserted and destroying them when they are removed.

We also would like to provide the ability to use the tree data model with existing application development frameworks (react, do we want to support others?) and provide efficient updates for those.

### Feature partity / compatibility with PropertyDDS

The API should be suitable as a replacement for the current PropertyDDS API. It should provide a similar development model (e.g. directly modifying the data structures, committing changes, eventing, etc...). It also should be possible to represent data-sets which have been specified via the PropertyDDS schema language in the new model and to convert the existing schemas to the new system. Additionally, we also strive to achieve a performance level which is similar / at least as good as the one provided by the PropertyDDS.

Which level of feature compatibility will we need with the old shared tree? Will this API be used by those use cases or will those all use the lower level APIs?
