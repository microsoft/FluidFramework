
## simple-suite-test

[(model)](docs/index)

Test package

## Interfaces

|  Interface | Modifiers | Description |
|  --- | --- | --- |
|  [TestInterface](docs/simple-suite-test/testinterface) |  | Test interface |

## Classes

|  Class | Modifiers | Description |
|  --- | --- | --- |
|  [TestClass](docs/simple-suite-test/testclass) |  | Test class |

## Namespaces

|  Namespace | Modifiers | Description |
|  --- | --- | --- |
|  [TestNamespace](docs/simple-suite-test/testnamespace) |  | Test Namespace |

## Types

|  TypeAlias | Modifiers | Description |
|  --- | --- | --- |
|  [TypeAlias](docs/simple-suite-test#typealias-TypeAlias) |  | Test Type-Alias |

## Functions

|  Function | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testFunction(testParameter)](docs/simple-suite-test#testfunction-Function) |  | TTypeParameter | Test function |

## Enumerations

|  Enum | Modifiers | Description |
|  --- | --- | --- |
|  [TestEnum](docs/simple-suite-test#testenum-Enum) |  | Test Enum |

## Variables

|  Variable | Modifiers | Description |
|  --- | --- | --- |
|  [TestConst](docs/simple-suite-test#testconst-Variable) |  | Test Constant |

## Details

## Type Details

## TypeAlias

Test Type-Alias

## Signature

```typescript
export declare type TypeAlias = string;
```

## Function Details

## testFunction

Test function

## Signature

```typescript
export declare function testFunction<TTypeParameter>(testParameter: TTypeParameter): TTypeParameter;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  testParameter | TTypeParameter | A test parameter |

## Enumeration Details

## TestEnum

Test Enum

## Signature

```typescript
export declare enum TestEnum 
```

## Flags

|  Flag | Modifiers | Description |
|  --- | --- | --- |
|  [TestEnumValue1](docs/simple-suite-test#testenum-testenumvalue1-EnumMember) |  | Test enum value 1 (string) |
|  [TestEnumValue2](docs/simple-suite-test#testenum-testenumvalue2-EnumMember) |  | Test enum value 2 (number) |
|  [TestEnumValue3](docs/simple-suite-test#testenum-testenumvalue3-EnumMember) |  | Test enum value 3 (default) |

## Details

## Flag Details

## TestEnumValue1

Test enum value 1 (string)

## Signature

```typescript
TestEnumValue1 = "test-enum-value-1"
```

## TestEnumValue2

Test enum value 2 (number)

## Signature

```typescript
TestEnumValue2 = 3
```

## TestEnumValue3

Test enum value 3 (default)

## Signature

```typescript
TestEnumValue3 = 4
```

## Variable Details

## TestConst

Test Constant

## Signature

```typescript
TestConst = 42
```
