# TestInterface

Test interface

## Signature {#testinterface-signature}

```typescript
export interface TestInterface 
```

## Remarks {#testinterface-remarks}

Here are some remarks about the interface

## Construct Signatures

|  ConstructSignature | Return Type | Description |
|  --- | --- | --- |
|  [new (): TestInterface](docs/simple-suite-test/testinterface-_new_-constructsignature) | [TestInterface](docs/simple-suite-test/testinterface-interface) | Test construct signature. |

## Events

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassEventProperty](docs/simple-suite-test/testinterface-testclasseventproperty-propertysignature) | <code>readonly</code> | () =&gt; void | Test interface event property |

## Properties

|  Property | Modifiers | Default Value | Type | Description |
|  --- | --- | --- | --- | --- |
|  [testInterfaceProperty](docs/simple-suite-test/testinterface-testinterfaceproperty-propertysignature) | 📝 | 📝 | number | Test interface property |
|  [testOptionalInterfaceProperty](docs/simple-suite-test/testinterface-testoptionalinterfaceproperty-propertysignature) | <code>optional</code> | 0 | number | Test optional property |

## Methods

|  Method | Return Type | Description |
|  --- | --- | --- |
|  [testInterfaceMethod()](docs/simple-suite-test/testinterface-testinterfacemethod-methodsignature) | void | Test interface method |

## Call Signatures

|  CallSignature | Description |
|  --- | --- |
|  [(event: 'testCallSignature', listener: (input: unknown) => void): any](docs/simple-suite-test/testinterface-_call_-callsignature) | Test interface event call signature |
|  [(event: 'anotherTestCallSignature', listener: (input: number) => string): number](docs/simple-suite-test/testinterface-_call__1-callsignature) | Another example call signature |

## See also {#testinterface-see-also}

[TestInterface.testInterfaceMethod()](docs/simple-suite-test/testinterface-testinterfacemethod-methodsignature)

[TestInterface.testInterfaceProperty](docs/simple-suite-test/testinterface-testinterfaceproperty-propertysignature)

[TestInterface.testOptionalInterfaceProperty](docs/simple-suite-test/testinterface-testoptionalinterfaceproperty-propertysignature)

[TestInterface.testClassEventProperty](docs/simple-suite-test/testinterface-testclasseventproperty-propertysignature)