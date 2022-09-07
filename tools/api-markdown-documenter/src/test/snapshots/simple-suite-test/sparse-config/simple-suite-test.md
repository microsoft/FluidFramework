# simple-suite-test

[Packages](docs/) &gt; [simple-suite-test](docs/simple-suite-test)

Test package

## Remarks {#simple-suite-test-remarks}

This remarks block includes a bulleted list!

- Bullet 1

- Bullet 2

And an ordered list for good measure!

1. List item 1

2. List item 2

3. List item 3

Also, here is a link test, including a bad link, because we should have some reasonable support if this happens:

- Good link (no alias): [TestClass](docs/simple-suite-test/testclass-class)

- Good link (with alias): [function alias text](docs/simple-suite-test/testfunction-function)

- Bad link (no alias): <i>InvalidItem</i>

- Bad link (with alias): <i>even though I link to an invalid item, I would still like this text to be rendered</i>

## Example {#simple-suite-test-example}

A test example

```typescript
const foo = bar;
```

## Interfaces

|  Interface | Description |
|  --- | --- |
|  [TestEmptyInterface](docs/simple-suite-test/testemptyinterface-interface) | An empty interface |
|  [TestInterface](docs/simple-suite-test/testinterface-interface) | Test interface |
|  [TestInterfaceExtendingOtherInterfaces](docs/simple-suite-test/testinterfaceextendingotherinterfaces-interface) | Test interface that extends other interfaces |
|  [TestInterfaceWithTypeParameter](docs/simple-suite-test/testinterfacewithtypeparameter-interface) | Test interface with generic type parameter |

## Classes

|  Class | Description |
|  --- | --- |
|  [TestAbstractClass](docs/simple-suite-test/testabstractclass-class) | A test abstract class. |
|  [TestClass](docs/simple-suite-test/testclass-class) | Test class |

## Enumerations

|  Enum | Description |
|  --- | --- |
|  [TestEnum](docs/simple-suite-test/testenum-enum) | Test Enum |

## Types

|  TypeAlias | Description |
|  --- | --- |
|  [TestMappedType](docs/simple-suite-test/testmappedtype-typealias) | Test Mapped Type, using [TestEnum](docs/simple-suite-test/testenum-enum) |
|  [TypeAlias](docs/simple-suite-test/typealias-typealias) | Test Type-Alias |

## Functions

|  Function | Alerts | Return Type | Description |
|  --- | --- | --- | --- |
|  [testFunction(testParameter, testOptionalParameter)](docs/simple-suite-test/testfunction-function) | 📝 | TTypeParameter | Test function |
|  [testFunctionReturningInlineType()](docs/simple-suite-test/testfunctionreturninginlinetype-function) | 📝 | { foo: number; bar: [TestEnum](docs/simple-suite-test/testenum-enum)<!-- -->; } | Test function that returns an inline type |
|  [testFunctionReturningIntersectionType()](docs/simple-suite-test/testfunctionreturningintersectiontype-function) | <code>DEPRECATED</code> | [TestEmptyInterface](docs/simple-suite-test/testemptyinterface-interface) &amp; [TestInterfaceWithTypeParameter](docs/simple-suite-test/testinterfacewithtypeparameter-interface)<!-- -->&lt;number&gt; | Test function that returns an inline type |
|  [testFunctionReturningUnionType()](docs/simple-suite-test/testfunctionreturninguniontype-function) | 📝 | string \| [TestInterface](docs/simple-suite-test/testinterface-interface) | Test function that returns an inline type |

## Variables

|  Variable | Alerts | Modifiers | Description |
|  --- | --- | --- | --- |
|  [testConst](docs/simple-suite-test/testconst-variable) | 📝 | <code>readonly</code> | Test Constant |
|  [testConstWithEmptyDeprecatedBlock](docs/simple-suite-test/testconstwithemptydeprecatedblock-variable) | <code>DEPRECATED</code> | <code>readonly</code> | I have a <code>@deprecated</code> tag with an empty comment block. |

## Namespaces

|  Namespace | Description |
|  --- | --- |
|  [TestModule](docs/simple-suite-test/testmodule-namespace) | 📝 |
|  [TestNamespace](docs/simple-suite-test/testnamespace-namespace) | Test Namespace |