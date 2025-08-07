# TestClass

[Packages](/) > [test-suite-a](/test-suite-a/) > [TestNamespace](/test-suite-a/testnamespace-namespace/) > [TestClass](/test-suite-a/testnamespace-namespace/testclass-class)

Test class

<a id="testclass-signature"></a>

## Signature

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

<a id="_constructor_-constructor"></a>

### (constructor)

Test class constructor

<a id="_constructor_-signature"></a>

#### Signature

```typescript
constructor(testClassProperty: string);
```

<a id="_constructor_-parameters"></a>

#### Parameters

| Parameter | Type | Description |
| - | - | - |
| testClassProperty | string | See [testClassProperty](/test-suite-a/testclass-class#testclassproperty-property) |

## Property Details

<a id="testclassproperty-property"></a>

### testClassProperty

Test interface property

<a id="testclassproperty-signature"></a>

#### Signature

```typescript
readonly testClassProperty: string;
```

**Type**: string

## Method Details

<a id="testclassmethod-method"></a>

### testClassMethod

Test class method

<a id="testclassmethod-signature"></a>

#### Signature

```typescript
testClassMethod(testParameter: string): Promise<string>;
```

<a id="testclassmethod-parameters"></a>

#### Parameters

| Parameter | Type | Description |
| - | - | - |
| testParameter | string | A string |

<a id="testclassmethod-returns"></a>

#### Returns

A Promise

**Return type**: Promise\<string>

<a id="testclassmethod-throws"></a>

#### Throws

An Error when something happens for which an error should be thrown. Except in the cases where another kind of error is thrown. We don't throw this error in those cases.

A different kind of error when a thing happens, but not when the first kind of error is thrown instead.

😁
