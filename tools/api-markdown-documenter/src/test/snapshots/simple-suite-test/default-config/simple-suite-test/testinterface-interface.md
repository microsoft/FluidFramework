
# TestInterface

[(model)](./index) &gt; [simple-suite-test](./simple-suite-test)

Test interface

## Remarks {#testinterface-remarks}

Here are some remarks about the interface

## Signature {#testinterface-signature}

```typescript
export interface TestInterface 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassEventProperty](./simple-suite-test/testinterface-interface#testclasseventproperty-propertysignature) |  | () =&gt; void | Test interface event property |
|  [testInterfaceProperty](./simple-suite-test/testinterface-interface#testinterfaceproperty-propertysignature) |  | number | Test interface property |

## Call Signatures

|  CallSignature | Modifiers | Description |
|  --- | --- | --- |
|  [(call)(event, listener)](./simple-suite-test/testinterface-interface#_call_-callsignature) |  | Test interface event call signature |
|  [(call)(event, listener)](./simple-suite-test/testinterface-interface#_call__1-callsignature) |  | Another example call signature |

## Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testInterfaceMethod()](./simple-suite-test/testinterface-interface#testinterfacemethod-methodsignature) |  | void | Test interface method |

## Property Details

### testClassEventProperty {#testclasseventproperty-propertysignature}

Test interface event property

#### Remarks {#testclasseventproperty-remarks}

Here are some remarks about the event property

#### Signature {#testclasseventproperty-signature}

```typescript
readonly testClassEventProperty: () => void;
```

### testInterfaceProperty {#testinterfaceproperty-propertysignature}

Test interface property

#### Remarks {#testinterfaceproperty-remarks}

Here are some remarks about the property

#### Signature {#testinterfaceproperty-signature}

```typescript
testInterfaceProperty: number;
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

## Method Details

### testInterfaceMethod {#testinterfacemethod-methodsignature}

Test interface method

#### Remarks {#testinterfacemethod-remarks}

Here are some remarks about the method

#### Signature {#testinterfacemethod-signature}

```typescript
testInterfaceMethod(): void;
```
