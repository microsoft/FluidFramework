
# simple-suite-test

[(model)](./index) &gt; [simple-suite-test](./simple-suite-test)

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

- Bad link (no alias): *InvalidItem*

- Bad link (with alias): *even though I link to an invalid item, I would still like this text to be rendered*

## Example {#simple-suite-test-example}

A test example

```typescript
const foo = bar;
```

## Interfaces

|  Interface | Description |
|  --- | --- |
|  [TestEmptyInterface](./simple-suite-test/testemptyinterface-interface) | An empty interface |
|  [TestInterface](./simple-suite-test/testinterface-interface) | Test interface |
|  [TestInterfaceExtendingOtherInterfaces](./simple-suite-test/testinterfaceextendingotherinterfaces-interface) | Test interface that extends other interfaces |
|  [TestInterfaceWithTypeParameter](./simple-suite-test/testinterfacewithtypeparameter-interface) | Test interface with generic type parameter |

## Classes

|  Class | Description |
|  --- | --- |
|  [TestAbstractClass](./simple-suite-test/testabstractclass-class) | A test abstract class. |
|  [TestClass](./simple-suite-test/testclass-class) | Test class |

## Namespaces

|  Namespace | Description |
|  --- | --- |
|  [TestNamespace](./simple-suite-test/testnamespace-namespace) | Test Namespace |

## Types

|  TypeAlias | Description |
|  --- | --- |
|  [TestMappedType](./simple-suite-test#testmappedtype-typealias) | Test Mapped Type, using [TestEnum](./simple-suite-test#testenum-enum) |
|  [TypeAlias](./simple-suite-test#typealias-typealias) | Test Type-Alias |

## Functions

|  Function | Return Type | Description |
|  --- | --- | --- |
|  [testFunction(testParameter, testOptionalParameter)](./simple-suite-test#testfunction-function) | TTypeParameter | Test function |
|  [testFunctionReturningInlineType()](./simple-suite-test#testfunctionreturninginlinetype-function) | { foo: number; bar: [TestEnum](./simple-suite-test#testenum-enum)<!-- -->; } | Test function that returns an inline type |
|  [testFunctionReturningIntersectionType()](./simple-suite-test#testfunctionreturningintersectiontype-function) | [TestEmptyInterface](./simple-suite-test/testemptyinterface-interface) &amp; [TestInterfaceWithTypeParameter](./simple-suite-test/testinterfacewithtypeparameter-interface)<!-- -->&lt;number&gt; | Test function that returns an inline type |
|  [testFunctionReturningUnionType()](./simple-suite-test#testfunctionreturninguniontype-function) | string \| [TestInterface](./simple-suite-test/testinterface-interface) | Test function that returns an inline type |

## Enumerations

|  Enum | Description |
|  --- | --- |
|  [TestEnum](./simple-suite-test#testenum-enum) | Test Enum |

## Variables

|  Variable | Modifiers | Description |
|  --- | --- | --- |
|  [testConst](./simple-suite-test#testconst-variable) | readonly | Test Constant |

## Type Details

### TestMappedType {#testmappedtype-typealias}

Test Mapped Type, using [TestEnum](./simple-suite-test#testenum-enum)

#### Remarks {#testmappedtype-remarks}

Here are some remarks about the mapped type

#### Signature {#testmappedtype-signature}

```typescript
export declare type TestMappedType = {
    [K in TestEnum]: boolean;
};
```

### TypeAlias {#typealias-typealias}

Test Type-Alias

#### Remarks {#typealias-remarks}

Here are some remarks about the type alias

#### Signature {#typealias-signature}

```typescript
export declare type TypeAlias = string;
```

## Function Details

### testFunction {#testfunction-function}

Test function

#### Remarks {#testfunction-remarks}

This is a test [link](./simple-suite-test/testinterface-interface) to another API member

#### Signature {#testfunction-signature}

```typescript
export declare function testFunction<TTypeParameter>(testParameter: TTypeParameter, testOptionalParameter?: TTypeParameter): TTypeParameter;
```

#### Parameters {#testfunction-parameters}

|  Parameter | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  testParameter |  | TTypeParameter | A test parameter |
|  testOptionalParameter | optional | TTypeParameter |  |

### testFunctionReturningInlineType {#testfunctionreturninginlinetype-function}

Test function that returns an inline type

#### Signature {#testfunctionreturninginlinetype-signature}

```typescript
export declare function testFunctionReturningInlineType(): {
    foo: number;
    bar: TestEnum;
};
```

### testFunctionReturningIntersectionType {#testfunctionreturningintersectiontype-function}

> This is a test deprecation notice. Here is a [link](./simple-suite-test#testfunctionreturninguniontype-function) to something else!
> 

Test function that returns an inline type

#### Signature {#testfunctionreturningintersectiontype-signature}

```typescript
export declare function testFunctionReturningIntersectionType(): TestEmptyInterface & TestInterfaceWithTypeParameter<number>;
```

### testFunctionReturningUnionType {#testfunctionreturninguniontype-function}

Test function that returns an inline type

#### Signature {#testfunctionreturninguniontype-signature}

```typescript
export declare function testFunctionReturningUnionType(): string | TestInterface;
```

## Enumeration Details

### TestEnum {#testenum-enum}

Test Enum

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

#### Signature {#testenum-signature}

```typescript
export declare enum TestEnum 
```

#### Flags

|  Flag | Description |
|  --- | --- |
|  [TestEnumValue1](./simple-suite-test#testenum-testenumvalue1-enummember) | Test enum value 1 (string) |
|  [TestEnumValue2](./simple-suite-test#testenum-testenumvalue2-enummember) | Test enum value 2 (number) |
|  [TestEnumValue3](./simple-suite-test#testenum-testenumvalue3-enummember) | Test enum value 3 (default) |

#### FlagDetails

##### TestEnumValue1 {#testenum-testenumvalue1-enummember}

Test enum value 1 (string)

###### Remarks {#testenumvalue1-remarks}

Here are some remarks about the enum value

###### Signature {#testenumvalue1-signature}

```typescript
TestEnumValue1 = "test-enum-value-1"
```

##### TestEnumValue2 {#testenum-testenumvalue2-enummember}

Test enum value 2 (number)

###### Remarks {#testenumvalue2-remarks}

Here are some remarks about the enum value

###### Signature {#testenumvalue2-signature}

```typescript
TestEnumValue2 = 3
```

##### TestEnumValue3 {#testenum-testenumvalue3-enummember}

Test enum value 3 (default)

###### Remarks {#testenumvalue3-remarks}

Here are some remarks about the enum value

###### Signature {#testenumvalue3-signature}

```typescript
TestEnumValue3 = 4
```

## Variable Details

### testConst {#testconst-variable}

Test Constant

#### Remarks {#testconst-remarks}

Here are some remarks about the variable

#### Signature {#testconst-signature}

```typescript
testConst = 42
```
