# TestInterface

[Packages](/) > [test-suite-a](/test-suite-a/) > [TestInterface](/test-suite-a/testinterface-interface)

Test interface

<h2 id="testinterface-signature">Signature</h2>

```typescript
export interface TestInterface
```

<h2 id="testinterface-remarks">Remarks</h2>

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

<h3 id="_new_-constructsignature">new (): TestInterface</h3>

Test construct signature.

<h4 id="_new_-signature">Signature</h4>

```typescript
new (): TestInterface;
```

<h4 id="_new_-returns">Returns</h4>

**Return type**: [TestInterface](/test-suite-a/testinterface-interface)

## Event Details

<h3 id="testclasseventproperty-propertysignature">testClassEventProperty</h3>

Test interface event property

<h4 id="testclasseventproperty-signature">Signature</h4>

```typescript
readonly testClassEventProperty: () => void;
```

**Type**: () => void

<h4 id="testclasseventproperty-remarks">Remarks</h4>

Here are some remarks about the event property

## Property Details

<h3 id="getterproperty-property">getterProperty</h3>

A test getter-only interface property.

<h4 id="getterproperty-signature">Signature</h4>

```typescript
get getterProperty(): boolean;
```

**Type**: boolean

<h3 id="propertywithbadinheritdoctarget-propertysignature">propertyWithBadInheritDocTarget</h3>

<h4 id="propertywithbadinheritdoctarget-signature">Signature</h4>

```typescript
propertyWithBadInheritDocTarget: boolean;
```

**Type**: boolean

<h3 id="setterproperty-property">setterProperty</h3>

A test property with a getter and a setter.

<h4 id="setterproperty-signature">Signature</h4>

```typescript
get setterProperty(): boolean;

set setterProperty(newValue: boolean);
```

**Type**: boolean

<h3 id="testinterfaceproperty-propertysignature">testInterfaceProperty</h3>

Test interface property

<h4 id="testinterfaceproperty-signature">Signature</h4>

```typescript
testInterfaceProperty: number;
```

**Type**: number

<h4 id="testinterfaceproperty-remarks">Remarks</h4>

Here are some remarks about the property

<h3 id="testoptionalinterfaceproperty-propertysignature">testOptionalInterfaceProperty</h3>

Test optional property

<h4 id="testoptionalinterfaceproperty-signature">Signature</h4>

```typescript
testOptionalInterfaceProperty?: number;
```

**Type**: number

## Method Details

<h3 id="testinterfacemethod-methodsignature">testInterfaceMethod</h3>

Test interface method

<h4 id="testinterfacemethod-signature">Signature</h4>

```typescript
testInterfaceMethod(): void;
```

<h4 id="testinterfacemethod-remarks">Remarks</h4>

Here are some remarks about the method

## Call Signature Details

<h3 id="_call_-callsignature">(event: 'testCallSignature', listener: (input: unknown) => void): any</h3>

Test interface event call signature

<h4 id="_call_-signature">Signature</h4>

```typescript
(event: 'testCallSignature', listener: (input: unknown) => void): any;
```

<h4 id="_call_-remarks">Remarks</h4>

Here are some remarks about the event call signature

<h3 id="_call__1-callsignature">(event: 'anotherTestCallSignature', listener: (input: number) => string): number</h3>

Another example call signature

<h4 id="_call__1-signature">Signature</h4>

```typescript
(event: 'anotherTestCallSignature', listener: (input: number) => string): number;
```

<h4 id="_call__1-remarks">Remarks</h4>

Here are some remarks about the event call signature

<h2 id="testinterface-see-also">See Also</h2>

[testInterfaceMethod()](/test-suite-a/testinterface-interface#testinterfacemethod-methodsignature)

[testInterfaceProperty](/test-suite-a/testinterface-interface#testinterfaceproperty-propertysignature)

[testOptionalInterfaceProperty](/test-suite-a/testinterface-interface#testoptionalinterfaceproperty-propertysignature)

[testClassEventProperty](/test-suite-a/testinterface-interface#testclasseventproperty-propertysignature)
