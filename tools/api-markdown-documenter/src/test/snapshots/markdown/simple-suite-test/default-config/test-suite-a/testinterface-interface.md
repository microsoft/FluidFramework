# TestInterface

[Packages](/) &gt; [test-suite-a](/test-suite-a/) &gt; [TestInterface](/test-suite-a/testinterface-interface)

Test interface

## Signature {#testinterface-signature}

```typescript
export interface TestInterface
```

## Remarks {#testinterface-remarks}

Here are some remarks about the interface

## Construct Signatures

| ConstructSignature | Return Type | Description |
| --- | --- | --- |
| [new (): TestInterface](/test-suite-a/testinterface-interface#_new_-constructsignature) | [TestInterface](/test-suite-a/testinterface-interface) | Test construct signature. |

## Events

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [testClassEventProperty](/test-suite-a/testinterface-interface#testclasseventproperty-propertysignature) | `readonly` | () =&gt; void | Test interface event property |

## Properties

| Property | Modifiers | Default Value | Type | Description |
| --- | --- | --- | --- | --- |
| [getterProperty](/test-suite-a/testinterface-interface#getterproperty-property) | `readonly` |  | boolean | A test getter-only interface property. |
| [propertyWithBadInheritDocTarget](/test-suite-a/testinterface-interface#propertywithbadinheritdoctarget-propertysignature) |  |  | boolean |  |
| [setterProperty](/test-suite-a/testinterface-interface#setterproperty-property) |  |  | boolean | A test property with a getter and a setter. |
| [testInterfaceProperty](/test-suite-a/testinterface-interface#testinterfaceproperty-propertysignature) |  |  | number | Test interface property |
| [testOptionalInterfaceProperty](/test-suite-a/testinterface-interface#testoptionalinterfaceproperty-propertysignature) | `optional` | 0 | number | Test optional property |

## Methods

| Method | Return Type | Description |
| --- | --- | --- |
| [testInterfaceMethod()](/test-suite-a/testinterface-interface#testinterfacemethod-methodsignature) | void | Test interface method |

## Call Signatures

| CallSignature | Description |
| --- | --- |
| [(event: 'testCallSignature', listener: (input: unknown) =&gt; void): any](/test-suite-a/testinterface-interface#_call_-callsignature) | Test interface event call signature |
| [(event: 'anotherTestCallSignature', listener: (input: number) =&gt; string): number](/test-suite-a/testinterface-interface#_call__1-callsignature) | Another example call signature |

## Construct Signature Details

### new (): TestInterface {#\_new\_-constructsignature}

Test construct signature.

#### Signature {#\_new\_-signature}

```typescript
new (): TestInterface;
```

#### Returns {#\_new\_-returns}

**Return type:** [TestInterface](/test-suite-a/testinterface-interface)

## Event Details

### testClassEventProperty {#testclasseventproperty-propertysignature}

Test interface event property

#### Signature {#testclasseventproperty-signature}

```typescript
readonly testClassEventProperty: () => void;
```

**Type:** () =&gt; void

#### Remarks {#testclasseventproperty-remarks}

Here are some remarks about the event property

## Property Details

### getterProperty {#getterproperty-property}

A test getter-only interface property.

#### Signature {#getterproperty-signature}

```typescript
get getterProperty(): boolean;
```

**Type:** boolean

### propertyWithBadInheritDocTarget {#propertywithbadinheritdoctarget-propertysignature}

#### Signature {#propertywithbadinheritdoctarget-signature}

```typescript
propertyWithBadInheritDocTarget: boolean;
```

**Type:** boolean

### setterProperty {#setterproperty-property}

A test property with a getter and a setter.

#### Signature {#setterproperty-signature}

```typescript
get setterProperty(): boolean;
set setterProperty(newValue: boolean);
```

**Type:** boolean

### testInterfaceProperty {#testinterfaceproperty-propertysignature}

Test interface property

#### Signature {#testinterfaceproperty-signature}

```typescript
testInterfaceProperty: number;
```

**Type:** number

#### Remarks {#testinterfaceproperty-remarks}

Here are some remarks about the property

### testOptionalInterfaceProperty {#testoptionalinterfaceproperty-propertysignature}

Test optional property

#### Signature {#testoptionalinterfaceproperty-signature}

```typescript
testOptionalInterfaceProperty?: number;
```

**Type:** number

## Method Details

### testInterfaceMethod {#testinterfacemethod-methodsignature}

Test interface method

#### Signature {#testinterfacemethod-signature}

```typescript
testInterfaceMethod(): void;
```

#### Remarks {#testinterfacemethod-remarks}

Here are some remarks about the method

## Call Signature Details

### (event: 'testCallSignature', listener: (input: unknown) =&gt; void): any {#\_call\_-callsignature}

Test interface event call signature

#### Signature {#\_call\_-signature}

```typescript
(event: 'testCallSignature', listener: (input: unknown) => void): any;
```

#### Remarks {#\_call\_-remarks}

Here are some remarks about the event call signature

### (event: 'anotherTestCallSignature', listener: (input: number) =&gt; string): number {#\_call\_\_1-callsignature}

Another example call signature

#### Signature {#\_call\_\_1-signature}

```typescript
(event: 'anotherTestCallSignature', listener: (input: number) => string): number;
```

#### Remarks {#\_call\_\_1-remarks}

Here are some remarks about the event call signature

## See Also {#testinterface-see-also}

[testInterfaceMethod()](/test-suite-a/testinterface-interface#testinterfacemethod-methodsignature)

[testInterfaceProperty](/test-suite-a/testinterface-interface#testinterfaceproperty-propertysignature)

[testOptionalInterfaceProperty](/test-suite-a/testinterface-interface#testoptionalinterfaceproperty-propertysignature)

[testClassEventProperty](/test-suite-a/testinterface-interface#testclasseventproperty-propertysignature)
