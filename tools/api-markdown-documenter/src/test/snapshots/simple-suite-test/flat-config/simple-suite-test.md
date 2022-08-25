# simple-suite-test

[Packages](docs/index) &gt; [simple-suite-test](docs/simple-suite-test)

Test package

## Remarks {#simple-suite-test-remarks}

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

- Bad link (no alias): <i>InvalidItem</i>

- Bad link (with alias): <i>even though I link to an invalid item, I would still like this text to be rendered</i>

## Example {#simple-suite-test-example}

A test example

```typescript
const foo = bar;
```

## Classes

|  Class | Description |
|  --- | --- |
|  [TestAbstractClass](docs/simple-suite-test#testabstractclass-class) | A test abstract class. |
|  [TestClass](docs/simple-suite-test#testclass-class) | Test class |

## Enumerations

|  Enum | Description |
|  --- | --- |
|  [TestEnum](docs/simple-suite-test#testenum-enum) | Test Enum |

## Functions

|  Function | Return Type | Description |
|  --- | --- | --- |
|  [testFunction(testParameter, testOptionalParameter)](docs/simple-suite-test#testfunction-function) | TTypeParameter | Test function |
|  [testFunctionReturningInlineType()](docs/simple-suite-test#testfunctionreturninginlinetype-function) | { foo: number; bar: [TestEnum](docs/simple-suite-test#testenum-enum)<!-- -->; } | Test function that returns an inline type |
|  [testFunctionReturningIntersectionType()](docs/simple-suite-test#testfunctionreturningintersectiontype-function) | [TestEmptyInterface](docs/simple-suite-test#testemptyinterface-interface) &amp; [TestInterfaceWithTypeParameter](docs/simple-suite-test#testinterfacewithtypeparameter-interface)<!-- -->&lt;number&gt; | Test function that returns an inline type |
|  [testFunctionReturningUnionType()](docs/simple-suite-test#testfunctionreturninguniontype-function) | string \| [TestInterface](docs/simple-suite-test#testinterface-interface) | Test function that returns an inline type |

## Interfaces

|  Interface | Description |
|  --- | --- |
|  [TestEmptyInterface](docs/simple-suite-test#testemptyinterface-interface) | An empty interface |
|  [TestInterface](docs/simple-suite-test#testinterface-interface) | Test interface |
|  [TestInterfaceExtendingOtherInterfaces](docs/simple-suite-test#testinterfaceextendingotherinterfaces-interface) | Test interface that extends other interfaces |
|  [TestInterfaceWithTypeParameter](docs/simple-suite-test#testinterfacewithtypeparameter-interface) | Test interface with generic type parameter |

## Namespaces

|  Namespace | Description |
|  --- | --- |
|  [TestNamespace](docs/simple-suite-test#testnamespace-namespace) | Test Namespace |

## Variables

|  Variable | Modifiers | Description |
|  --- | --- | --- |
|  [testConst](docs/simple-suite-test#testconst-variable) | readonly | Test Constant |

## Types

|  TypeAlias | Description |
|  --- | --- |
|  [TestMappedType](docs/simple-suite-test#testmappedtype-typealias) | Test Mapped Type, using [TestEnum](docs/simple-suite-test#testenum-enum) |
|  [TypeAlias](docs/simple-suite-test#typealias-typealias) | Test Type-Alias |

## Classe Details

### TestAbstractClass {#testabstractclass-class}

A test abstract class.

#### Signature {#testabstractclass-signature}

```typescript
export declare abstract class TestAbstractClass 
```

#### Constructors

|  Constructor | Description |
|  --- | --- |
|  [(constructor)(privateProperty, protectedProperty)](docs/simple-suite-test#testabstractclass-_constructor_-constructor) | This is a constructor. |

#### Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [abstractPropertyGetter](docs/simple-suite-test#testabstractclass-abstractpropertygetter-property) | readonly | [TestMappedType](docs/simple-suite-test#testmappedtype-typealias) | A test abstract getter property. |
|  [protectedProperty](docs/simple-suite-test#testabstractclass-protectedproperty-property) | readonly | [TestEnum](docs/simple-suite-test#testenum-enum) | A test protected property. |

#### Methods

|  Method | Return Type | Description |
|  --- | --- | --- |
|  [publicAbstractMethod()](docs/simple-suite-test#testabstractclass-publicabstractmethod-method) | void | A test public abstract method. |
|  [sealedMethod()](docs/simple-suite-test#testabstractclass-sealedmethod-method) | string | A test <code>@sealed</code> method. |
|  [virtualMethod()](docs/simple-suite-test#testabstractclass-virtualmethod-method) | number | A test <code>@virtual</code> method. |

#### Constructor Details

##### (constructor) {#testabstractclass-_constructor_-constructor}

This is a constructor.

###### Signature {#_constructor_-signature}

```typescript
protected constructor(privateProperty: number, protectedProperty: TestEnum);
```

###### Parameters {#_constructor_-parameters}

|  Parameter | Type | Description |
|  --- | --- | --- |
|  privateProperty | number |  |
|  protectedProperty | [TestEnum](docs/simple-suite-test#testenum-enum) |  |

#### Property Details

##### abstractPropertyGetter {#testabstractclass-abstractpropertygetter-property}

A test abstract getter property.

###### Signature {#abstractpropertygetter-signature}

```typescript
abstract get abstractPropertyGetter(): TestMappedType;
```

##### protectedProperty {#testabstractclass-protectedproperty-property}

A test protected property.

###### Signature {#protectedproperty-signature}

```typescript
protected readonly protectedProperty: TestEnum;
```

#### Method Details

##### publicAbstractMethod {#testabstractclass-publicabstractmethod-method}

A test public abstract method.

###### Signature {#publicabstractmethod-signature}

```typescript
abstract publicAbstractMethod(): void;
```

##### sealedMethod {#testabstractclass-sealedmethod-method}

A test `@sealed` method.

###### Signature {#sealedmethod-signature}

```typescript
/** @sealed */
protected sealedMethod(): string;
```

##### virtualMethod {#testabstractclass-virtualmethod-method}

A test `@virtual` method.

###### Signature {#virtualmethod-signature}

```typescript
/** @virtual */
protected virtualMethod(): number;
```

### TestClass {#testclass-class}

Test class

#### Remarks {#testclass-remarks}

Here are some remarks about the class

#### Signature {#testclass-signature}

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> extends TestAbstractClass 
```
<b>Extends:</b> [TestAbstractClass](docs/simple-suite-test#testabstractclass-class)


<b>Type parameters:</b> 

* <b>TTypeParameterA</b>: A type parameter


* <b>TTypeParameterB</b>: Another type parameter


#### Events

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassEventProperty](docs/simple-suite-test#testclass-testclasseventproperty-property) | readonly | () =&gt; void | Test class event property |

#### Constructors

|  Constructor | Description |
|  --- | --- |
|  [(constructor)(privateProperty, protectedProperty, testClassProperty, testClassEventProperty)](docs/simple-suite-test#testclass-_constructor_-constructor) | Test class constructor |

#### Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [abstractPropertyGetter](docs/simple-suite-test#testclass-abstractpropertygetter-property) | readonly | [TestMappedType](docs/simple-suite-test#testmappedtype-typealias) | A test abstract getter property. |
|  [testClassGetterProperty](docs/simple-suite-test#testclass-testclassgetterproperty-property) | readonly | number | Test class getter-only property |
|  [testClassProperty](docs/simple-suite-test#testclass-testclassproperty-property) | readonly | TTypeParameterB | Test class property |
|  [testClassStaticProperty](docs/simple-suite-test#testclass-testclassstaticproperty-property) | static | (foo: number) =&gt; string | Test static class property |

#### Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [publicAbstractMethod()](docs/simple-suite-test#testclass-publicabstractmethod-method) |  | void | A test public abstract method. |
|  [testClassMethod(input)](docs/simple-suite-test#testclass-testclassmethod-method) |  | TTypeParameterA | Test class method |
|  [testClassStaticMethod(foo)](docs/simple-suite-test#testclass-testclassstaticmethod-method) | static | string | Test class static method |
|  [virtualMethod()](docs/simple-suite-test#testclass-virtualmethod-method) |  | number | Overrides [TestAbstractClass.virtualMethod()](docs/simple-suite-test#testabstractclass-virtualmethod-method)<!-- -->. |

#### Event Details

##### testClassEventProperty {#testclass-testclasseventproperty-property}

Test class event property

###### Remarks {#testclasseventproperty-remarks}

Here are some remarks about the property

###### Signature {#testclasseventproperty-signature}

```typescript
readonly testClassEventProperty: () => void;
```

#### Constructor Details

##### (constructor) {#testclass-_constructor_-constructor}

Test class constructor

###### Remarks {#_constructor_-remarks}

Here are some remarks about the constructor

###### Signature {#_constructor_-signature}

```typescript
constructor(privateProperty: number, protectedProperty: TestEnum, testClassProperty: TTypeParameterB, testClassEventProperty: () => void);
```

###### Parameters {#_constructor_-parameters}

|  Parameter | Type | Description |
|  --- | --- | --- |
|  privateProperty | number | See [TestAbstractClass](docs/simple-suite-test#testabstractclass-class)<!-- -->'s constructor. |
|  protectedProperty | [TestEnum](docs/simple-suite-test#testenum-enum) | See [TestAbstractClass.protectedProperty](docs/simple-suite-test#testabstractclass-protectedproperty-property)<!-- -->. |
|  testClassProperty | TTypeParameterB | See [TestClass.testClassProperty](docs/simple-suite-test#testclass-testclassproperty-property)<!-- -->. |
|  testClassEventProperty | () =&gt; void | See [TestClass.testClassEventProperty](docs/simple-suite-test#testclass-testclasseventproperty-property)<!-- -->. |

#### Property Details

##### abstractPropertyGetter {#testclass-abstractpropertygetter-property}

A test abstract getter property.

###### Signature {#abstractpropertygetter-signature}

```typescript
get abstractPropertyGetter(): TestMappedType;
```

##### testClassGetterProperty {#testclass-testclassgetterproperty-property}

Test class getter-only property

###### Remarks {#testclassgetterproperty-remarks}

Here are some remarks about the getter-only property

###### Signature {#testclassgetterproperty-signature}

```typescript
/** @virtual */
get testClassGetterProperty(): number;
```

##### testClassProperty {#testclass-testclassproperty-property}

Test class property

###### Remarks {#testclassproperty-remarks}

Here are some remarks about the property

###### Signature {#testclassproperty-signature}

```typescript
readonly testClassProperty: TTypeParameterB;
```

##### testClassStaticProperty {#testclass-testclassstaticproperty-property}

Test static class property

###### Signature {#testclassstaticproperty-signature}

```typescript
static testClassStaticProperty: (foo: number) => string;
```

#### Method Details

##### publicAbstractMethod {#testclass-publicabstractmethod-method}

A test public abstract method.

###### Signature {#publicabstractmethod-signature}

```typescript
publicAbstractMethod(): void;
```

##### testClassMethod {#testclass-testclassmethod-method}

Test class method

###### Remarks {#testclassmethod-remarks}

Here are some remarks about the method

###### Signature {#testclassmethod-signature}

```typescript
/** @sealed */
testClassMethod(input: TTypeParameterA): TTypeParameterA;
```

###### Parameters {#testclassmethod-parameters}

|  Parameter | Type | Description |
|  --- | --- | --- |
|  input | TTypeParameterA |  |

##### testClassStaticMethod {#testclass-testclassstaticmethod-method}

Test class static method

###### Signature {#testclassstaticmethod-signature}

```typescript
static testClassStaticMethod(foo: number): string;
```

###### Parameters {#testclassstaticmethod-parameters}

|  Parameter | Type | Description |
|  --- | --- | --- |
|  foo | number | Some number |

##### virtualMethod {#testclass-virtualmethod-method}

Overrides [TestAbstractClass.virtualMethod()](docs/simple-suite-test#testabstractclass-virtualmethod-method)<!-- -->.

###### Signature {#virtualmethod-signature}

```typescript
/** @override */
protected virtualMethod(): number;
```

## Enumeration Details

### TestEnum {#testenum-enum}

Test Enum

#### Remarks {#testenum-remarks}

Here are some remarks about the enum

#### Examples {#testenum-examples}

##### Example 1 {#testenum-example1}

Some example

```typescript
const foo = TestEnum.TestEnumValue1
```

##### Example 2 {#testenum-example2}

Another example

```ts
const bar = TestEnum.TestEnumValue2
```

#### Signature {#testenum-signature}

```typescript
export declare enum TestEnum 
```

#### Flags

|  Flag | Description |
|  --- | --- |
|  [TestEnumValue1](docs/simple-suite-test#testenum-testenumvalue1-enummember) | Test enum value 1 (string) |
|  [TestEnumValue2](docs/simple-suite-test#testenum-testenumvalue2-enummember) | Test enum value 2 (number) |
|  [TestEnumValue3](docs/simple-suite-test#testenum-testenumvalue3-enummember) | Test enum value 3 (default) |

#### FlagDetails

##### TestEnumValue1 {#testenum-testenumvalue1-enummember}

Test enum value 1 (string)

###### Remarks {#testenumvalue1-remarks}

Here are some remarks about the enum value

###### Signature {#testenumvalue1-signature}

```typescript
TestEnumValue1 = "test-enum-value-1"
```

##### TestEnumValue2 {#testenum-testenumvalue2-enummember}

Test enum value 2 (number)

###### Remarks {#testenumvalue2-remarks}

Here are some remarks about the enum value

###### Signature {#testenumvalue2-signature}

```typescript
TestEnumValue2 = 3
```

##### TestEnumValue3 {#testenum-testenumvalue3-enummember}

Test enum value 3 (default)

###### Remarks {#testenumvalue3-remarks}

Here are some remarks about the enum value

###### Signature {#testenumvalue3-signature}

```typescript
TestEnumValue3 = 4
```

## Function Details

### testFunction {#testfunction-function}

Test function

#### Remarks {#testfunction-remarks}

This is a test [link](docs/simple-suite-test#testinterface-interface) to another API member

#### Signature {#testfunction-signature}

```typescript
export declare function testFunction<TTypeParameter>(testParameter: TTypeParameter, testOptionalParameter?: TTypeParameter): TTypeParameter;
```

#### Parameters {#testfunction-parameters}

|  Parameter | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  testParameter |  | TTypeParameter | A test parameter |
|  testOptionalParameter | optional | TTypeParameter |  |

### testFunctionReturningInlineType {#testfunctionreturninginlinetype-function}

Test function that returns an inline type

#### Signature {#testfunctionreturninginlinetype-signature}

```typescript
export declare function testFunctionReturningInlineType(): {
    foo: number;
    bar: TestEnum;
};
```

### testFunctionReturningIntersectionType {#testfunctionreturningintersectiontype-function}

> This is a test deprecation notice. Here is a [link](docs/simple-suite-test#testfunctionreturninguniontype-function) to something else!
> 

Test function that returns an inline type

#### Signature {#testfunctionreturningintersectiontype-signature}

```typescript
export declare function testFunctionReturningIntersectionType(): TestEmptyInterface & TestInterfaceWithTypeParameter<number>;
```

### testFunctionReturningUnionType {#testfunctionreturninguniontype-function}

Test function that returns an inline type

#### Signature {#testfunctionreturninguniontype-signature}

```typescript
export declare function testFunctionReturningUnionType(): string | TestInterface;
```

## Interface Details

### TestEmptyInterface {#testemptyinterface-interface}

An empty interface

#### Signature {#testemptyinterface-signature}

```typescript
export interface TestEmptyInterface 
```

### TestInterface {#testinterface-interface}

Test interface

#### Remarks {#testinterface-remarks}

Here are some remarks about the interface

#### Signature {#testinterface-signature}

```typescript
export interface TestInterface 
```

#### Events

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassEventProperty](docs/simple-suite-test#testinterface-testclasseventproperty-propertysignature) | readonly | () =&gt; void | Test interface event property |

#### Construct Signatures

|  ConstructSignature | Return Type | Description |
|  --- | --- | --- |
|  [(new)()](docs/simple-suite-test#testinterface-_new_-constructsignature) | [TestInterface](docs/simple-suite-test#testinterface-interface) | Test construct signature. |

#### Properties

|  Property | Modifiers | Default Value | Type | Description |
|  --- | --- | --- | --- | --- |
|  [testInterfaceProperty](docs/simple-suite-test#testinterface-testinterfaceproperty-propertysignature) |  |  | number | Test interface property |
|  [testOptionalInterfaceProperty](docs/simple-suite-test#testinterface-testoptionalinterfaceproperty-propertysignature) | optional | 0 | number | Test optional property |

#### Methods

|  Method | Return Type | Description |
|  --- | --- | --- |
|  [testInterfaceMethod()](docs/simple-suite-test#testinterface-testinterfacemethod-methodsignature) | void | Test interface method |

#### Call Signatures

|  CallSignature | Description |
|  --- | --- |
|  [(call)(event, listener)](docs/simple-suite-test#testinterface-_call_-callsignature) | Test interface event call signature |
|  [(call)(event, listener)](docs/simple-suite-test#testinterface-_call__1-callsignature) | Another example call signature |

#### Event Details

##### testClassEventProperty {#testinterface-testclasseventproperty-propertysignature}

Test interface event property

###### Remarks {#testclasseventproperty-remarks}

Here are some remarks about the event property

###### Signature {#testclasseventproperty-signature}

```typescript
readonly testClassEventProperty: () => void;
```

#### Construct Signature Details

##### (new) {#testinterface-_new_-constructsignature}

Test construct signature.

###### Signature {#_new_-signature}

```typescript
new (): TestInterface;
```

#### Property Details

##### testInterfaceProperty {#testinterface-testinterfaceproperty-propertysignature}

Test interface property

###### Remarks {#testinterfaceproperty-remarks}

Here are some remarks about the property

###### Signature {#testinterfaceproperty-signature}

```typescript
testInterfaceProperty: number;
```

##### testOptionalInterfaceProperty {#testinterface-testoptionalinterfaceproperty-propertysignature}

Test optional property

###### Signature {#testoptionalinterfaceproperty-signature}

```typescript
testOptionalInterfaceProperty?: number;
```

#### Method Details

##### testInterfaceMethod {#testinterface-testinterfacemethod-methodsignature}

Test interface method

###### Remarks {#testinterfacemethod-remarks}

Here are some remarks about the method

###### Signature {#testinterfacemethod-signature}

```typescript
testInterfaceMethod(): void;
```

#### Call Signature Details

##### (call) {#testinterface-_call_-callsignature}

Test interface event call signature

###### Remarks {#_call_-remarks}

Here are some remarks about the event call signature

###### Signature {#_call_-signature}

```typescript
(event: 'testCallSignature', listener: (input: unknown) => void): any;
```

##### (call) {#testinterface-_call__1-callsignature}

Another example call signature

###### Remarks {#_call__1-remarks}

Here are some remarks about the event call signature

###### Signature {#_call__1-signature}

```typescript
(event: 'anotherTestCallSignature', listener: (input: number) => string): number;
```

### TestInterfaceExtendingOtherInterfaces {#testinterfaceextendingotherinterfaces-interface}

Test interface that extends other interfaces

#### Remarks {#testinterfaceextendingotherinterfaces-remarks}

Here are some remarks about the interface

#### Signature {#testinterfaceextendingotherinterfaces-signature}

```typescript
export interface TestInterfaceExtendingOtherInterfaces extends TestInterface, TestInterfaceWithTypeParameter<number>, TestMappedType 
```
<b>Extends:</b> [TestInterface](docs/simple-suite-test#testinterface-interface)

, [TestInterfaceWithTypeParameter](docs/simple-suite-test#testinterfacewithtypeparameter-interface)<!-- -->&lt;number&gt;

, [TestMappedType](docs/simple-suite-test#testmappedtype-typealias)


#### Methods

|  Method | Return Type | Description |
|  --- | --- | --- |
|  [testMethod(input)](docs/simple-suite-test#testinterfaceextendingotherinterfaces-testmethod-methodsignature) | number | Test interface method accepting a string and returning a number. |

#### Method Details

##### testMethod {#testinterfaceextendingotherinterfaces-testmethod-methodsignature}

Test interface method accepting a string and returning a number.

###### Remarks {#testmethod-remarks}

Here are some remarks about the method

###### Signature {#testmethod-signature}

```typescript
testMethod(input: string): number;
```

###### Parameters {#testmethod-parameters}

|  Parameter | Type | Description |
|  --- | --- | --- |
|  input | string | A string |

### TestInterfaceWithTypeParameter {#testinterfacewithtypeparameter-interface}

Test interface with generic type parameter

#### Remarks {#testinterfacewithtypeparameter-remarks}

Here are some remarks about the interface

#### Signature {#testinterfacewithtypeparameter-signature}

```typescript
export interface TestInterfaceWithTypeParameter<T> 
```
<b>Type parameters:</b> 

* <b>T</b>: A type parameter


#### Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [testProperty](docs/simple-suite-test#testinterfacewithtypeparameter-testproperty-propertysignature) | T | A test interface property using generic type parameter |

#### Property Details

##### testProperty {#testinterfacewithtypeparameter-testproperty-propertysignature}

A test interface property using generic type parameter

###### Remarks {#testproperty-remarks}

Here are some remarks about the property

###### Signature {#testproperty-signature}

```typescript
testProperty: T;
```

## Namespace Details

### TestNamespace {#testnamespace-namespace}

Test Namespace

#### Remarks {#testnamespace-remarks}

Here are some remarks about the namespace

#### Examples {#testnamespace-examples}

##### Example 1 {#testnamespace-example1}

Example 1

```typescript
const foo = bar;
```

##### Example 2 {#testnamespace-example2}

Example 2

```javascript
const bar = foo
```

#### Signature {#testnamespace-signature}

```typescript
export declare namespace TestNamespace 
```

#### Classes

|  Class | Description |
|  --- | --- |
|  [TestClass](docs/simple-suite-test#testnamespace-testclass-class) | Test class |

#### Enumerations

|  Enum | Description |
|  --- | --- |
|  [TestEnum](docs/simple-suite-test#testnamespace-testenum-enum) | Test Enum |

#### Functions

|  Function | Return Type | Description |
|  --- | --- | --- |
|  [testFunction(testParameter)](docs/simple-suite-test#testnamespace-testfunction-function) | number | Test function |

#### Interfaces

|  Interface | Description |
|  --- | --- |
|  [TestInterface](docs/simple-suite-test#testnamespace-testinterface-interface) | Test interface |

#### Namespaces

|  Namespace | Description |
|  --- | --- |
|  [TestSubNamespace](docs/simple-suite-test#testnamespace-testsubnamespace-namespace) | Test sub-namespace |

#### Variables

|  Variable | Modifiers | Description |
|  --- | --- | --- |
|  [TestConst](docs/simple-suite-test#testnamespace-testconst-variable) | readonly | Test Constant |

#### Types

|  TypeAlias | Description |
|  --- | --- |
|  [TestTypeAlias](docs/simple-suite-test#testnamespace-testtypealias-typealias) | Test Type-Alias |

#### Classe Details

##### TestClass {#testnamespace-testclass-class}

Test class

###### Signature {#testclass-signature}

```typescript
class TestClass 
```

###### Constructors

|  Constructor | Description |
|  --- | --- |
|  [(constructor)(testClassProperty)](docs/simple-suite-test#testnamespace-testclass-_constructor_-constructor) | Test class constructor |

###### Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassProperty](docs/simple-suite-test#testnamespace-testclass-testclassproperty-property) | readonly | string | Test interface property |

###### Methods

|  Method | Return Type | Description |
|  --- | --- | --- |
|  [testClassMethod(testParameter)](docs/simple-suite-test#testnamespace-testclass-testclassmethod-method) | Promise&lt;string&gt; | Test class method |

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

#### Enumeration Details

##### TestEnum {#testnamespace-testenum-enum}

Test Enum

###### Signature {#testenum-signature}

```typescript
enum TestEnum 
```

###### Flags

|  Flag | Description |
|  --- | --- |
|  [TestEnumValue1](docs/simple-suite-test#testnamespace-testenum-testenumvalue1-enummember) | Test enum value 1 |
|  [TestEnumValue2](docs/simple-suite-test#testnamespace-testenum-testenumvalue2-enummember) | Test enum value 2 |

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

#### Function Details

##### testFunction {#testnamespace-testfunction-function}

Test function

###### Signature {#testfunction-signature}

```typescript
function testFunction(testParameter: number): number;
```

###### Parameters {#testfunction-parameters}

|  Parameter | Type | Description |
|  --- | --- | --- |
|  testParameter | number |  |

#### Interface Details

##### TestInterface {#testnamespace-testinterface-interface}

Test interface

###### Signature {#testinterface-signature}

```typescript
interface TestInterface 
```

###### Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [testInterfaceProperty](docs/simple-suite-test#testnamespace-testinterface-testinterfaceproperty-propertysignature) | boolean | Test interface property |

###### Methods

|  Method | Return Type | Description |
|  --- | --- | --- |
|  [testInterfaceMethod()](docs/simple-suite-test#testnamespace-testinterface-testinterfacemethod-methodsignature) | void | Test interface method |

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

#### Namespace Details

##### TestSubNamespace {#testnamespace-testsubnamespace-namespace}

Test sub-namespace

###### Signature {#testsubnamespace-signature}

```typescript
namespace TestSubNamespace 
```

#### Variable Details

##### TestConst {#testnamespace-testconst-variable}

Test Constant

###### Signature {#testconst-signature}

```typescript
TestConst = "Hello world!"
```

#### Type Details

##### TestTypeAlias {#testnamespace-testtypealias-typealias}

Test Type-Alias

###### Signature {#testtypealias-signature}

```typescript
type TestTypeAlias = boolean;
```

## Variable Details

### testConst {#testconst-variable}

Test Constant

#### Remarks {#testconst-remarks}

Here are some remarks about the variable

#### Signature {#testconst-signature}

```typescript
testConst = 42
```

## Type Details

### TestMappedType {#testmappedtype-typealias}

Test Mapped Type, using [TestEnum](docs/simple-suite-test#testenum-enum)

#### Remarks {#testmappedtype-remarks}

Here are some remarks about the mapped type

#### Signature {#testmappedtype-signature}

```typescript
export declare type TestMappedType = {
    [K in TestEnum]: boolean;
};
```

### TypeAlias {#typealias-typealias}

Test Type-Alias

#### Remarks {#typealias-remarks}

Here are some remarks about the type alias

#### Signature {#typealias-signature}

```typescript
export declare type TypeAlias = string;
```