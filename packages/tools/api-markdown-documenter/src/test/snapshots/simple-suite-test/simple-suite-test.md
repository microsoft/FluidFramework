
# simple-suite-test

[(model)](docs/index)

Test package

##### Interfaces

|  Interface | Modifiers | Description |
|  --- | --- | --- |
|  [TestInterface](docs/simple-suite-test/testinterface) |  | Test interface |

##### Classes

|  Class | Modifiers | Description |
|  --- | --- | --- |
|  [TestClass](docs/simple-suite-test/testclass) |  | Test class |

##### Namespaces

|  Namespace | Modifiers | Description |
|  --- | --- | --- |
|  [TestNamespace](docs/simple-suite-test/testnamespace) |  | Test Namespace |

##### Types

|  TypeAlias | Modifiers | Description |
|  --- | --- | --- |
|  [TypeAlias](docs/simple-suite-test#typealias-TypeAlias) |  | Test Type-Alias |

##### Functions

|  Function | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testFunction(testParameter)](docs/simple-suite-test#testfunction-Function) |  | TTypeParameter | Test function |

##### Enumerations

|  Enum | Modifiers | Description |
|  --- | --- | --- |
|  [TestEnum](docs/simple-suite-test#testenum-Enum) |  | Test Enum |

##### Variables

|  Variable | Modifiers | Description |
|  --- | --- | --- |
|  [TestConst](docs/simple-suite-test#testconst-Variable) |  | Test Constant |

#### Details

<b>Type Details</b>

<b>TypeAlias</b>

Test Type-Alias

<b>Signature</b>

```typescript
export declare type TypeAlias = string;
```

<b>Function Details</b>

<b>testFunction</b>

Test function

<b>Signature</b>

```typescript
export declare function testFunction<TTypeParameter>(testParameter: TTypeParameter): TTypeParameter;
```

<b>Parameters</b>

|  Parameter | Type | Description |
|  --- | --- | --- |
|  testParameter | TTypeParameter | A test parameter |

<b>Enumeration Details</b>

<b>TestEnum</b>

Test Enum

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

<b>Signature</b>

```typescript
TestEnumValue1 = "test-enum-value-1"
```

<b>TestEnumValue2</b>

Test enum value 2 (number)

<b>Signature</b>

```typescript
TestEnumValue2 = 3
```

<b>TestEnumValue3</b>

Test enum value 3 (default)

<b>Signature</b>

```typescript
TestEnumValue3 = 4
```

<b>Variable Details</b>

<b>TestConst</b>

Test Constant

<b>Signature</b>

```typescript
TestConst = 42
```
