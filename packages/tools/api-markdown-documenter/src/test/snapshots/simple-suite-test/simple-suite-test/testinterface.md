
## TestInterface

[(model)](docs/index) &gt; [simple-suite-test](docs/simple-suite-test)

Test interface

## Signature

```typescript
export interface TestInterface 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassEventProperty](docs/simple-suite-test/testinterface#testclasseventproperty-PropertySignature) |  | () =&gt; void | Test interface event property |
|  [testInterfaceProperty](docs/simple-suite-test/testinterface#testinterfaceproperty-PropertySignature) |  | number | Test interface property |

## Call Signatures

|  CallSignature | Modifiers | Description |
|  --- | --- | --- |
|  [(call)(event, listener)](docs/simple-suite-test/testinterface#_call_-CallSignature) |  | Test interface event call signature |

## Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testInterfaceMethod()](docs/simple-suite-test/testinterface#testinterfacemethod-MethodSignature) |  | void | Test interface method |

## Details

## Property Details

## testClassEventProperty

Test interface event property

## Signature

```typescript
readonly testClassEventProperty: () => void;
```

## testInterfaceProperty

Test interface property

## Signature

```typescript
testInterfaceProperty: number;
```

## Call Signature Details

## (call)

Test interface event call signature

## Signature

```typescript
(event: 'testCallSignature', listener: (input: unknown) => void): any;
```

## Method Details

## testInterfaceMethod

Test interface method

## Signature

```typescript
testInterfaceMethod(): void;
```
