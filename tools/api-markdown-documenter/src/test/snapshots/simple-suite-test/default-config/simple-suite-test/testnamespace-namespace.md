# TestNamespace

[Packages](./index) &gt; [simple-suite-test](./simple-suite-test) &gt; [TestNamespace](./simple-suite-test/testnamespace-namespace)

Test Namespace

## Signature {#testnamespace-signature}

```typescript
export declare namespace TestNamespace 
```

## Remarks {#testnamespace-remarks}

Here are some remarks about the namespace

## Examples {#testnamespace-examples}

### Example 1 {#testnamespace-example1}

Example 1

```typescript
const foo = bar;
```

### Example 2 {#testnamespace-example2}

Example 2

```javascript
const bar = foo
```

## Classes

|  Class | Description |
|  --- | --- |
|  [TestClass](./simple-suite-test/testnamespace/testclass-class) | Test class |

## Enumerations

|  Enum | Description |
|  --- | --- |
|  [TestEnum](./simple-suite-test/testnamespace-namespace#testenum-enum) | Test Enum |

## Functions

|  Function | Return Type | Description |
|  --- | --- | --- |
|  [testFunction(testParameter)](./simple-suite-test/testnamespace-namespace#testfunction-function) | number | Test function |

## Interfaces

|  Interface | Description |
|  --- | --- |
|  [TestInterface](./simple-suite-test/testnamespace/testinterface-interface) | Test interface |

## Namespaces

|  Namespace | Description |
|  --- | --- |
|  [TestSubNamespace](./simple-suite-test/testnamespace/testsubnamespace-namespace) | Test sub-namespace |

## Variables

|  Variable | Modifiers | Description |
|  --- | --- | --- |
|  [TestConst](./simple-suite-test/testnamespace-namespace#testconst-variable) | <code>readonly</code> | Test Constant |

## Types

|  TypeAlias | Description |
|  --- | --- |
|  [TestTypeAlias](./simple-suite-test/testnamespace-namespace#testtypealias-typealias) | Test Type-Alias |

## Enumeration Details

### TestEnum {#testenum-enum}

Test Enum

#### Signature {#testenum-signature}

```typescript
enum TestEnum 
```

#### Flags

|  Flag | Description |
|  --- | --- |
|  [TestEnumValue1](./simple-suite-test/testnamespace-namespace#testenum-testenumvalue1-enummember) | Test enum value 1 |
|  [TestEnumValue2](./simple-suite-test/testnamespace-namespace#testenum-testenumvalue2-enummember) | Test enum value 2 |

#### FlagDetails

##### TestEnumValue1 {#testenum-testenumvalue1-enummember}

Test enum value 1

###### Signature {#testenumvalue1-signature}

```typescript
TestEnumValue1 = 0
```

##### TestEnumValue2 {#testenum-testenumvalue2-enummember}

Test enum value 2

###### Signature {#testenumvalue2-signature}

```typescript
TestEnumValue2 = 1
```

## Function Details

### testFunction {#testfunction-function}

Test function

#### Signature {#testfunction-signature}

```typescript
function testFunction(testParameter: number): number;
```

#### Parameters {#testfunction-parameters}

|  Parameter | Type | Description |
|  --- | --- | --- |
|  testParameter | number |  |

#### Returns {#testfunction-returns}

A number

<b>Return type:</b> number

#### Throws {#testfunction-throws}

An Error

## Variable Details

### TestConst {#testconst-variable}

Test Constant

#### Signature {#testconst-signature}

```typescript
TestConst = "Hello world!"
```

## Type Details

### TestTypeAlias {#testtypealias-typealias}

Test Type-Alias

#### Signature {#testtypealias-signature}

```typescript
type TestTypeAlias = boolean;
```