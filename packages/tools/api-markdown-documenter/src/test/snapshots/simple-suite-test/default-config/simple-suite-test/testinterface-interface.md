
# TestInterface

[(model)](./index) &gt; [simple-suite-test](./simple-suite-test)

Test interface

## Remarks

Here are some remarks about the interface

## Signature

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

#### Remarks

Here are some remarks about the event property

#### Signature

```typescript
readonly testClassEventProperty: () => void;
```

### testInterfaceProperty {#testinterfaceproperty-propertysignature}

Test interface property

#### Remarks

Here are some remarks about the property

#### Signature

```typescript
testInterfaceProperty: number;
```

## Call Signature Details

### (call) {#_call_-callsignature}

Test interface event call signature

#### Remarks

Here are some remarks about the event call signature

#### Signature

```typescript
(event: 'testCallSignature', listener: (input: unknown) => void): any;
```

### (call) {#_call__1-callsignature}

Another example call signature

#### Remarks

Here are some remarks about the event call signature

#### Signature

```typescript
(event: 'anotherTestCallSignature', listener: (input: number) => string): number;
```

## Method Details

### testInterfaceMethod {#testinterfacemethod-methodsignature}

Test interface method

#### Remarks

Here are some remarks about the method

#### Signature

```typescript
testInterfaceMethod(): void;
```
