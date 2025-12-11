## test-suite-a

Test package Contains a suite of test cases for validation API documentation generation.

<h3 id="test-suite-a-remarks">Remarks</h3>

This remarks block includes a bulleted list!

- Bullet 1
- Bullet 2

And an ordered list for good measure!

1. List item 1
1. List item 2
1. List item 3

Also, here is a link test, including a bad link, because we should have some reasonable support if this happens:

- Good link (no alias): [TestClass](docs/test-suite-a/testclass-class)
- Good link (with alias): _function alias text_
- Bad link (no alias): _InvalidItem_
- Bad link (with alias): _even though I link to an invalid item, I would still like this text to be rendered_

<h3 id="test-suite-a-example">Example</h3>

A test example

```typescript
const foo = bar;
```

### Interfaces

| Interface | Description |
| - | - |
| [TestEmptyInterface](docs/test-suite-a/testemptyinterface-interface) | An empty interface |
| [TestInterface](docs/test-suite-a/testinterface-interface) | <p>Test \[interface\]\(https://www.typescriptlang.org/docs/handbook/interfaces.html\).</p><p>Cheers\!</p> |
| [TestInterfaceExtendingOtherInterfaces](docs/test-suite-a/testinterfaceextendingotherinterfaces-interface) | Test interface that extends other interfaces |
| [TestInterfaceWithCallSignature](docs/test-suite-a/testinterfacewithcallsignature-interface) | An interface with a complex call signature. |
| [TestInterfaceWithIndexSignature](docs/test-suite-a/testinterfacewithindexsignature-interface) | An interface with an index signature. |
| [TestInterfaceWithTypeParameter](docs/test-suite-a/testinterfacewithtypeparameter-interface) | Test interface with generic type parameter |

### Classes

| Class | Description |
| - | - |
| [TestAbstractClass](docs/test-suite-a/testabstractclass-class) | A test abstract class. |
| [TestClass](docs/test-suite-a/testclass-class) | Test class |

### Enumerations

| Enum | Description |
| - | - |
| [TestEnum](docs/test-suite-a/testenum-enum) | Test Enum |

### Types

| TypeAlias | Description |
| - | - |
| [IntersectionType](docs/test-suite-a/intersectiontype-typealias) | An intersection type combining [TypeWithProperties](docs/test-suite-a/typewithproperties-typealias) and [TypeWithConstructSignature](docs/test-suite-a/typewithconstructsignature-typealias). |
| [TestMappedType](docs/test-suite-a/testmappedtype-typealias) | Test Mapped Type, using [TestEnum](docs/test-suite-a/testenum-enum) |
| [TypeAlias](docs/test-suite-a/typealias-typealias) | Test Type-Alias |
| [TypeWithConstructSignature](docs/test-suite-a/typewithconstructsignature-typealias) | A test type with a construct signature. |
| [TypeWithProperties](docs/test-suite-a/typewithproperties-typealias) | A test type with properties. |
| [UnionType](docs/test-suite-a/uniontype-typealias) | A union type combining [TypeWithProperties](docs/test-suite-a/typewithproperties-typealias) and [TypeWithConstructSignature](docs/test-suite-a/typewithconstructsignature-typealias). |

### Functions

| Function | Alerts | Return Type | Description |
| - | - | - | - |
| [functionWithOverloads(value)](docs/test-suite-a/functionwithoverloads-function) | | string | Takes a number and returns a string. |
| [functionWithOverloads(value)](docs/test-suite-a/functionwithoverloads_1-function) | | boolean | Takes a string and returns a boolean. |
| [functionWithOverloads(value)](docs/test-suite-a/functionwithoverloads_2-function) | | number | Takes a boolean and returns a number. |
| [testFunctionReturningInlineType()](docs/test-suite-a/testfunctionreturninginlinetype-function) | | {     foo: number;     bar: [TestEnum](docs/test-suite-a/testenum-enum); } | Test function that returns an inline type |
| [testFunctionReturningIntersectionType()](docs/test-suite-a/testfunctionreturningintersectiontype-function) | `Deprecated` | [TestEmptyInterface](docs/test-suite-a/testemptyinterface-interface) & [TestInterfaceWithTypeParameter](docs/test-suite-a/testinterfacewithtypeparameter-interface)\<number> | Test function that returns an inline type |
| [testFunctionReturningUnionType()](docs/test-suite-a/testfunctionreturninguniontype-function) | | string \| [TestInterface](docs/test-suite-a/testinterface-interface) | Test function that returns an inline type |

### Variables

| Variable | Alerts | Modifiers | Type | Description |
| - | - | - | - | - |
| [testConstWithEmptyDeprecatedBlock](docs/test-suite-a/testconstwithemptydeprecatedblock-variable) | `Deprecated` | `readonly` | string | I have a `@deprecated` tag with an empty comment block. |

### Namespaces

| Namespace | Description |
| - | - |
| [TestModule](docs/test-suite-a/testmodule-namespace) | |
| [TestNamespace](docs/test-suite-a/testnamespace-namespace) | Test Namespace |
