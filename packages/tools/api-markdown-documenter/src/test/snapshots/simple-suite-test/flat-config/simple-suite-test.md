
# simple-suite-test

[(model)](docs/index)

Test package

## Remarks

This remarks block includes a bulleted list!

- Bullet 1

- Bullet 2

And an ordered list for good measure!

1. List item 1

2. List item 2

3. List item 3

Also, here is a link test, including a bad link, because we should have some reasonable support if this happens:

- Good link (no alias): [TestClass](docs/simple-suite-test#testclass-class)

- Good link (with alias): [function alias text](docs/simple-suite-test#testfunction-function)

- Bad link (no alias): *InvalidItem*

- Bad link (with alias): *even though I link to an invalid item, I would still like this text to be rendered*

## Example

A test example

```typescript
const foo = bar;
```

## Interfaces

|  Interface | Modifiers | Description |
|  --- | --- | --- |
|  [TestEmptyInterface](docs/simple-suite-test#testemptyinterface-interface) |  | An empty interface |
|  [TestInterface](docs/simple-suite-test#testinterface-interface) |  | Test interface |
|  [TestInterfaceExtendingOtherInterfaces](docs/simple-suite-test#testinterfaceextendingotherinterfaces-interface) |  | Test interface that extends other interfaces |
|  [TestInterfaceWithTypeParameter](docs/simple-suite-test#testinterfacewithtypeparameter-interface) |  | Test interface with generic type parameter |

## Classes

|  Class | Modifiers | Description |
|  --- | --- | --- |
|  [TestClass](docs/simple-suite-test#testclass-class) |  | Test class |

## Namespaces

|  Namespace | Modifiers | Description |
|  --- | --- | --- |
|  [TestNamespace](docs/simple-suite-test#testnamespace-namespace) |  | Test Namespace |

## Types

|  TypeAlias | Modifiers | Description |
|  --- | --- | --- |
|  [TestMappedType](docs/simple-suite-test#testmappedtype-typealias) |  | Test Mapped Type, using [TestEnum](docs/simple-suite-test#testenum-enum) |
|  [TypeAlias](docs/simple-suite-test#typealias-typealias) |  | Test Type-Alias |

## Functions

|  Function | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testFunction(testParameter)](docs/simple-suite-test#testfunction-function) |  | TTypeParameter | Test function |
|  [testFunctionReturningInlineType()](docs/simple-suite-test#testfunctionreturninginlinetype-function) |  | { foo: number; bar: [TestEnum](docs/simple-suite-test#testenum-enum)<!-- -->; } | Test function that returns an inline type |
|  [testFunctionReturningIntersectionType()](docs/simple-suite-test#testfunctionreturningintersectiontype-function) |  | [TestEmptyInterface](docs/simple-suite-test#testemptyinterface-interface) &amp; [TestInterfaceWithTypeParameter](docs/simple-suite-test#testinterfacewithtypeparameter-interface)<!-- -->&lt;number&gt; | Test function that returns an inline type |
|  [testFunctionReturningUnionType()](docs/simple-suite-test#testfunctionreturninguniontype-function) |  | string \| [TestInterface](docs/simple-suite-test#testinterface-interface) | Test function that returns an inline type |

## Enumerations

|  Enum | Modifiers | Description |
|  --- | --- | --- |
|  [TestEnum](docs/simple-suite-test#testenum-enum) |  | Test Enum |

## Variables

|  Variable | Modifiers | Description |
|  --- | --- | --- |
|  [testConst](docs/simple-suite-test#testconst-variable) |  | Test Constant |

## Interface Details

### TestEmptyInterface {#testemptyinterface-interface}

An empty interface

#### Signature

```typescript
export interface TestEmptyInterface 
```

### TestInterface {#testinterface-interface}

Test interface

#### Remarks

Here are some remarks about the interface

#### Signature

```typescript
export interface TestInterface 
```

#### Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassEventProperty](docs/simple-suite-test#testinterface-testclasseventproperty-propertysignature) |  | () =&gt; void | Test interface event property |
|  [testInterfaceProperty](docs/simple-suite-test#testinterface-testinterfaceproperty-propertysignature) |  | number | Test interface property |

#### Call Signatures

|  CallSignature | Modifiers | Description |
|  --- | --- | --- |
|  [(call)(event, listener)](docs/simple-suite-test#testinterface-_call_-callsignature) |  | Test interface event call signature |
|  [(call)(event, listener)](docs/simple-suite-test#testinterface-_call__1-callsignature) |  | Another example call signature |

#### Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testInterfaceMethod()](docs/simple-suite-test#testinterface-testinterfacemethod-methodsignature) |  | void | Test interface method |

#### Property Details

##### testClassEventProperty {#testinterface-testclasseventproperty-propertysignature}

Test interface event property

###### Remarks

Here are some remarks about the event property

###### Signature

```typescript
readonly testClassEventProperty: () => void;
```

##### testInterfaceProperty {#testinterface-testinterfaceproperty-propertysignature}

Test interface property

###### Remarks

Here are some remarks about the property

###### Signature

```typescript
testInterfaceProperty: number;
```

#### Call Signature Details

##### (call) {#testinterface-_call_-callsignature}

Test interface event call signature

###### Remarks

Here are some remarks about the event call signature

###### Signature

```typescript
(event: 'testCallSignature', listener: (input: unknown) => void): any;
```

##### (call) {#testinterface-_call__1-callsignature}

Another example call signature

###### Remarks

Here are some remarks about the event call signature

###### Signature

```typescript
(event: 'anotherTestCallSignature', listener: (input: number) => string): number;
```

#### Method Details

##### testInterfaceMethod {#testinterface-testinterfacemethod-methodsignature}

Test interface method

###### Remarks

Here are some remarks about the method

###### Signature

```typescript
testInterfaceMethod(): void;
```

### TestInterfaceExtendingOtherInterfaces {#testinterfaceextendingotherinterfaces-interface}

Test interface that extends other interfaces

#### Remarks

Here are some remarks about the interface

#### Signature

```typescript
export interface TestInterfaceExtendingOtherInterfaces extends TestInterface, TestInterfaceWithTypeParameter<number>, TestMappedType 
```
<b>Extends:</b> [TestInterface](docs/simple-suite-test#testinterface-interface)

, [TestInterfaceWithTypeParameter](docs/simple-suite-test#testinterfacewithtypeparameter-interface)<!-- -->&lt;number&gt;

, [TestMappedType](docs/simple-suite-test#testmappedtype-typealias)


#### Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testMethod(input)](docs/simple-suite-test#testinterfaceextendingotherinterfaces-testmethod-methodsignature) |  | number | Test interface method accepting a string and returning a number. |

#### Method Details

##### testMethod {#testinterfaceextendingotherinterfaces-testmethod-methodsignature}

Test interface method accepting a string and returning a number.

###### Remarks

Here are some remarks about the method

###### Signature

```typescript
testMethod(input: string): number;
```

###### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  input | string | A string |

### TestInterfaceWithTypeParameter {#testinterfacewithtypeparameter-interface}

Test interface with generic type parameter

#### Remarks

Here are some remarks about the interface

#### Signature

```typescript
export interface TestInterfaceWithTypeParameter<T> 
```
<b>Type parameters:</b> 

\* <b>T</b>: A type parameter


#### Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testProperty](docs/simple-suite-test#testinterfacewithtypeparameter-testproperty-propertysignature) |  | T | A test interface property using generic type parameter |

#### Property Details

##### testProperty {#testinterfacewithtypeparameter-testproperty-propertysignature}

A test interface property using generic type parameter

###### Remarks

Here are some remarks about the property

###### Signature

```typescript
testProperty: T;
```

## Classe Details

### TestClass {#testclass-class}

Test class

#### Remarks

Here are some remarks about the class

#### Signature

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> 
```
<b>Type parameters:</b> 

\* <b>TTypeParameterA</b>: A type parameter


\* <b>TTypeParameterB</b>: Another type parameter


#### Constructors

|  Constructor | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [(constructor)(testClassProperty, testClassEventProperty)](docs/simple-suite-test#testclass-_constructor_-constructor) |  |  | Test class constructor |

#### Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassEventProperty](docs/simple-suite-test#testclass-testclasseventproperty-property) |  | () =&gt; void | Test class event property |
|  [testClassGetterProperty](docs/simple-suite-test#testclass-testclassgetterproperty-property) |  | number | Test class getter-only property |
|  [testClassProperty](docs/simple-suite-test#testclass-testclassproperty-property) |  | TTypeParameterB | Test class property |

#### Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testClassMethod(input)](docs/simple-suite-test#testclass-testclassmethod-method) |  | TTypeParameterA | Test class method |

#### Constructor Details

##### (constructor) {#testclass-_constructor_-constructor}

Test class constructor

###### Remarks

Here are some remarks about the constructor

###### Signature

```typescript
constructor(testClassProperty: TTypeParameterB, testClassEventProperty: () => void);
```

###### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  testClassProperty | TTypeParameterB | See [TestClass.testClassProperty](docs/simple-suite-test#testclass-testclassproperty-property) |
|  testClassEventProperty | () =&gt; void | See [TestClass.testClassEventProperty](docs/simple-suite-test#testclass-testclasseventproperty-property) |

#### Property Details

##### testClassEventProperty {#testclass-testclasseventproperty-property}

Test class event property

###### Remarks

Here are some remarks about the property

###### Signature

```typescript
readonly testClassEventProperty: () => void;
```

##### testClassGetterProperty {#testclass-testclassgetterproperty-property}

Test class getter-only property

###### Remarks

Here are some remarks about the getter-only property

###### Signature

```typescript
/** @virtual */
get testClassGetterProperty(): number;
```

##### testClassProperty {#testclass-testclassproperty-property}

Test class property

###### Remarks

Here are some remarks about the property

###### Signature

```typescript
readonly testClassProperty: TTypeParameterB;
```

#### Method Details

##### testClassMethod {#testclass-testclassmethod-method}

Test class method

###### Remarks

Here are some remarks about the method

###### Signature

```typescript
/** @sealed */
testClassMethod(input: TTypeParameterA): TTypeParameterA;
```

###### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  input | TTypeParameterA |  |

## Namespace Details

### TestNamespace {#testnamespace-namespace}

Test Namespace

#### Remarks

Here are some remarks about the namespace

#### Examples

##### Example 1

Example 1

##### Example 2

Example 2

#### Signature

```typescript
export declare namespace TestNamespace 
```

#### Interfaces

|  Interface | Modifiers | Description |
|  --- | --- | --- |
|  [TestInterface](docs/simple-suite-test#testnamespace-testinterface-interface) |  | Test interface |

#### Classes

|  Class | Modifiers | Description |
|  --- | --- | --- |
|  [TestClass](docs/simple-suite-test#testnamespace-testclass-class) |  | Test class |

#### Namespaces

|  Namespace | Modifiers | Description |
|  --- | --- | --- |
|  [TestSubNamespace](docs/simple-suite-test#testnamespace-testsubnamespace-namespace) |  | Test sub-namespace |

#### Types

|  TypeAlias | Modifiers | Description |
|  --- | --- | --- |
|  [TypeAlias](docs/simple-suite-test#testnamespace-typealias-typealias) |  | Test Type-Alias |

#### Functions

|  Function | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testFunction(testParameter)](docs/simple-suite-test#testnamespace-testfunction-function) |  | number | Test function |

#### Enumerations

|  Enum | Modifiers | Description |
|  --- | --- | --- |
|  [TestEnum](docs/simple-suite-test#testnamespace-testenum-enum) |  | Test Enum |

#### Variables

|  Variable | Modifiers | Description |
|  --- | --- | --- |
|  [TestConst](docs/simple-suite-test#testnamespace-testconst-variable) |  | Test Constant |

#### Interface Details

##### TestInterface {#testnamespace-testinterface-interface}

Test interface

###### Signature

```typescript
interface TestInterface 
```

###### Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testInterfaceProperty](docs/simple-suite-test#testnamespace-testinterface-testinterfaceproperty-propertysignature) |  | boolean | Test interface property |

###### Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testInterfaceMethod()](docs/simple-suite-test#testnamespace-testinterface-testinterfacemethod-methodsignature) |  | void | Test interface method |

###### Property Details

<b>testInterfaceProperty</b>

Test interface property

<b>Signature</b>

```typescript
testInterfaceProperty: boolean;
```

###### Method Details

<b>testInterfaceMethod</b>

Test interface method

<b>Signature</b>

```typescript
testInterfaceMethod(): void;
```

#### Classe Details

##### TestClass {#testnamespace-testclass-class}

Test class

###### Signature

```typescript
class TestClass 
```

###### Constructors

|  Constructor | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [(constructor)(testClassProperty)](docs/simple-suite-test#testnamespace-testclass-_constructor_-constructor) |  |  | Test class constructor |

###### Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassProperty](docs/simple-suite-test#testnamespace-testclass-testclassproperty-property) |  | string | Test interface property |

###### Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [testClassMethod(testParameter)](docs/simple-suite-test#testnamespace-testclass-testclassmethod-method) |  | Promise&lt;string&gt; | Test class method |

###### Constructor Details

<b>(constructor)</b>

Test class constructor

<b>Signature</b>

```typescript
constructor(testClassProperty: string);
```

<b>Parameters</b>

|  Parameter | Type | Description |
|  --- | --- | --- |
|  testClassProperty | string | See [TestClass.testClassProperty](docs/simple-suite-test#testclass-testclassproperty-property) |

###### Property Details

<b>testClassProperty</b>

Test interface property

<b>Signature</b>

```typescript
readonly testClassProperty: string;
```

###### Method Details

<b>testClassMethod</b>

Test class method

<b>Signature</b>

```typescript
testClassMethod(testParameter: string): Promise<string>;
```

<b>Parameters</b>

|  Parameter | Type | Description |
|  --- | --- | --- |
|  testParameter | string | A string |

#### Namespace Details

##### TestSubNamespace {#testnamespace-testsubnamespace-namespace}

Test sub-namespace

###### Signature

```typescript
namespace TestSubNamespace 
```

#### Type Details

##### TypeAlias {#testnamespace-typealias-typealias}

Test Type-Alias

###### Signature

```typescript
type TypeAlias = boolean;
```

#### Function Details

##### testFunction {#testnamespace-testfunction-function}

Test function

###### Signature

```typescript
function testFunction(testParameter: number): number;
```

###### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  testParameter | number |  |

#### Enumeration Details

##### TestEnum {#testnamespace-testenum-enum}

Test Enum

###### Signature

```typescript
enum TestEnum 
```

###### Flags

|  Flag | Modifiers | Description |
|  --- | --- | --- |
|  [TestEnumValue1](docs/simple-suite-test#testnamespace-testenum-testenumvalue1-enummember) |  | Test enum value 1 |
|  [TestEnumValue2](docs/simple-suite-test#testnamespace-testenum-testenumvalue2-enummember) |  | Test enum value 2 |

###### FlagDetails

<b>TestEnumValue1</b>

Test enum value 1

<b>Signature</b>

```typescript
TestEnumValue1 = 0
```

<b>TestEnumValue2</b>

Test enum value 2

<b>Signature</b>

```typescript
TestEnumValue2 = 1
```

#### Variable Details

##### TestConst {#testnamespace-testconst-variable}

Test Constant

###### Signature

```typescript
TestConst = "Hello world!"
```

## Type Details

### TestMappedType {#testmappedtype-typealias}

Test Mapped Type, using [TestEnum](docs/simple-suite-test#testenum-enum)

#### Remarks

Here are some remarks about the mapped type

#### Signature

```typescript
export declare type TestMappedType = {
    [K in TestEnum]: boolean;
};
```

### TypeAlias {#typealias-typealias}

Test Type-Alias

#### Remarks

Here are some remarks about the type alias

#### Signature

```typescript
export declare type TypeAlias = string;
```

## Function Details

### testFunction {#testfunction-function}

Test function

#### Remarks

This is a test [link](docs/simple-suite-test#testinterface-interface) to another API member

#### Signature

```typescript
export declare function testFunction<TTypeParameter>(testParameter: TTypeParameter): TTypeParameter;
```

#### Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  testParameter | TTypeParameter | A test parameter |

### testFunctionReturningInlineType {#testfunctionreturninginlinetype-function}

Test function that returns an inline type

#### Signature

```typescript
export declare function testFunctionReturningInlineType(): {
    foo: number;
    bar: TestEnum;
};
```

### testFunctionReturningIntersectionType {#testfunctionreturningintersectiontype-function}

Test function that returns an inline type

#### Signature

```typescript
export declare function testFunctionReturningIntersectionType(): TestEmptyInterface & TestInterfaceWithTypeParameter<number>;
```

### testFunctionReturningUnionType {#testfunctionreturninguniontype-function}

Test function that returns an inline type

#### Signature

```typescript
export declare function testFunctionReturningUnionType(): string | TestInterface;
```

## Enumeration Details

### TestEnum {#testenum-enum}

Test Enum

#### Remarks

Here are some remarks about the enum

#### Examples

##### Example 1

Some example

```typescript
const foo = TestEnum.TestEnumValue1
```

##### Example 2

Another example

```ts
const bar = TestEnum.TestEnumValue2
```

#### Signature

```typescript
export declare enum TestEnum 
```

#### Flags

|  Flag | Modifiers | Description |
|  --- | --- | --- |
|  [TestEnumValue1](docs/simple-suite-test#testenum-testenumvalue1-enummember) |  | Test enum value 1 (string) |
|  [TestEnumValue2](docs/simple-suite-test#testenum-testenumvalue2-enummember) |  | Test enum value 2 (number) |
|  [TestEnumValue3](docs/simple-suite-test#testenum-testenumvalue3-enummember) |  | Test enum value 3 (default) |

#### FlagDetails

##### TestEnumValue1 {#testenum-testenumvalue1-enummember}

Test enum value 1 (string)

###### Remarks

Here are some remarks about the enum value

###### Signature

```typescript
TestEnumValue1 = "test-enum-value-1"
```

##### TestEnumValue2 {#testenum-testenumvalue2-enummember}

Test enum value 2 (number)

###### Remarks

Here are some remarks about the enum value

###### Signature

```typescript
TestEnumValue2 = 3
```

##### TestEnumValue3 {#testenum-testenumvalue3-enummember}

Test enum value 3 (default)

###### Remarks

Here are some remarks about the enum value

###### Signature

```typescript
TestEnumValue3 = 4
```

## Variable Details

### testConst {#testconst-variable}

Test Constant

#### Remarks

Here are some remarks about the variable

#### Signature

```typescript
testConst = 42
```
