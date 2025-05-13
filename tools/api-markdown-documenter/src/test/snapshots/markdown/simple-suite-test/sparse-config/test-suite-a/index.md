## test-suite-a

Test package

### Remarks {#test-suite-a-remarks}

This remarks block includes a bulleted list!

- Bullet 1

- Bullet 2

And an ordered list for good measure!

1. List item 1

2. List item 2

3. List item 3

Also, here is a link test, including a bad link, because we should have some reasonable support if this happens:

- Good link (no alias): [TestClass](docs/test-suite-a/testclass-class)

- Good link (with alias): _function alias text_

- Bad link (no alias): _InvalidItem_

- Bad link (with alias): _even though I link to an invalid item, I would still like this text to be rendered_

### Example {#test-suite-a-example}

A test example

```typescript
const foo = bar;
```

### Interfaces

| Interface | Description |
| --- | --- |
| [TestEmptyInterface](docs/test-suite-a/testemptyinterface-interface) | An empty interface |
| [TestInterface](docs/test-suite-a/testinterface-interface) | Test interface |
| [TestInterfaceExtendingOtherInterfaces](docs/test-suite-a/testinterfaceextendingotherinterfaces-interface) | Test interface that extends other interfaces |
| [TestInterfaceWithIndexSignature](docs/test-suite-a/testinterfacewithindexsignature-interface) | An interface with an index signature. |
| [TestInterfaceWithTypeParameter](docs/test-suite-a/testinterfacewithtypeparameter-interface) | Test interface with generic type parameter |

### Classes

| Class | Description |
| --- | --- |
| [TestAbstractClass](docs/test-suite-a/testabstractclass-class) | A test abstract class. |
| [TestClass](docs/test-suite-a/testclass-class) | Test class |

### Enumerations

| Enum | Description |
| --- | --- |
| [TestEnum](docs/test-suite-a/testenum-enum) | Test Enum |

### Types

| TypeAlias | Description |
| --- | --- |
| [TestMappedType](docs/test-suite-a/testmappedtype-typealias) | Test Mapped Type, using [TestEnum](docs/test-suite-a/testenum-enum) |
| [TypeAlias](docs/test-suite-a/typealias-typealias) | Test Type-Alias |

### Functions

| Function | Alerts | Return Type | Description |
| --- | --- | --- | --- |
| [testFunctionReturningInlineType()](docs/test-suite-a/testfunctionreturninginlinetype-function) |  | {     foo: number;     bar: [TestEnum](docs/test-suite-a/testenum-enum); } | Test function that returns an inline type |
| [testFunctionReturningIntersectionType()](docs/test-suite-a/testfunctionreturningintersectiontype-function) | `Deprecated` | [TestEmptyInterface](docs/test-suite-a/testemptyinterface-interface) &amp; [TestInterfaceWithTypeParameter](docs/test-suite-a/testinterfacewithtypeparameter-interface)&lt;number&gt; | Test function that returns an inline type |
| [testFunctionReturningUnionType()](docs/test-suite-a/testfunctionreturninguniontype-function) |  | string \| [TestInterface](docs/test-suite-a/testinterface-interface) | Test function that returns an inline type |

### Variables

| Variable | Alerts | Modifiers | Type | Description |
| --- | --- | --- | --- | --- |
| [testConstWithEmptyDeprecatedBlock](docs/test-suite-a/testconstwithemptydeprecatedblock-variable) | `Deprecated` | `readonly` | string | I have a `@deprecated` tag with an empty comment block. |

### Namespaces

| Namespace | Description |
| --- | --- |
| [TestModule](docs/test-suite-a/testmodule-namespace) |  |
| [TestNamespace](docs/test-suite-a/testnamespace-namespace) | Test Namespace |
