# TestInterface

[Packages](/) > [test-suite-a](/test-suite-a/) > [TestInterface](/test-suite-a/testinterface-interface)

Test interface

<a id="testinterface-signature"></a>

## Signature

```typescript
export interface TestInterface
```

<a id="testinterface-remarks"></a>

## Remarks

Here are some remarks about the interface

## Constructors

| Constructor | Return Type | Description |
| - | - | - |
| [new (): TestInterface](/test-suite-a/testinterface-interface#_new_-constructsignature) | [TestInterface](/test-suite-a/testinterface-interface) | Test construct signature. |

## Events

| Property | Modifiers | Type | Description |
| - | - | - | - |
| [testClassEventProperty](/test-suite-a/testinterface-interface#testclasseventproperty-propertysignature) | `readonly` | () => void | Test interface event property |

## Properties

| Property | Modifiers | Default Value | Type | Description |
| - | - | - | - | - |
| [getterProperty](/test-suite-a/testinterface-interface#getterproperty-property) | `readonly` | | boolean | A test getter-only interface property. |
| [propertyWithBadInheritDocTarget](/test-suite-a/testinterface-interface#propertywithbadinheritdoctarget-propertysignature) | | | boolean | |
| [setterProperty](/test-suite-a/testinterface-interface#setterproperty-property) | | | boolean | A test property with a getter and a setter. |
| [testInterfaceProperty](/test-suite-a/testinterface-interface#testinterfaceproperty-propertysignature) | | | number | Test interface property |
| [testOptionalInterfaceProperty](/test-suite-a/testinterface-interface#testoptionalinterfaceproperty-propertysignature) | `optional` | 0 | number | Test optional property |

## Methods

| Method | Return Type | Description |
| - | - | - |
| [testInterfaceMethod()](/test-suite-a/testinterface-interface#testinterfacemethod-methodsignature) | void | Test interface method |

## Call Signatures

| CallSignature | Description |
| - | - |
| [(event: 'testCallSignature', listener: (input: unknown) => void): any](/test-suite-a/testinterface-interface#_call_-callsignature) | Test interface event call signature |
| [(event: 'anotherTestCallSignature', listener: (input: number) => string): number](/test-suite-a/testinterface-interface#_call__1-callsignature) | Another example call signature |

## Constructor Details

<a id="_new_-constructsignature"></a>

### new (): TestInterface

Test construct signature.

<a id="_new_-signature"></a>

#### Signature

```typescript
new (): TestInterface;
```

<a id="_new_-returns"></a>

#### Returns

**Return type**: [TestInterface](/test-suite-a/testinterface-interface)

## Event Details

<a id="testclasseventproperty-propertysignature"></a>

### testClassEventProperty

Test interface event property

<a id="testclasseventproperty-signature"></a>

#### Signature

```typescript
readonly testClassEventProperty: () => void;
```

**Type**: () => void

<a id="testclasseventproperty-remarks"></a>

#### Remarks

Here are some remarks about the event property

## Property Details

<a id="getterproperty-property"></a>

### getterProperty

A test getter-only interface property.

<a id="getterproperty-signature"></a>

#### Signature

```typescript
get getterProperty(): boolean;
```

**Type**: boolean

<a id="propertywithbadinheritdoctarget-propertysignature"></a>

### propertyWithBadInheritDocTarget

<a id="propertywithbadinheritdoctarget-signature"></a>

#### Signature

```typescript
propertyWithBadInheritDocTarget: boolean;
```

**Type**: boolean

<a id="setterproperty-property"></a>

### setterProperty

A test property with a getter and a setter.

<a id="setterproperty-signature"></a>

#### Signature

```typescript
get setterProperty(): boolean;

set setterProperty(newValue: boolean);
```

**Type**: boolean

<a id="testinterfaceproperty-propertysignature"></a>

### testInterfaceProperty

Test interface property

<a id="testinterfaceproperty-signature"></a>

#### Signature

```typescript
testInterfaceProperty: number;
```

**Type**: number

<a id="testinterfaceproperty-remarks"></a>

#### Remarks

Here are some remarks about the property

<a id="testoptionalinterfaceproperty-propertysignature"></a>

### testOptionalInterfaceProperty

Test optional property

<a id="testoptionalinterfaceproperty-signature"></a>

#### Signature

```typescript
testOptionalInterfaceProperty?: number;
```

**Type**: number

## Method Details

<a id="testinterfacemethod-methodsignature"></a>

### testInterfaceMethod

Test interface method

<a id="testinterfacemethod-signature"></a>

#### Signature

```typescript
testInterfaceMethod(): void;
```

<a id="testinterfacemethod-remarks"></a>

#### Remarks

Here are some remarks about the method

## Call Signature Details

<a id="_call_-callsignature"></a>

### (event: 'testCallSignature', listener: (input: unknown) => void): any

Test interface event call signature

<a id="_call_-signature"></a>

#### Signature

```typescript
(event: 'testCallSignature', listener: (input: unknown) => void): any;
```

<a id="_call_-remarks"></a>

#### Remarks

Here are some remarks about the event call signature

<a id="_call__1-callsignature"></a>

### (event: 'anotherTestCallSignature', listener: (input: number) => string): number

Another example call signature

<a id="_call__1-signature"></a>

#### Signature

```typescript
(event: 'anotherTestCallSignature', listener: (input: number) => string): number;
```

<a id="_call__1-remarks"></a>

#### Remarks

Here are some remarks about the event call signature

<a id="testinterface-see-also"></a>

## See Also

[testInterfaceMethod()](/test-suite-a/testinterface-interface#testinterfacemethod-methodsignature)

[testInterfaceProperty](/test-suite-a/testinterface-interface#testinterfaceproperty-propertysignature)

[testOptionalInterfaceProperty](/test-suite-a/testinterface-interface#testoptionalinterfaceproperty-propertysignature)

[testClassEventProperty](/test-suite-a/testinterface-interface#testclasseventproperty-propertysignature)
