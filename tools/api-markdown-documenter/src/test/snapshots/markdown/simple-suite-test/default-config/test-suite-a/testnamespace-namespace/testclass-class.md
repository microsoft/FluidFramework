# TestClass

[Packages](/) > [test-suite-a](/test-suite-a/) > [TestNamespace](/test-suite-a/testnamespace-namespace/) > [TestClass](/test-suite-a/testnamespace-namespace/testclass-class)

Test class

<h2 id="testclass-signature">Signature</h2>

```typescript
class TestClass
```

## Constructors

| Constructor | Description |
| - | - |
| [(constructor)(testClassProperty)](/test-suite-a/testnamespace-namespace/testclass-class#_constructor_-constructor) | Test class constructor |

## Properties

| Property | Modifiers | Type | Description |
| - | - | - | - |
| [testClassProperty](/test-suite-a/testnamespace-namespace/testclass-class#testclassproperty-property) | `readonly` | string | Test interface property |

## Methods

| Method | Return Type | Description |
| - | - | - |
| [testClassMethod(testParameter)](/test-suite-a/testnamespace-namespace/testclass-class#testclassmethod-method) | Promise\<string> | Test class method |

## Constructor Details

<h3 id="_constructor_-constructor">(constructor)</h3>

Test class constructor

<h4 id="_constructor_-signature">Signature</h4>

```typescript
constructor(testClassProperty: string);
```

<h4 id="_constructor_-parameters">Parameters</h4>

| Parameter | Type | Description |
| - | - | - |
| testClassProperty | string | See [testClassProperty](/test-suite-a/testclass-class#testclassproperty-property) |

## Property Details

<h3 id="testclassproperty-property">testClassProperty</h3>

Test interface property

<h4 id="testclassproperty-signature">Signature</h4>

```typescript
readonly testClassProperty: string;
```

**Type**: string

## Method Details

<h3 id="testclassmethod-method">testClassMethod</h3>

Test class method

<h4 id="testclassmethod-signature">Signature</h4>

```typescript
testClassMethod(testParameter: string): Promise<string>;
```

<h4 id="testclassmethod-parameters">Parameters</h4>

| Parameter | Type | Description |
| - | - | - |
| testParameter | string | A string |

<h4 id="testclassmethod-returns">Returns</h4>

A Promise

**Return type**: Promise\<string>

<h4 id="testclassmethod-throws">Throws</h4>

An Error when something happens for which an error should be thrown. Except in the cases where another kind of error is thrown. We don't throw this error in those cases.

A different kind of error when a thing happens, but not when the first kind of error is thrown instead.

😁
