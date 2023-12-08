<!-- Front Matter! -->

# TestNamespace

[Packages](./) &gt; [simple-suite-test](./simple-suite-test) &gt; [TestNamespace](./simple-suite-test/testnamespace-namespace)

Test Namespace

## Signature {#testnamespace-signature}

```typescript
export declare namespace TestNamespace
```

## Remarks {#testnamespace-remarks}

Here are some remarks about the namespace

## Examples {#testnamespace-examples}

### Example: TypeScript Example {#testnamespace-example1}

```typescript
const foo = bar;
```

### Example: JavaScript Example {#testnamespace-example2}

```javascript
const bar = foo
```

## Interfaces

| Interface | Alerts | Description |
| --- | --- | --- |
| [TestInterface](./simple-suite-test/testnamespace/testinterface-interface) | `ALPHA` | Test interface |

## Classes

| Class | Description |
| --- | --- |
| [TestClass](./simple-suite-test/testnamespace/testclass-class) | Test class |

## Enumerations

| Enum | Description |
| --- | --- |
| [TestEnum](./simple-suite-test/testnamespace-namespace#testenum-enum) | Test Enum |

## Types

| TypeAlias | Description |
| --- | --- |
| [TestTypeAlias](./simple-suite-test/testnamespace-namespace#testtypealias-typealias) | Test Type-Alias |

## Functions

| Function | Return Type | Description |
| --- | --- | --- |
| [testFunction(testParameter)](./simple-suite-test/testnamespace-namespace#testfunction-function) | number | Test function |

## Variables

| Variable | Alerts | Modifiers | Description |
| --- | --- | --- | --- |
| [TestConst](./simple-suite-test/testnamespace-namespace#testconst-variable) | `BETA` | `readonly` | Test Constant |

## Namespaces

| Namespace | Description |
| --- | --- |
| [TestSubNamespace](./simple-suite-test/testnamespace/testsubnamespace-namespace) | Test sub-namespace |

## Enumeration Details

### TestEnum {#testenum-enum}

Test Enum

#### Signature {#testenum-signature}

```typescript
enum TestEnum
```

#### Flags

| Flag | Description |
| --- | --- |
| [TestEnumValue1](./simple-suite-test/testnamespace-namespace#testenum-testenumvalue1-enummember) | Test enum value 1 |
| [TestEnumValue2](./simple-suite-test/testnamespace-namespace#testenum-testenumvalue2-enummember) | Test enum value 2 |

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

## Type Details

### TestTypeAlias {#testtypealias-typealias}

Test Type-Alias

#### Signature {#testtypealias-signature}

```typescript
type TestTypeAlias = boolean;
```

## Function Details

### testFunction {#testfunction-function}

Test function

#### Signature {#testfunction-signature}

```typescript
function testFunction(testParameter: number): number;
```

#### Parameters {#testfunction-parameters}

| Parameter | Type | Description |
| --- | --- | --- |
| testParameter | number |  |

#### Returns {#testfunction-returns}

A number

**Return type:** number

#### Throws {#testfunction-throws}

An Error

## Variable Details

### TestConst (BETA) {#testconst-variable}

Test Constant

**WARNING: This API is provided as a beta preview and may change without notice. Use at your own risk.**

#### Signature {#testconst-signature}

```typescript
TestConst = "Hello world!"
```
