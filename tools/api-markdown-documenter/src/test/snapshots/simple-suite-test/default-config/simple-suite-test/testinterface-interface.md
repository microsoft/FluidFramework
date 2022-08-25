# TestInterface

[Packages](./index) &gt; [simple-suite-test](./simple-suite-test) &gt; [TestInterface](./simple-suite-test/testinterface-interface)

Test interface

## Remarks {#testinterface-remarks}

Here are some remarks about the interface

## Signature {#testinterface-signature}

```typescript
export interface TestInterface 
```

## Events

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassEventProperty](./simple-suite-test/testinterface-interface#testclasseventproperty-propertysignature) | readonly | () =&gt; void | Test interface event property |

## Properties

|  Property | Modifiers | Default Value | Type | Description |
|  --- | --- | --- | --- | --- |
|  [testInterfaceProperty](./simple-suite-test/testinterface-interface#testinterfaceproperty-propertysignature) |  |  | number | Test interface property |
|  [testOptionalInterfaceProperty](./simple-suite-test/testinterface-interface#testoptionalinterfaceproperty-propertysignature) | optional | 0 | number | Test optional property |

## Methods

|  Method | Return Type | Description |
|  --- | --- | --- |
|  [testInterfaceMethod()](./simple-suite-test/testinterface-interface#testinterfacemethod-methodsignature) | void | Test interface method |

## Call Signatures

|  CallSignature | Description |
|  --- | --- |
|  [(call)(event, listener)](./simple-suite-test/testinterface-interface#_call_-callsignature) | Test interface event call signature |
|  [(call)(event, listener)](./simple-suite-test/testinterface-interface#_call__1-callsignature) | Another example call signature |

## Event Details

### testClassEventProperty {#testclasseventproperty-propertysignature}

Test interface event property

#### Remarks {#testclasseventproperty-remarks}

Here are some remarks about the event property

#### Signature {#testclasseventproperty-signature}

```typescript
readonly testClassEventProperty: () => void;
```

## Property Details

### testInterfaceProperty {#testinterfaceproperty-propertysignature}

Test interface property

#### Remarks {#testinterfaceproperty-remarks}

Here are some remarks about the property

#### Signature {#testinterfaceproperty-signature}

```typescript
testInterfaceProperty: number;
```

### testOptionalInterfaceProperty {#testoptionalinterfaceproperty-propertysignature}

Test optional property

#### Signature {#testoptionalinterfaceproperty-signature}

```typescript
testOptionalInterfaceProperty?: number;
```

## Method Details

### testInterfaceMethod {#testinterfacemethod-methodsignature}

Test interface method

#### Remarks {#testinterfacemethod-remarks}

Here are some remarks about the method

#### Signature {#testinterfacemethod-signature}

```typescript
testInterfaceMethod(): void;
```

## Call Signature Details

### (call) {#_call_-callsignature}

Test interface event call signature

#### Remarks {#_call_-remarks}

Here are some remarks about the event call signature

#### Signature {#_call_-signature}

```typescript
(event: 'testCallSignature', listener: (input: unknown) => void): any;
```

### (call) {#_call__1-callsignature}

Another example call signature

#### Remarks {#_call__1-remarks}

Here are some remarks about the event call signature

#### Signature {#_call__1-signature}

```typescript
(event: 'anotherTestCallSignature', listener: (input: number) => string): number;
```