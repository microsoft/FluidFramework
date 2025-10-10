# test-suite-a

[Packages](/) > [test-suite-a](/test-suite-a/)

Test package Contains a suite of test cases for validation API documentation generation.

<h2 id="test-suite-a-remarks">Remarks</h2>

This remarks block includes a bulleted list!

- Bullet 1
- Bullet 2

And an ordered list for good measure!

1. List item 1
1. List item 2
1. List item 3

Also, here is a link test, including a bad link, because we should have some reasonable support if this happens:

- Good link (no alias): [TestClass](/test-suite-a/testclass-class)
- Good link (with alias): [function alias text](/test-suite-a/#testfunction-function)
- Bad link (no alias): _InvalidItem_
- Bad link (with alias): _even though I link to an invalid item, I would still like this text to be rendered_

<h2 id="test-suite-a-example">Example</h2>

A test example

```typescript
const foo = bar;
```

## Interfaces

| Interface | Description |
| - | - |
| [TestEmptyInterface](/test-suite-a/testemptyinterface-interface) | An empty interface |
| [TestInterface](/test-suite-a/testinterface-interface) | <p>Test \[interface\]\(https://www.typescriptlang.org/docs/handbook/interfaces.html\).</p><p>Cheers\!</p> |
| [TestInterfaceExtendingOtherInterfaces](/test-suite-a/testinterfaceextendingotherinterfaces-interface) | Test interface that extends other interfaces |
| [TestInterfaceWithCallSignature](/test-suite-a/testinterfacewithcallsignature-interface) | An interface with a complex call signature. |
| [TestInterfaceWithIndexSignature](/test-suite-a/testinterfacewithindexsignature-interface) | An interface with an index signature. |
| [TestInterfaceWithTypeParameter](/test-suite-a/testinterfacewithtypeparameter-interface) | Test interface with generic type parameter |

## Classes

| Class | Description |
| - | - |
| [TestAbstractClass](/test-suite-a/testabstractclass-class) | A test abstract class. |
| [TestClass](/test-suite-a/testclass-class) | Test class |

## Enumerations

| Enum | Description |
| - | - |
| [TestEnum](/test-suite-a/testenum-enum) | Test Enum |

## Types

| TypeAlias | Description |
| - | - |
| [IntersectionType](/test-suite-a/intersectiontype-typealias) | An intersection type combining [TypeWithProperties](/test-suite-a/typewithproperties-typealias) and [TypeWithConstructSignature](/test-suite-a/typewithconstructsignature-typealias). |
| [TestMappedType](/test-suite-a/testmappedtype-typealias) | Test Mapped Type, using [TestEnum](/test-suite-a/testenum-enum) |
| [TypeAlias](/test-suite-a/typealias-typealias) | Test Type-Alias |
| [TypeWithConstructSignature](/test-suite-a/typewithconstructsignature-typealias) | A test type with a construct signature. |
| [TypeWithProperties](/test-suite-a/typewithproperties-typealias) | A test type with properties. |
| [UnionType](/test-suite-a/uniontype-typealias) | A union type combining [TypeWithProperties](/test-suite-a/typewithproperties-typealias) and [TypeWithConstructSignature](/test-suite-a/typewithconstructsignature-typealias). |

## Functions

| Function | Alerts | Return Type | Description |
| - | - | - | - |
| [functionWithOverloads(value)](/test-suite-a/#functionwithoverloads-function) | | string | Takes a number and returns a string. |
| [functionWithOverloads(value)](/test-suite-a/#functionwithoverloads_1-function) | | boolean | Takes a string and returns a boolean. |
| [functionWithOverloads(value)](/test-suite-a/#functionwithoverloads_2-function) | | number | Takes a boolean and returns a number. |
| [testFunction(testParameter, testOptionalParameter)](/test-suite-a/#testfunction-function) | `Alpha` | TTypeParameter | Test function |
| [testFunctionReturningInlineType()](/test-suite-a/#testfunctionreturninginlinetype-function) | | {     foo: number;     bar: [TestEnum](/test-suite-a/testenum-enum); } | Test function that returns an inline type |
| [testFunctionReturningIntersectionType()](/test-suite-a/#testfunctionreturningintersectiontype-function) | `Deprecated` | [TestEmptyInterface](/test-suite-a/testemptyinterface-interface) & [TestInterfaceWithTypeParameter](/test-suite-a/testinterfacewithtypeparameter-interface)\<number> | Test function that returns an inline type |
| [testFunctionReturningUnionType()](/test-suite-a/#testfunctionreturninguniontype-function) | | string \| [TestInterface](/test-suite-a/testinterface-interface) | Test function that returns an inline type |

## Variables

| Variable | Alerts | Modifiers | Type | Description |
| - | - | - | - | - |
| [testConst](/test-suite-a/#testconst-variable) | `Beta` | `readonly` | | Test Constant |
| [testConstWithEmptyDeprecatedBlock](/test-suite-a/#testconstwithemptydeprecatedblock-variable) | `Deprecated` | `readonly` | string | I have a `@deprecated` tag with an empty comment block. |

## Namespaces

| Namespace | Alerts | Description |
| - | - | - |
| [TestBetaNamespace](/test-suite-a/testbetanamespace-namespace/) | `Beta` | A namespace tagged as `@beta`. |
| [TestModule](/test-suite-a/testmodule-namespace/) | | |
| [TestNamespace](/test-suite-a/testnamespace-namespace/) | | Test Namespace |

## Function Details

<h3 id="functionwithoverloads-function">functionWithOverloads</h3>

Takes a number and returns a string.

<h4 id="functionwithoverloads-signature">Signature</h4>

```typescript
export declare function functionWithOverloads(value: number): string;
```

<h4 id="functionwithoverloads-parameters">Parameters</h4>

| Parameter | Type | Description |
| - | - | - |
| value | number | A number. |

<h4 id="functionwithoverloads-returns">Returns</h4>

A string.

**Return type**: string

<h3 id="functionwithoverloads_1-function">functionWithOverloads</h3>

Takes a string and returns a boolean.

<h4 id="functionwithoverloads_1-signature">Signature</h4>

```typescript
export declare function functionWithOverloads(value: string): boolean;
```

<h4 id="functionwithoverloads_1-parameters">Parameters</h4>

| Parameter | Type | Description |
| - | - | - |
| value | string | A string. |

<h4 id="functionwithoverloads_1-returns">Returns</h4>

A boolean.

**Return type**: boolean

<h3 id="functionwithoverloads_2-function">functionWithOverloads</h3>

Takes a boolean and returns a number.

<h4 id="functionwithoverloads_2-signature">Signature</h4>

```typescript
export declare function functionWithOverloads(value: boolean): number;
```

<h4 id="functionwithoverloads_2-parameters">Parameters</h4>

| Parameter | Type | Description |
| - | - | - |
| value | boolean | A boolean. |

<h4 id="functionwithoverloads_2-returns">Returns</h4>

A number.

**Return type**: number

<h3 id="testfunction-function">testFunction</h3>

Test function

**WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.**

<h4 id="testfunction-signature">Signature</h4>

```typescript
export declare function testFunction<TTypeParameter extends TestInterface = TestInterface>(testParameter: TTypeParameter, testOptionalParameter?: TTypeParameter): TTypeParameter;
```

##### Type Parameters

| Parameter | Constraint | Default | Description |
| - | - | - | - |
| TTypeParameter | [TestInterface](/test-suite-a/testinterface-interface) | [TestInterface](/test-suite-a/testinterface-interface) | A test type parameter |

<h4 id="testfunction-remarks">Remarks</h4>

This is a test [link](/test-suite-a/testinterface-interface) to another API member

<h4 id="testfunction-parameters">Parameters</h4>

| Parameter | Modifiers | Type | Description |
| - | - | - | - |
| testParameter | | TTypeParameter | A test parameter |
| testOptionalParameter | optional | TTypeParameter | |

<h4 id="testfunction-returns">Returns</h4>

The provided parameter

**Return type**: TTypeParameter

<h4 id="testfunction-throws">Throws</h4>

An Error when something bad happens.

<h3 id="testfunctionreturninginlinetype-function">testFunctionReturningInlineType</h3>

Test function that returns an inline type

<h4 id="testfunctionreturninginlinetype-signature">Signature</h4>

```typescript
export declare function testFunctionReturningInlineType(): {
    foo: number;
    bar: TestEnum;
};
```

<h4 id="testfunctionreturninginlinetype-returns">Returns</h4>

An inline type

**Return type**: {     foo: number;     bar: [TestEnum](/test-suite-a/testenum-enum); }

<h3 id="testfunctionreturningintersectiontype-function">testFunctionReturningIntersectionType</h3>

Test function that returns an inline type

**WARNING: This API is deprecated and will be removed in a future release.**

This is a test deprecation notice. Here is a [link](/test-suite-a/#testfunctionreturninguniontype-function) to something else! And here is a malformed link to nothing: _{@link }_.

<h4 id="testfunctionreturningintersectiontype-signature">Signature</h4>

```typescript
export declare function testFunctionReturningIntersectionType(): TestEmptyInterface & TestInterfaceWithTypeParameter<number>;
```

<h4 id="testfunctionreturningintersectiontype-returns">Returns</h4>

an intersection type

**Return type**: [TestEmptyInterface](/test-suite-a/testemptyinterface-interface) & [TestInterfaceWithTypeParameter](/test-suite-a/testinterfacewithtypeparameter-interface)\<number>

<h3 id="testfunctionreturninguniontype-function">testFunctionReturningUnionType</h3>

Test function that returns an inline type

<h4 id="testfunctionreturninguniontype-signature">Signature</h4>

```typescript
export declare function testFunctionReturningUnionType(): string | TestInterface;
```

<h4 id="testfunctionreturninguniontype-returns">Returns</h4>

A union type

**Return type**: string | [TestInterface](/test-suite-a/testinterface-interface)

## Variable Details

<h3 id="testconst-variable">testConst</h3>

Test Constant

**WARNING: This API is provided as a beta preview and may change without notice. Use at your own risk.**

<h4 id="testconst-signature">Signature</h4>

```typescript
testConst = 42
```

<h4 id="testconst-remarks">Remarks</h4>

Here are some remarks about the variable

<h3 id="testconstwithemptydeprecatedblock-variable">testConstWithEmptyDeprecatedBlock</h3>

I have a `@deprecated` tag with an empty comment block.

**WARNING: This API is deprecated and will be removed in a future release.**

<h4 id="testconstwithemptydeprecatedblock-signature">Signature</h4>

```typescript
testConstWithEmptyDeprecatedBlock: string
```

**Type**: string
