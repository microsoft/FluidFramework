
# TestInterfaceExtendingOtherInterfaces

[(model)](./index) &gt; [simple-suite-test](./simple-suite-test)

Test interface that extends other interfaces

## Remarks

Here are some remarks about the interface

## Signature

```typescript
export interface TestInterfaceExtendingOtherInterfaces extends TestInterface, TestInterfaceWithTypeParameter<number>, TestMappedType 
```
<b>Extends:</b> [TestInterface](./simple-suite-test/testinterface-interface)

, [TestInterfaceWithTypeParameter](./simple-suite-test/testinterfacewithtypeparameter-interface)<!-- -->&lt;number&gt;

, [TestMappedType](./simple-suite-test#testmappedtype-typealias)


## Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testMethod(input)](./simple-suite-test/testinterfaceextendingotherinterfaces-interface#testmethod-methodsignature) |  | number | Test interface method accepting a string and returning a number. |

## Method Details

### testMethod {#testmethod-methodsignature}

Test interface method accepting a string and returning a number.

#### Remarks

Here are some remarks about the method

#### Signature

```typescript
testMethod(input: string): number;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  input | string | A string |

