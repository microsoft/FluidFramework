
# simple-suite-test

[(model)](docs/index)

Test package

### Remarks

This remarks block includes a bulleted list!

- Bullet 1

- Bullet 2

And an ordered list for good measure!

1. List item 1

2. List item 2

3. List item 3

Also, here is a link test, including a bad link, because we should have some reasonable support if this happens:

- Good link (no alias): [TestClass](simple-suite-test/testclass.md)

- Good link (with alias): [function alias text](simple-suite-test.md)

- Bad link (no alias): *InvalidItem*

- Bad link (with alias): *even though I link to an invalid item, I would still like this text to be rendered*

### Example

A test example

```typescript
const foo = bar;
```

#### Interfaces

|  Interface | Modifiers | Description |
|  --- | --- | --- |
|  [TestEmptyInterface](docs/simple-suite-test/testemptyinterface) |  | An empty interface |
|  [TestInterface](docs/simple-suite-test/testinterface) |  | Test interface |
|  [TestInterfaceExtendingOtherInterfaces](docs/simple-suite-test/testinterfaceextendingotherinterfaces) |  | Test interface that extends other interfaces |
|  [TestInterfaceWithTypeParameter](docs/simple-suite-test/testinterfacewithtypeparameter) |  | Test interface with generic type parameter |

#### Classes

|  Class | Modifiers | Description |
|  --- | --- | --- |
|  [TestClass](docs/simple-suite-test/testclass) |  | Test class |

#### Namespaces

|  Namespace | Modifiers | Description |
|  --- | --- | --- |
|  [TestNamespace](docs/simple-suite-test/testnamespace) |  | Test Namespace |

#### Types

|  TypeAlias | Modifiers | Description |
|  --- | --- | --- |
|  [TestMappedType](docs/simple-suite-test#testmappedtype-TypeAlias) |  | Test Mapped Type, using [TestEnum](simple-suite-test.md) |
|  [TypeAlias](docs/simple-suite-test#typealias-TypeAlias) |  | Test Type-Alias |

#### Functions

|  Function | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testFunction(testParameter)](docs/simple-suite-test#testfunction-Function) |  | TTypeParameter | Test function |
|  [testFunctionReturningInlineType()](docs/simple-suite-test#testfunctionreturninginlinetype-Function) |  | { foo: number; bar: [TestEnum](docs/simple-suite-test#testenum-Enum)<!-- -->; } | Test function that returns an inline type |
|  [testFunctionReturningIntersectionType()](docs/simple-suite-test#testfunctionreturningintersectiontype-Function) |  | [TestEmptyInterface](docs/simple-suite-test/testemptyinterface) &amp; [TestInterfaceWithTypeParameter](docs/simple-suite-test/testinterfacewithtypeparameter)<!-- -->&lt;number&gt; | Test function that returns an inline type |
|  [testFunctionReturningUnionType()](docs/simple-suite-test#testfunctionreturninguniontype-Function) |  | string \| [TestInterface](docs/simple-suite-test/testinterface) | Test function that returns an inline type |

#### Enumerations

|  Enum | Modifiers | Description |
|  --- | --- | --- |
|  [TestEnum](docs/simple-suite-test#testenum-Enum) |  | Test Enum |

#### Variables

|  Variable | Modifiers | Description |
|  --- | --- | --- |
|  [testConst](docs/simple-suite-test#testconst-Variable) |  | Test Constant |

### Details

##### Type Details

<b>TestMappedType</b>

Test Mapped Type, using [TestEnum](simple-suite-test.md)

<b>Remarks</b>

Here are some remarks about the mapped type

<b>Signature</b>

```typescript
export declare type TestMappedType = {
    [K in TestEnum]: boolean;
};
```

<b>TypeAlias</b>

Test Type-Alias

<b>Remarks</b>

Here are some remarks about the type alias

<b>Signature</b>

```typescript
export declare type TypeAlias = string;
```

##### Function Details

<b>testFunction</b>

Test function

<b>Remarks</b>

This is a test [link](simple-suite-test/testinterface.md) to another API member

<b>Signature</b>

```typescript
export declare function testFunction<TTypeParameter>(testParameter: TTypeParameter): TTypeParameter;
```

<b>Parameters</b>

|  Parameter | Type | Description |
|  --- | --- | --- |
|  testParameter | TTypeParameter | A test parameter |

<b>testFunctionReturningInlineType</b>

Test function that returns an inline type

<b>Signature</b>

```typescript
export declare function testFunctionReturningInlineType(): {
    foo: number;
    bar: TestEnum;
};
```

<b>testFunctionReturningIntersectionType</b>

Test function that returns an inline type

<b>Signature</b>

```typescript
export declare function testFunctionReturningIntersectionType(): TestEmptyInterface & TestInterfaceWithTypeParameter<number>;
```

<b>testFunctionReturningUnionType</b>

Test function that returns an inline type

<b>Signature</b>

```typescript
export declare function testFunctionReturningUnionType(): string | TestInterface;
```

##### Enumeration Details

<b>TestEnum</b>

Test Enum

<b>Remarks</b>

Here are some remarks about the enum

<b>Examples</b>

<b>Example 1</b>

Some example

```typescript
const foo = TestEnum.TestEnumValue1
```

<b>Example 2</b>

Another example

```ts
const bar = TestEnum.TestEnumValue2
```

<b>Signature</b>

```typescript
export declare enum TestEnum 
```

<b>Flags</b>

|  Flag | Modifiers | Description |
|  --- | --- | --- |
|  [TestEnumValue1](docs/simple-suite-test#testenum-testenumvalue1-EnumMember) |  | Test enum value 1 (string) |
|  [TestEnumValue2](docs/simple-suite-test#testenum-testenumvalue2-EnumMember) |  | Test enum value 2 (number) |
|  [TestEnumValue3](docs/simple-suite-test#testenum-testenumvalue3-EnumMember) |  | Test enum value 3 (default) |

<b>Details</b>

<b>Flag Details</b>

<b>TestEnumValue1</b>

Test enum value 1 (string)

<b>Remarks</b>

Here are some remarks about the enum value

<b>Signature</b>

```typescript
TestEnumValue1 = "test-enum-value-1"
```

<b>TestEnumValue2</b>

Test enum value 2 (number)

<b>Remarks</b>

Here are some remarks about the enum value

<b>Signature</b>

```typescript
TestEnumValue2 = 3
```

<b>TestEnumValue3</b>

Test enum value 3 (default)

<b>Remarks</b>

Here are some remarks about the enum value

<b>Signature</b>

```typescript
TestEnumValue3 = 4
```

##### Variable Details

<b>testConst</b>

Test Constant

<b>Remarks</b>

Here are some remarks about the variable

<b>Signature</b>

```typescript
testConst = 42
```
