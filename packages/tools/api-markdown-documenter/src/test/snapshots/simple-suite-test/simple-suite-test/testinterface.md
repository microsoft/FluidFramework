
# TestInterface

[(model)](docs/index) &gt; [simple-suite-test](docs/simple-suite-test)

Test interface

### Signature

```typescript
export interface TestInterface 
```

##### Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassEventProperty](docs/simple-suite-test/testinterface#testclasseventproperty-PropertySignature) |  | () =&gt; void | Test interface event property |
|  [testInterfaceProperty](docs/simple-suite-test/testinterface#testinterfaceproperty-PropertySignature) |  | number | Test interface property |

##### Call Signatures

|  CallSignature | Modifiers | Description |
|  --- | --- | --- |
|  [(call)(event, listener)](docs/simple-suite-test/testinterface#_call_-CallSignature) |  | Test interface event call signature |

##### Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testInterfaceMethod()](docs/simple-suite-test/testinterface#testinterfacemethod-MethodSignature) |  | void | Test interface method |

#### Details

<b>Property Details</b>

<b>testClassEventProperty</b>

Test interface event property

<b>Signature</b>

```typescript
readonly testClassEventProperty: () => void;
```

<b>testInterfaceProperty</b>

Test interface property

<b>Signature</b>

```typescript
testInterfaceProperty: number;
```

<b>Call Signature Details</b>

<b>(call)</b>

Test interface event call signature

<b>Signature</b>

```typescript
(event: 'testCallSignature', listener: (input: unknown) => void): any;
```

<b>Method Details</b>

<b>testInterfaceMethod</b>

Test interface method

<b>Signature</b>

```typescript
testInterfaceMethod(): void;
```
