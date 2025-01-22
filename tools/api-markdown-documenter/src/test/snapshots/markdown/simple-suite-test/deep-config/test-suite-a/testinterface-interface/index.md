# TestInterface

[Packages](/) &gt; [test-suite-a](/test-suite-a) &gt; [TestInterface](/test-suite-a/testinterface-interface)

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
| [new (): TestInterface](/test-suite-a/testinterface-interface/_new_-constructsignature) | [TestInterface](/test-suite-a/testinterface-interface) | Test construct signature. |

## Events

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [testClassEventProperty](/test-suite-a/testinterface-interface/testclasseventproperty-propertysignature) | `readonly` | () =&gt; void | Test interface event property |

## Properties

| Property | Modifiers | Default Value | Type | Description |
| --- | --- | --- | --- | --- |
| [getterProperty](/test-suite-a/testinterface-interface/getterproperty-property) | `readonly` |  | boolean | A test getter-only interface property. |
| [propertyWithBadInheritDocTarget](/test-suite-a/testinterface-interface/propertywithbadinheritdoctarget-propertysignature) |  |  | boolean |  |
| [setterProperty](/test-suite-a/testinterface-interface/setterproperty-property) |  |  | boolean | A test property with a getter and a setter. |
| [testInterfaceProperty](/test-suite-a/testinterface-interface/testinterfaceproperty-propertysignature) |  |  | number | Test interface property |
| [testOptionalInterfaceProperty](/test-suite-a/testinterface-interface/testoptionalinterfaceproperty-propertysignature) | `optional` | 0 | number | Test optional property |

## Methods

| Method | Return Type | Description |
| --- | --- | --- |
| [testInterfaceMethod()](/test-suite-a/testinterface-interface/testinterfacemethod-methodsignature) | void | Test interface method |

## Call Signatures

| CallSignature | Description |
| --- | --- |
| [(event: 'testCallSignature', listener: (input: unknown) =&gt; void): any](/test-suite-a/testinterface-interface/_call_-callsignature) | Test interface event call signature |
| [(event: 'anotherTestCallSignature', listener: (input: number) =&gt; string): number](/test-suite-a/testinterface-interface/_call__1-callsignature) | Another example call signature |

## See Also {#testinterface-see-also}

[testInterfaceMethod()](/test-suite-a/testinterface-interface/testinterfacemethod-methodsignature)

[testInterfaceProperty](/test-suite-a/testinterface-interface/testinterfaceproperty-propertysignature)

[testOptionalInterfaceProperty](/test-suite-a/testinterface-interface/testoptionalinterfaceproperty-propertysignature)

[testClassEventProperty](/test-suite-a/testinterface-interface/testclasseventproperty-propertysignature)
