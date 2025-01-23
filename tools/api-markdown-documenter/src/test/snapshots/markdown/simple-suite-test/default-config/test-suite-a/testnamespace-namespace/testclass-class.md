# TestClass

[Packages](./) &gt; [test-suite-a](./test-suite-a/) &gt; [TestNamespace](./test-suite-a/testnamespace-namespace/) &gt; [TestClass](./test-suite-a/testnamespace-namespace/testclass-class)

Test class

## Signature {#testclass-signature}

```typescript
class TestClass
```

## Constructors

| Constructor | Description |
| --- | --- |
| [(constructor)(testClassProperty)](./test-suite-a/testnamespace-namespace/testclass-class#_constructor_-constructor) | Test class constructor |

## Properties

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [testClassProperty](./test-suite-a/testnamespace-namespace/testclass-class#testclassproperty-property) | `readonly` | string | Test interface property |

## Methods

| Method | Return Type | Description |
| --- | --- | --- |
| [testClassMethod(testParameter)](./test-suite-a/testnamespace-namespace/testclass-class#testclassmethod-method) | Promise&lt;string&gt; | Test class method |

## Constructor Details

### (constructor) {#\_constructor\_-constructor}

Test class constructor

#### Signature {#\_constructor\_-signature}

```typescript
constructor(testClassProperty: string);
```

#### Parameters {#\_constructor\_-parameters}

| Parameter | Type | Description |
| --- | --- | --- |
| testClassProperty | string | See [testClassProperty](./test-suite-a/testclass-class#testclassproperty-property) |

## Property Details

### testClassProperty {#testclassproperty-property}

Test interface property

#### Signature {#testclassproperty-signature}

```typescript
readonly testClassProperty: string;
```

**Type:** string

## Method Details

### testClassMethod {#testclassmethod-method}

Test class method

#### Signature {#testclassmethod-signature}

```typescript
testClassMethod(testParameter: string): Promise<string>;
```

#### Parameters {#testclassmethod-parameters}

| Parameter | Type | Description |
| --- | --- | --- |
| testParameter | string | A string |

#### Returns {#testclassmethod-returns}

A Promise

**Return type:** Promise&lt;string&gt;

#### Throws {#testclassmethod-throws}

An Error when something happens for which an error should be thrown. Except in the cases where another kind of error is thrown. We don't throw this error in those cases.

A different kind of error when a thing happens, but not when the first kind of error is thrown instead.

😁
