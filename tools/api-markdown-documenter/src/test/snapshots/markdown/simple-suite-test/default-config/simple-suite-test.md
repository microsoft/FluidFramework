<!-- Front Matter! -->

# simple-suite-test

[Packages](./) &gt; [simple-suite-test](./simple-suite-test)

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

- Good link (no alias): [TestClass](./simple-suite-test/testclass-class)

- Good link (with alias): [function alias text](./simple-suite-test#testfunction-function)

- Bad link (no alias): _InvalidItem_

- Bad link (with alias): _even though I link to an invalid item, I would still like this text to be rendered_

## Example {#simple-suite-test-example}

A test example

```typescript
const foo = bar;
```

## Interfaces

| Interface | Description |
| --- | --- |
| [TestEmptyInterface](./simple-suite-test/testemptyinterface-interface) | An empty interface |
| [TestInterface](./simple-suite-test/testinterface-interface) | Test interface |
| [TestInterfaceExtendingOtherInterfaces](./simple-suite-test/testinterfaceextendingotherinterfaces-interface) | Test interface that extends other interfaces |
| [TestInterfaceWithIndexSignature](./simple-suite-test/testinterfacewithindexsignature-interface) | An interface with an index signature. |
| [TestInterfaceWithTypeParameter](./simple-suite-test/testinterfacewithtypeparameter-interface) | Test interface with generic type parameter |

## Classes

| Class | Description |
| --- | --- |
| [TestAbstractClass](./simple-suite-test/testabstractclass-class) | A test abstract class. |
| [TestClass](./simple-suite-test/testclass-class) | Test class |

## Enumerations

| Enum | Description |
| --- | --- |
| [TestEnum](./simple-suite-test#testenum-enum) | Test Enum |

## Types

| TypeAlias | Description |
| --- | --- |
| [TestMappedType](./simple-suite-test#testmappedtype-typealias) | Test Mapped Type, using [TestEnum](./simple-suite-test#testenum-enum) |
| [TypeAlias](./simple-suite-test#typealias-typealias) | Test Type-Alias |

## Functions

| Function | Alerts | Return Type | Description |
| --- | --- | --- | --- |
| [testFunction(testParameter, testOptionalParameter)](./simple-suite-test#testfunction-function) | `ALPHA` | TTypeParameter | Test function |
| [testFunctionReturningInlineType()](./simple-suite-test#testfunctionreturninginlinetype-function) |  | {     foo: number;     bar: [TestEnum](./simple-suite-test#testenum-enum); } | Test function that returns an inline type |
| [testFunctionReturningIntersectionType()](./simple-suite-test#testfunctionreturningintersectiontype-function) | `DEPRECATED` | [TestEmptyInterface](./simple-suite-test/testemptyinterface-interface) &amp; [TestInterfaceWithTypeParameter](./simple-suite-test/testinterfacewithtypeparameter-interface)&lt;number&gt; | Test function that returns an inline type |
| [testFunctionReturningUnionType()](./simple-suite-test#testfunctionreturninguniontype-function) |  | string \| [TestInterface](./simple-suite-test/testinterface-interface) | Test function that returns an inline type |

## Variables

| Variable | Alerts | Modifiers | Description |
| --- | --- | --- | --- |
| [testConst](./simple-suite-test#testconst-variable) | `BETA` | `readonly` | Test Constant |
| [testConstWithEmptyDeprecatedBlock](./simple-suite-test#testconstwithemptydeprecatedblock-variable) | `DEPRECATED` | `readonly` | I have a `@deprecated` tag with an empty comment block. |

## Namespaces

| Namespace | Description |
| --- | --- |
| [TestModule](./simple-suite-test/testmodule-namespace) |  |
| [TestNamespace](./simple-suite-test/testnamespace-namespace) | Test Namespace |

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
| [TestEnumValue1](./simple-suite-test#testenum-testenumvalue1-enummember) | Test enum value 1 (string) |
| [TestEnumValue2](./simple-suite-test#testenum-testenumvalue2-enummember) | Test enum value 2 (number) |
| [TestEnumValue3](./simple-suite-test#testenum-testenumvalue3-enummember) | Test enum value 3 (default) |

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

Test Mapped Type, using [TestEnum](./simple-suite-test#testenum-enum)

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

### testFunction (ALPHA) {#testfunction-function}

Test function

**WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.**

#### Signature {#testfunction-signature}

```typescript
export declare function testFunction<TTypeParameter>(testParameter: TTypeParameter, testOptionalParameter?: TTypeParameter): TTypeParameter;
```

#### Remarks {#testfunction-remarks}

This is a test [link](./simple-suite-test/testinterface-interface) to another API member

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

**Return type:** {     foo: number;     bar: [TestEnum](./simple-suite-test#testenum-enum); }

### testFunctionReturningIntersectionType {#testfunctionreturningintersectiontype-function}

Test function that returns an inline type

**WARNING: This API is deprecated and will be removed in a future release.**

_This is a test deprecation notice. Here is a_ [_link_](./simple-suite-test#testfunctionreturninguniontype-function)<!-- --> _to something else!_

#### Signature {#testfunctionreturningintersectiontype-signature}

```typescript
export declare function testFunctionReturningIntersectionType(): TestEmptyInterface & TestInterfaceWithTypeParameter<number>;
```

#### Returns {#testfunctionreturningintersectiontype-returns}

an intersection type

**Return type:** [TestEmptyInterface](./simple-suite-test/testemptyinterface-interface) &amp; [TestInterfaceWithTypeParameter](./simple-suite-test/testinterfacewithtypeparameter-interface)&lt;number&gt;

### testFunctionReturningUnionType {#testfunctionreturninguniontype-function}

Test function that returns an inline type

#### Signature {#testfunctionreturninguniontype-signature}

```typescript
export declare function testFunctionReturningUnionType(): string | TestInterface;
```

#### Returns {#testfunctionreturninguniontype-returns}

A union type

**Return type:** string \| [TestInterface](./simple-suite-test/testinterface-interface)

## Variable Details

### testConst (BETA) {#testconst-variable}

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
testConstWithEmptyDeprecatedBlock = "I have a `@deprecated` tag with an empty comment block."
```
