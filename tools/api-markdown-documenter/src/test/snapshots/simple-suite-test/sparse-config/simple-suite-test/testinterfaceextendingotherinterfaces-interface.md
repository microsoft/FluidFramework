
# TestInterfaceExtendingOtherInterfaces

Test interface that extends other interfaces

## Remarks {#testinterfaceextendingotherinterfaces-remarks}

Here are some remarks about the interface

## Signature {#testinterfaceextendingotherinterfaces-signature}

```typescript
export interface TestInterfaceExtendingOtherInterfaces extends TestInterface, TestInterfaceWithTypeParameter<number>, TestMappedType 
```
<b>Extends:</b> [TestInterface](docs/simple-suite-test/testinterface-interface)

, [TestInterfaceWithTypeParameter](docs/simple-suite-test/testinterfacewithtypeparameter-interface)<!-- -->&lt;number&gt;

, [TestMappedType](docs/simple-suite-test/testmappedtype-typealias)


## Methods

|  Method | Return Type | Description |
|  --- | --- | --- |
|  [testMethod(input)](docs/simple-suite-test/testinterfaceextendingotherinterfaces-testmethod-methodsignature) | number | Test interface method accepting a string and returning a number. |

