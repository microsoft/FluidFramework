# test-suite-a

[Packages](./) &gt; [test-suite-a](./test-suite-a)

Test package

## Remarks {#test-suite-a-remarks}

This remarks block includes a bulleted list!

- Bullet 1

- Bullet 2

And an ordered list for good measure!

1. List item 1

2. List item 2

3. List item 3

Also, here is a link test, including a bad link, because we should have some reasonable support if this happens:

- Good link (no alias): [TestClass](./test-suite-a/testclass-class)

- Good link (with alias): [function alias text](./test-suite-a#testfunction-function)

- Bad link (no alias): _InvalidItem_

- Bad link (with alias): _even though I link to an invalid item, I would still like this text to be rendered_

## Example {#test-suite-a-example}

A test example

```typescript
const foo = bar;
```

## Interfaces

| Interface | Description |
| --- | --- |
| [TestEmptyInterface](./test-suite-a/testemptyinterface-interface) | An empty interface |
| [TestInterface](./test-suite-a/testinterface-interface) | Test interface |
| [TestInterfaceExtendingOtherInterfaces](./test-suite-a/testinterfaceextendingotherinterfaces-interface) | Test interface that extends other interfaces |
| [TestInterfaceWithIndexSignature](./test-suite-a/testinterfacewithindexsignature-interface) | An interface with an index signature. |
| [TestInterfaceWithTypeParameter](./test-suite-a/testinterfacewithtypeparameter-interface) | Test interface with generic type parameter |

## Classes

| Class | Description |
| --- | --- |
| [TestAbstractClass](./test-suite-a/testabstractclass-class) | A test abstract class. |
| [TestClass](./test-suite-a/testclass-class) | Test class |

## Enumerations

| Enum | Description |
| --- | --- |
| [TestEnum](./test-suite-a#testenum-enum) | Test Enum |

## Types

| TypeAlias | Description |
| --- | --- |
| [TestMappedType](./test-suite-a#testmappedtype-typealias) | Test Mapped Type, using [TestEnum](./test-suite-a#testenum-enum) |
| [TypeAlias](./test-suite-a#typealias-typealias) | Test Type-Alias |

## Functions

| Function | Alerts | Return Type | Description |
| --- | --- | --- | --- |
| [testFunction(testParameter, testOptionalParameter)](./test-suite-a#testfunction-function) | `Alpha` | TTypeParameter | Test function |
| [testFunctionReturningInlineType()](./test-suite-a#testfunctionreturninginlinetype-function) |  | {     foo: number;     bar: [TestEnum](./test-suite-a#testenum-enum); } | Test function that returns an inline type |
| [testFunctionReturningIntersectionType()](./test-suite-a#testfunctionreturningintersectiontype-function) | `Deprecated` | [TestEmptyInterface](./test-suite-a/testemptyinterface-interface) &amp; [TestInterfaceWithTypeParameter](./test-suite-a/testinterfacewithtypeparameter-interface)&lt;number&gt; | Test function that returns an inline type |
| [testFunctionReturningUnionType()](./test-suite-a#testfunctionreturninguniontype-function) |  | string \| [TestInterface](./test-suite-a/testinterface-interface) | Test function that returns an inline type |

## Variables

| Variable | Alerts | Modifiers | Type | Description |
| --- | --- | --- | --- | --- |
| [testConst](./test-suite-a#testconst-variable) | `Beta` | `readonly` |  | Test Constant |
| [testConstWithEmptyDeprecatedBlock](./test-suite-a#testconstwithemptydeprecatedblock-variable) | `Deprecated` | `readonly` | string | I have a `@deprecated` tag with an empty comment block. |

## Namespaces

| Namespace | Description |
| --- | --- |
| [TestModule](./test-suite-a/testmodule-namespace) |  |
| [TestNamespace](./test-suite-a/testnamespace-namespace) | Test Namespace |

## Enumeration Details

### TestEnum {#testenum-enum}

Test Enum

#### Signature {#testenum-signature}

```typescript
export declare enum TestEnum
```

#### Remarks {#testenum-remarks}

Here are some remarks about the enum

#### Examples {#testenum-examples}

##### Example 1 {#testenum-example1}

Some example

```typescript
const foo = TestEnum.TestEnumValue1
```

##### Example 2 {#testenum-example2}

Another example

```ts
const bar = TestEnum.TestEnumValue2
```

#### Flags

| Flag | Description |
| --- | --- |
| [TestEnumValue1](./test-suite-a#testenum-testenumvalue1-enummember) | Test enum value 1 (string) |
| [TestEnumValue2](./test-suite-a#testenum-testenumvalue2-enummember) | Test enum value 2 (number) |
| [TestEnumValue3](./test-suite-a#testenum-testenumvalue3-enummember) | Test enum value 3 (default) |

##### TestEnumValue1 {#testenum-testenumvalue1-enummember}

Test enum value 1 (string)

###### Signature {#testenumvalue1-signature}

```typescript
TestEnumValue1 = "test-enum-value-1"
```

###### Remarks {#testenumvalue1-remarks}

Here are some remarks about the enum value

##### TestEnumValue2 {#testenum-testenumvalue2-enummember}

Test enum value 2 (number)

###### Signature {#testenumvalue2-signature}

```typescript
TestEnumValue2 = 3
```

###### Remarks {#testenumvalue2-remarks}

Here are some remarks about the enum value

##### TestEnumValue3 {#testenum-testenumvalue3-enummember}

Test enum value 3 (default)

###### Signature {#testenumvalue3-signature}

```typescript
TestEnumValue3 = 4
```

###### Remarks {#testenumvalue3-remarks}

Here are some remarks about the enum value

## Type Details

### TestMappedType {#testmappedtype-typealias}

Test Mapped Type, using [TestEnum](./test-suite-a#testenum-enum)

#### Signature {#testmappedtype-signature}

```typescript
export type TestMappedType = {
    [K in TestEnum]: boolean;
};
```

#### Remarks {#testmappedtype-remarks}

Here are some remarks about the mapped type

### TypeAlias {#typealias-typealias}

Test Type-Alias

#### Signature {#typealias-signature}

```typescript
export type TypeAlias = string;
```

#### Remarks {#typealias-remarks}

Here are some remarks about the type alias

## Function Details

### testFunction {#testfunction-function}

Test function

**WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.**

#### Signature {#testfunction-signature}

```typescript
export declare function testFunction<TTypeParameter extends TestInterface = TestInterface>(testParameter: TTypeParameter, testOptionalParameter?: TTypeParameter): TTypeParameter;
```

##### Type Parameters

| Parameter | Constraint | Default | Description |
| --- | --- | --- | --- |
| TTypeParameter | [TestInterface](./test-suite-a/testinterface-interface) | [TestInterface](./test-suite-a/testinterface-interface) | A test type parameter |

#### Remarks {#testfunction-remarks}

This is a test [link](./test-suite-a/testinterface-interface) to another API member

#### Parameters {#testfunction-parameters}

| Parameter | Modifiers | Type | Description |
| --- | --- | --- | --- |
| testParameter |  | TTypeParameter | A test parameter |
| testOptionalParameter | optional | TTypeParameter |  |

#### Returns {#testfunction-returns}

The provided parameter

**Return type:** TTypeParameter

#### Throws {#testfunction-throws}

An Error when something bad happens.

### testFunctionReturningInlineType {#testfunctionreturninginlinetype-function}

Test function that returns an inline type

#### Signature {#testfunctionreturninginlinetype-signature}

```typescript
export declare function testFunctionReturningInlineType(): {
    foo: number;
    bar: TestEnum;
};
```

#### Returns {#testfunctionreturninginlinetype-returns}

An inline type

**Return type:** {     foo: number;     bar: [TestEnum](./test-suite-a#testenum-enum); }

### testFunctionReturningIntersectionType {#testfunctionreturningintersectiontype-function}

Test function that returns an inline type

**WARNING: This API is deprecated and will be removed in a future release.**

_This is a test deprecation notice. Here is a_ [_link_](./test-suite-a#testfunctionreturninguniontype-function)<!-- --> _to something else!_

#### Signature {#testfunctionreturningintersectiontype-signature}

```typescript
export declare function testFunctionReturningIntersectionType(): TestEmptyInterface & TestInterfaceWithTypeParameter<number>;
```

#### Returns {#testfunctionreturningintersectiontype-returns}

an intersection type

**Return type:** [TestEmptyInterface](./test-suite-a/testemptyinterface-interface) &amp; [TestInterfaceWithTypeParameter](./test-suite-a/testinterfacewithtypeparameter-interface)&lt;number&gt;

### testFunctionReturningUnionType {#testfunctionreturninguniontype-function}

Test function that returns an inline type

#### Signature {#testfunctionreturninguniontype-signature}

```typescript
export declare function testFunctionReturningUnionType(): string | TestInterface;
```

#### Returns {#testfunctionreturninguniontype-returns}

A union type

**Return type:** string \| [TestInterface](./test-suite-a/testinterface-interface)

## Variable Details

### testConst {#testconst-variable}

Test Constant

**WARNING: This API is provided as a beta preview and may change without notice. Use at your own risk.**

#### Signature {#testconst-signature}

```typescript
testConst = 42
```

#### Remarks {#testconst-remarks}

Here are some remarks about the variable

### testConstWithEmptyDeprecatedBlock {#testconstwithemptydeprecatedblock-variable}

I have a `@deprecated` tag with an empty comment block.

**WARNING: This API is deprecated and will be removed in a future release.**

#### Signature {#testconstwithemptydeprecatedblock-signature}

```typescript
testConstWithEmptyDeprecatedBlock: string
```

**Type:** string
