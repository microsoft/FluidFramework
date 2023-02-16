# TestClass

[Packages](./) &gt; [simple-suite-test](./simple-suite-test) &gt; [TestNamespace](./simple-suite-test/testnamespace-namespace) &gt; [TestClass](./simple-suite-test/testnamespace/testclass-class)

Test class

## Signature {#testclass-signature}

```typescript
class TestClass 
```

## Constructors

|  Constructor | Description |
|  --- | --- |
|  [(constructor)(testClassProperty)](./simple-suite-test/testnamespace/testclass-class#_constructor_-constructor) | Test class constructor |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassProperty](./simple-suite-test/testnamespace/testclass-class#testclassproperty-property) | <code>readonly</code> | string | Test interface property |

## Methods

|  Method | Return Type | Description |
|  --- | --- | --- |
|  [testClassMethod(testParameter)](./simple-suite-test/testnamespace/testclass-class#testclassmethod-method) | Promise&lt;string&gt; | Test class method |

## Constructor Details

### (constructor) {#_constructor_-constructor}

Test class constructor

#### Signature {#_constructor_-signature}

```typescript
constructor(testClassProperty: string);
```

#### Parameters {#_constructor_-parameters}

|  Parameter | Type | Description |
|  --- | --- | --- |
|  testClassProperty | string | See [TestClass.testClassProperty](./simple-suite-test/testclass-class#testclassproperty-property) |

## Property Details

### testClassProperty {#testclassproperty-property}

Test interface property

#### Signature {#testclassproperty-signature}

```typescript
readonly testClassProperty: string;
```

## Method Details

### testClassMethod {#testclassmethod-method}

Test class method

#### Signature {#testclassmethod-signature}

```typescript
testClassMethod(testParameter: string): Promise<string>;
```

#### Parameters {#testclassmethod-parameters}

|  Parameter | Type | Description |
|  --- | --- | --- |
|  testParameter | string | A string |

#### Returns {#testclassmethod-returns}

A Promise

<b>Return type:</b> Promise&lt;string&gt;

#### Throws {#testclassmethod-throws}

An Error when something happens for which an error should be thrown. Except in the cases where another kind of error is thrown. We don't throw this error in those cases.

A different kind of error when a thing happens, but not when the first kind of error is thrown instead.

😁