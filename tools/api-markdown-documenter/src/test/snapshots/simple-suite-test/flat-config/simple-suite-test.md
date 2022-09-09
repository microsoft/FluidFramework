<!--- This is sample front-matter for API item "simple-suite-test" -->

[Packages](docs/) &gt; [simple-suite-test](docs/simple-suite-test)

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

## Interfaces

|  Interface | Description |
|  --- | --- |
|  [TestEmptyInterface](docs/simple-suite-test#testemptyinterface-interface) | An empty interface |
|  [TestInterface](docs/simple-suite-test#testinterface-interface) | Test interface |
|  [TestInterfaceExtendingOtherInterfaces](docs/simple-suite-test#testinterfaceextendingotherinterfaces-interface) | Test interface that extends other interfaces |
|  [TestInterfaceWithTypeParameter](docs/simple-suite-test#testinterfacewithtypeparameter-interface) | Test interface with generic type parameter |

## Classes

|  Class | Description |
|  --- | --- |
|  [TestAbstractClass](docs/simple-suite-test#testabstractclass-class) | A test abstract class. |
|  [TestClass](docs/simple-suite-test#testclass-class) | Test class |

## Enumerations

|  Enum | Description |
|  --- | --- |
|  [TestEnum](docs/simple-suite-test#testenum-enum) | Test Enum |

## Types

|  TypeAlias | Description |
|  --- | --- |
|  [TestMappedType](docs/simple-suite-test#testmappedtype-typealias) | Test Mapped Type, using [TestEnum](docs/simple-suite-test#testenum-enum) |
|  [TypeAlias](docs/simple-suite-test#typealias-typealias) | Test Type-Alias |

## Functions

|  Function | Alerts | Return Type | Description |
|  --- | --- | --- | --- |
|  [testFunction(testParameter, testOptionalParameter)](docs/simple-suite-test#testfunction-function) | \-\-\- | TTypeParameter | Test function |
|  [testFunctionReturningInlineType()](docs/simple-suite-test#testfunctionreturninginlinetype-function) | \-\-\- | { foo: number; bar: [TestEnum](docs/simple-suite-test#testenum-enum)<!-- -->; } | Test function that returns an inline type |
|  [testFunctionReturningIntersectionType()](docs/simple-suite-test#testfunctionreturningintersectiontype-function) | <code>DEPRECATED</code> | [TestEmptyInterface](docs/simple-suite-test#testemptyinterface-interface) &amp; [TestInterfaceWithTypeParameter](docs/simple-suite-test#testinterfacewithtypeparameter-interface)<!-- -->&lt;number&gt; | Test function that returns an inline type |
|  [testFunctionReturningUnionType()](docs/simple-suite-test#testfunctionreturninguniontype-function) | \-\-\- | string \| [TestInterface](docs/simple-suite-test#testinterface-interface) | Test function that returns an inline type |

## Variables

|  Variable | Alerts | Modifiers | Description |
|  --- | --- | --- | --- |
|  [testConst](docs/simple-suite-test#testconst-variable) | \-\-\- | <code>readonly</code> | Test Constant |
|  [testConstWithEmptyDeprecatedBlock](docs/simple-suite-test#testconstwithemptydeprecatedblock-variable) | <code>DEPRECATED</code> | <code>readonly</code> | I have a <code>@deprecated</code> tag with an empty comment block. |

## Namespaces

|  Namespace | Description |
|  --- | --- |
|  [TestModule](docs/simple-suite-test#testmodule-namespace) | \-\-\- |
|  [TestNamespace](docs/simple-suite-test#testnamespace-namespace) | Test Namespace |

## Interface Details

### TestEmptyInterface {#testemptyinterface-interface}

An empty interface

#### Signature {#testemptyinterface-signature}

```typescript
export interface TestEmptyInterface 
```

### TestInterface {#testinterface-interface}

Test interface

#### Signature {#testinterface-signature}

```typescript
export interface TestInterface 
```

#### Remarks {#testinterface-remarks}

Here are some remarks about the interface

#### Construct Signatures

|  ConstructSignature | Return Type | Description |
|  --- | --- | --- |
|  [(new)()](docs/simple-suite-test#testinterface-_new_-constructsignature) | [TestInterface](docs/simple-suite-test#testinterface-interface) | Test construct signature. |

#### Events

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassEventProperty](docs/simple-suite-test#testinterface-testclasseventproperty-propertysignature) | <code>readonly</code> | () =&gt; void | Test interface event property |

#### Properties

|  Property | Modifiers | Default Value | Type | Description |
|  --- | --- | --- | --- | --- |
|  [testInterfaceProperty](docs/simple-suite-test#testinterface-testinterfaceproperty-propertysignature) | \-\-\- | \-\-\- | number | Test interface property |
|  [testOptionalInterfaceProperty](docs/simple-suite-test#testinterface-testoptionalinterfaceproperty-propertysignature) | <code>optional</code> | 0 | number | Test optional property |

#### Methods

|  Method | Return Type | Description |
|  --- | --- | --- |
|  [testInterfaceMethod()](docs/simple-suite-test#testinterface-testinterfacemethod-methodsignature) | void | Test interface method |

#### Call Signatures

|  CallSignature | Description |
|  --- | --- |
|  [(call)(event, listener)](docs/simple-suite-test#testinterface-_call_-callsignature) | Test interface event call signature |
|  [(call)(event, listener)](docs/simple-suite-test#testinterface-_call__1-callsignature) | Another example call signature |

#### Construct Signature Details

##### new (): TestInterface {#testinterface-_new_-constructsignature}

Test construct signature.

###### Signature {#_new_-signature}

```typescript
new (): TestInterface;
```

###### Returns {#_new_-returns}

<b>Return type:</b> [TestInterface](docs/simple-suite-test#testinterface-interface)

#### Event Details

##### testClassEventProperty {#testinterface-testclasseventproperty-propertysignature}

Test interface event property

###### Signature {#testclasseventproperty-signature}

```typescript
readonly testClassEventProperty: () => void;
```

###### Remarks {#testclasseventproperty-remarks}

Here are some remarks about the event property

#### Property Details

##### testInterfaceProperty {#testinterface-testinterfaceproperty-propertysignature}

Test interface property

###### Signature {#testinterfaceproperty-signature}

```typescript
testInterfaceProperty: number;
```

###### Remarks {#testinterfaceproperty-remarks}

Here are some remarks about the property

##### testOptionalInterfaceProperty {#testinterface-testoptionalinterfaceproperty-propertysignature}

Test optional property

###### Signature {#testoptionalinterfaceproperty-signature}

```typescript
testOptionalInterfaceProperty?: number;
```

#### Method Details

##### testInterfaceMethod {#testinterface-testinterfacemethod-methodsignature}

Test interface method

###### Signature {#testinterfacemethod-signature}

```typescript
testInterfaceMethod(): void;
```

###### Remarks {#testinterfacemethod-remarks}

Here are some remarks about the method

#### Call Signature Details

##### (event: 'testCallSignature', listener: (input: unknown) =&gt; void): any {#testinterface-_call_-callsignature}

Test interface event call signature

###### Signature {#_call_-signature}

```typescript
(event: 'testCallSignature', listener: (input: unknown) => void): any;
```

###### Remarks {#_call_-remarks}

Here are some remarks about the event call signature

##### (event: 'anotherTestCallSignature', listener: (input: number) =&gt; string): number {#testinterface-_call__1-callsignature}

Another example call signature

###### Signature {#_call__1-signature}

```typescript
(event: 'anotherTestCallSignature', listener: (input: number) => string): number;
```

###### Remarks {#_call__1-remarks}

Here are some remarks about the event call signature

#### See also {#testinterface-see-also}

[TestInterface.testInterfaceMethod()](docs/simple-suite-test#testinterface-testinterfacemethod-methodsignature)

[TestInterface.testInterfaceProperty](docs/simple-suite-test#testinterface-testinterfaceproperty-propertysignature)

[TestInterface.testOptionalInterfaceProperty](docs/simple-suite-test#testinterface-testoptionalinterfaceproperty-propertysignature)

[TestInterface.testClassEventProperty](docs/simple-suite-test#testinterface-testclasseventproperty-propertysignature)

### TestInterfaceExtendingOtherInterfaces {#testinterfaceextendingotherinterfaces-interface}

Test interface that extends other interfaces

#### Signature {#testinterfaceextendingotherinterfaces-signature}

```typescript
export interface TestInterfaceExtendingOtherInterfaces extends TestInterface, TestMappedType, TestInterfaceWithTypeParameter<number> 
```
<b>Extends:</b> [TestInterface](docs/simple-suite-test#testinterface-interface)<!-- -->, [TestMappedType](docs/simple-suite-test#testmappedtype-typealias)<!-- -->, [TestInterfaceWithTypeParameter](docs/simple-suite-test#testinterfacewithtypeparameter-interface)

#### Remarks {#testinterfaceextendingotherinterfaces-remarks}

Here are some remarks about the interface

#### Methods

|  Method | Return Type | Description |
|  --- | --- | --- |
|  [testMethod(input)](docs/simple-suite-test#testinterfaceextendingotherinterfaces-testmethod-methodsignature) | number | Test interface method accepting a string and returning a number. |

#### Method Details

##### testMethod {#testinterfaceextendingotherinterfaces-testmethod-methodsignature}

Test interface method accepting a string and returning a number.

###### Signature {#testmethod-signature}

```typescript
testMethod(input: string): number;
```

###### Remarks {#testmethod-remarks}

Here are some remarks about the method

###### Parameters {#testmethod-parameters}

|  Parameter | Type | Description |
|  --- | --- | --- |
|  input | string | A string |

###### Returns {#testmethod-returns}

A number

<b>Return type:</b> number

#### See also {#testinterfaceextendingotherinterfaces-see-also}

- [TestInterface](docs/simple-suite-test#testinterface-interface)

- [TestInterfaceWithTypeParameter](docs/simple-suite-test#testinterfacewithtypeparameter-interface)

- [TestMappedType](docs/simple-suite-test#testmappedtype-typealias)

### TestInterfaceWithTypeParameter {#testinterfacewithtypeparameter-interface}

Test interface with generic type parameter

#### Signature {#testinterfacewithtypeparameter-signature}

```typescript
export interface TestInterfaceWithTypeParameter<T> 
```
<b>Type parameters:</b> 

* <b>T</b>: A type parameter


#### Remarks {#testinterfacewithtypeparameter-remarks}

Here are some remarks about the interface

#### Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [testProperty](docs/simple-suite-test#testinterfacewithtypeparameter-testproperty-propertysignature) | T | A test interface property using generic type parameter |

#### Property Details

##### testProperty {#testinterfacewithtypeparameter-testproperty-propertysignature}

A test interface property using generic type parameter

###### Signature {#testproperty-signature}

```typescript
testProperty: T;
```

###### Remarks {#testproperty-remarks}

Here are some remarks about the property

## Class Details

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
|  [abstractPropertyGetter](docs/simple-suite-test#testabstractclass-abstractpropertygetter-property) | <code>readonly</code> | [TestMappedType](docs/simple-suite-test#testmappedtype-typealias) | A test abstract getter property. |
|  [protectedProperty](docs/simple-suite-test#testabstractclass-protectedproperty-property) | <code>readonly</code> | [TestEnum](docs/simple-suite-test#testenum-enum) | A test protected property. |

#### Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [publicAbstractMethod()](docs/simple-suite-test#testabstractclass-publicabstractmethod-method) | \-\-\- | void | A test public abstract method. |
|  [sealedMethod()](docs/simple-suite-test#testabstractclass-sealedmethod-method) | <code>sealed</code> | string | A test <code>@sealed</code> method. |
|  [virtualMethod()](docs/simple-suite-test#testabstractclass-virtualmethod-method) | <code>virtual</code> | number | A test <code>@virtual</code> method. |

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
|  privateProperty | number | \-\-\- |
|  protectedProperty | [TestEnum](docs/simple-suite-test#testenum-enum) | \-\-\- |

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

###### Returns {#sealedmethod-returns}

A string!

<b>Return type:</b> string

##### virtualMethod {#testabstractclass-virtualmethod-method}

A test `@virtual` method.

###### Signature {#virtualmethod-signature}

```typescript
/** @virtual */
protected virtualMethod(): number;
```

###### Returns {#virtualmethod-returns}

A number!

<b>Return type:</b> number

### TestClass {#testclass-class}

Test class

#### Signature {#testclass-signature}

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> extends TestAbstractClass 
```
<b>Extends:</b> [TestAbstractClass](docs/simple-suite-test#testabstractclass-class)

<b>Type parameters:</b> 

* <b>TTypeParameterA</b>: A type parameter


* <b>TTypeParameterB</b>: Another type parameter


#### Remarks {#testclass-remarks}

Here are some remarks about the class

#### Constructors

|  Constructor | Description |
|  --- | --- |
|  [(constructor)(privateProperty, protectedProperty, testClassProperty, testClassEventProperty)](docs/simple-suite-test#testclass-_constructor_-constructor) | Test class constructor |

#### Static Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [testClassStaticProperty](docs/simple-suite-test#testclass-testclassstaticproperty-property) | (foo: number) =&gt; string | Test static class property |

#### Static Methods

|  Method | Return Type | Description |
|  --- | --- | --- |
|  [testClassStaticMethod(foo)](docs/simple-suite-test#testclass-testclassstaticmethod-method) | string | Test class static method |

#### Events

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [testClassEventProperty](docs/simple-suite-test#testclass-testclasseventproperty-property) | <code>readonly</code> | () =&gt; void | Test class event property |

#### Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [abstractPropertyGetter](docs/simple-suite-test#testclass-abstractpropertygetter-property) | <code>readonly</code> | [TestMappedType](docs/simple-suite-test#testmappedtype-typealias) | A test abstract getter property. |
|  [testClassGetterProperty](docs/simple-suite-test#testclass-testclassgetterproperty-property) | <code>readonly</code><code>virtual</code> | number | Test class getter-only property |
|  [testClassProperty](docs/simple-suite-test#testclass-testclassproperty-property) | <code>readonly</code> | TTypeParameterB | Test class property |

#### Methods

|  Method | Modifiers | Return Type | Description |
|  --- | --- | --- | --- |
|  [publicAbstractMethod()](docs/simple-suite-test#testclass-publicabstractmethod-method) | \-\-\- | void | A test public abstract method. |
|  [testClassMethod(input)](docs/simple-suite-test#testclass-testclassmethod-method) | <code>sealed</code> | TTypeParameterA | Test class method |
|  [virtualMethod()](docs/simple-suite-test#testclass-virtualmethod-method) | \-\-\- | number | Overrides [TestAbstractClass.virtualMethod()](docs/simple-suite-test#testabstractclass-virtualmethod-method)<!-- -->. |

#### Constructor Details

##### (constructor) {#testclass-_constructor_-constructor}

Test class constructor

###### Signature {#_constructor_-signature}

```typescript
constructor(privateProperty: number, protectedProperty: TestEnum, testClassProperty: TTypeParameterB, testClassEventProperty: () => void);
```

###### Remarks {#_constructor_-remarks}

Here are some remarks about the constructor

###### Parameters {#_constructor_-parameters}

|  Parameter | Type | Description |
|  --- | --- | --- |
|  privateProperty | number | See [TestAbstractClass](docs/simple-suite-test#testabstractclass-class)<!-- -->'s constructor. |
|  protectedProperty | [TestEnum](docs/simple-suite-test#testenum-enum) | See [TestAbstractClass.protectedProperty](docs/simple-suite-test#testabstractclass-protectedproperty-property)<!-- -->. |
|  testClassProperty | TTypeParameterB | See [TestClass.testClassProperty](docs/simple-suite-test#testclass-testclassproperty-property)<!-- -->. |
|  testClassEventProperty | () =&gt; void | See [TestClass.testClassEventProperty](docs/simple-suite-test#testclass-testclasseventproperty-property)<!-- -->. |

#### Event Details

##### testClassEventProperty {#testclass-testclasseventproperty-property}

Test class event property

###### Signature {#testclasseventproperty-signature}

```typescript
readonly testClassEventProperty: () => void;
```

###### Remarks {#testclasseventproperty-remarks}

Here are some remarks about the property

#### Property Details

##### abstractPropertyGetter {#testclass-abstractpropertygetter-property}

A test abstract getter property.

###### Signature {#abstractpropertygetter-signature}

```typescript
get abstractPropertyGetter(): TestMappedType;
```

##### testClassGetterProperty {#testclass-testclassgetterproperty-property}

Test class getter-only property

###### Signature {#testclassgetterproperty-signature}

```typescript
/** @virtual */
get testClassGetterProperty(): number;
```

###### Remarks {#testclassgetterproperty-remarks}

Here are some remarks about the getter-only property

##### testClassProperty {#testclass-testclassproperty-property}

Test class property

###### Signature {#testclassproperty-signature}

```typescript
readonly testClassProperty: TTypeParameterB;
```

###### Remarks {#testclassproperty-remarks}

Here are some remarks about the property

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

###### Signature {#testclassmethod-signature}

```typescript
/** @sealed */
testClassMethod(input: TTypeParameterA): TTypeParameterA;
```

###### Remarks {#testclassmethod-remarks}

Here are some remarks about the method

###### Parameters {#testclassmethod-parameters}

|  Parameter | Type | Description |
|  --- | --- | --- |
|  input | TTypeParameterA | \-\-\- |

###### Returns {#testclassmethod-returns}

<b>Return type:</b> TTypeParameterA

###### Throws {#testclassmethod-throws}

Some sort of error in 1 case.

Some other sort of error in another case. For example, a case where some thing happens.

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

###### Returns {#testclassstaticmethod-returns}

- Some string

<b>Return type:</b> string

##### virtualMethod {#testclass-virtualmethod-method}

Overrides [TestAbstractClass.virtualMethod()](docs/simple-suite-test#testabstractclass-virtualmethod-method)<!-- -->.

###### Signature {#virtualmethod-signature}

```typescript
/** @override */
protected virtualMethod(): number;
```

###### Returns {#virtualmethod-returns}

<b>Return type:</b> number

#### See also {#testclass-see-also}

[TestAbstractClass](docs/simple-suite-test#testabstractclass-class)

## Enumeration Details

### TestEnum {#testenum-enum}

Test Enum

#### Signature {#testenum-signature}

```typescript
export declare enum TestEnum 
```

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

#### Flags

|  Flag | Description |
|  --- | --- |
|  [TestEnumValue1](docs/simple-suite-test#testenum-testenumvalue1-enummember) | Test enum value 1 (string) |
|  [TestEnumValue2](docs/simple-suite-test#testenum-testenumvalue2-enummember) | Test enum value 2 (number) |
|  [TestEnumValue3](docs/simple-suite-test#testenum-testenumvalue3-enummember) | Test enum value 3 (default) |

#### FlagDetails

##### TestEnumValue1 {#testenum-testenumvalue1-enummember}

Test enum value 1 (string)

###### Signature {#testenumvalue1-signature}

```typescript
TestEnumValue1 = "test-enum-value-1"
```

###### Remarks {#testenumvalue1-remarks}

Here are some remarks about the enum value

##### TestEnumValue2 {#testenum-testenumvalue2-enummember}

Test enum value 2 (number)

###### Signature {#testenumvalue2-signature}

```typescript
TestEnumValue2 = 3
```

###### Remarks {#testenumvalue2-remarks}

Here are some remarks about the enum value

##### TestEnumValue3 {#testenum-testenumvalue3-enummember}

Test enum value 3 (default)

###### Signature {#testenumvalue3-signature}

```typescript
TestEnumValue3 = 4
```

###### Remarks {#testenumvalue3-remarks}

Here are some remarks about the enum value

## Type Details

### TestMappedType {#testmappedtype-typealias}

Test Mapped Type, using [TestEnum](docs/simple-suite-test#testenum-enum)

#### Signature {#testmappedtype-signature}

```typescript
export declare type TestMappedType = {
    [K in TestEnum]: boolean;
};
```

#### Remarks {#testmappedtype-remarks}

Here are some remarks about the mapped type

### TypeAlias {#typealias-typealias}

Test Type-Alias

#### Signature {#typealias-signature}

```typescript
export declare type TypeAlias = string;
```

#### Remarks {#typealias-remarks}

Here are some remarks about the type alias

## Function Details

### testFunction {#testfunction-function}

Test function

#### Signature {#testfunction-signature}

```typescript
export declare function testFunction<TTypeParameter>(testParameter: TTypeParameter, testOptionalParameter?: TTypeParameter): TTypeParameter;
```

#### Remarks {#testfunction-remarks}

This is a test [link](docs/simple-suite-test#testinterface-interface) to another API member

#### Parameters {#testfunction-parameters}

|  Parameter | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  testParameter | \-\-\- | TTypeParameter | A test parameter |
|  testOptionalParameter | optional | TTypeParameter | \-\-\- |

#### Returns {#testfunction-returns}

The provided parameter

<b>Return type:</b> TTypeParameter

#### Throws {#testfunction-throws}

An Error when something bad happens.

### testFunctionReturningInlineType {#testfunctionreturninginlinetype-function}

Test function that returns an inline type

#### Signature {#testfunctionreturninginlinetype-signature}

```typescript
export declare function testFunctionReturningInlineType(): {
    foo: number;
    bar: TestEnum;
};
```

#### Returns {#testfunctionreturninginlinetype-returns}

An inline type

<b>Return type:</b> { foo: number; bar: [TestEnum](docs/simple-suite-test#testenum-enum)<!-- -->; }

### testFunctionReturningIntersectionType {#testfunctionreturningintersectiontype-function}

> <b>\[Warning\]: Deprecated</b>
> 
> This is a test deprecation notice. Here is a [link](docs/simple-suite-test#testfunctionreturninguniontype-function) to something else!
> 
> 

Test function that returns an inline type

#### Signature {#testfunctionreturningintersectiontype-signature}

```typescript
export declare function testFunctionReturningIntersectionType(): TestEmptyInterface & TestInterfaceWithTypeParameter<number>;
```

#### Returns {#testfunctionreturningintersectiontype-returns}

an intersection type

<b>Return type:</b> [TestEmptyInterface](docs/simple-suite-test#testemptyinterface-interface) &amp; [TestInterfaceWithTypeParameter](docs/simple-suite-test#testinterfacewithtypeparameter-interface)<!-- -->&lt;number&gt;

### testFunctionReturningUnionType {#testfunctionreturninguniontype-function}

Test function that returns an inline type

#### Signature {#testfunctionreturninguniontype-signature}

```typescript
export declare function testFunctionReturningUnionType(): string | TestInterface;
```

#### Returns {#testfunctionreturninguniontype-returns}

A union type

<b>Return type:</b> string \| [TestInterface](docs/simple-suite-test#testinterface-interface)

## Variable Details

### testConst {#testconst-variable}

Test Constant

#### Signature {#testconst-signature}

```typescript
testConst = 42
```

#### Remarks {#testconst-remarks}

Here are some remarks about the variable

### testConstWithEmptyDeprecatedBlock {#testconstwithemptydeprecatedblock-variable}

> <b>\[Warning\]: Deprecated</b>
> 
> 
> 

I have a `@deprecated` tag with an empty comment block.

#### Signature {#testconstwithemptydeprecatedblock-signature}

```typescript
testConstWithEmptyDeprecatedBlock = "I have a `@deprecated` tag with an empty comment block."
```

## Namespace Details

### TestModule {#testmodule-namespace}

#### Variables

|  Variable | Modifiers | Description |
|  --- | --- | --- |
|  [foo](docs/simple-suite-test#testmodule-foo-variable) | <code>readonly</code> | Test constant in module. |

#### Variable Details

##### foo {#testmodule-foo-variable}

Test constant in module.

###### Signature {#foo-signature}

```typescript
foo = 2
```

### TestNamespace {#testnamespace-namespace}

Test Namespace

#### Signature {#testnamespace-signature}

```typescript
export declare namespace TestNamespace 
```

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

#### Interfaces

|  Interface | Description |
|  --- | --- |
|  [TestInterface](docs/simple-suite-test#testnamespace-testinterface-interface) | Test interface |

#### Classes

|  Class | Description |
|  --- | --- |
|  [TestClass](docs/simple-suite-test#testnamespace-testclass-class) | Test class |

#### Enumerations

|  Enum | Description |
|  --- | --- |
|  [TestEnum](docs/simple-suite-test#testnamespace-testenum-enum) | Test Enum |

#### Types

|  TypeAlias | Description |
|  --- | --- |
|  [TestTypeAlias](docs/simple-suite-test#testnamespace-testtypealias-typealias) | Test Type-Alias |

#### Functions

|  Function | Return Type | Description |
|  --- | --- | --- |
|  [testFunction(testParameter)](docs/simple-suite-test#testnamespace-testfunction-function) | number | Test function |

#### Variables

|  Variable | Modifiers | Description |
|  --- | --- | --- |
|  [TestConst](docs/simple-suite-test#testnamespace-testconst-variable) | <code>readonly</code> | Test Constant |

#### Namespaces

|  Namespace | Description |
|  --- | --- |
|  [TestSubNamespace](docs/simple-suite-test#testnamespace-testsubnamespace-namespace) | Test sub-namespace |

#### Interface Details

##### TestInterface {#testnamespace-testinterface-interface}

Test interface

###### Signature {#testinterface-signature}

```typescript
interface TestInterface extends TestInterfaceWithTypeParameter<TestEnum> 
```
<b>Extends:</b> [TestInterfaceWithTypeParameter](docs/simple-suite-test#testinterfacewithtypeparameter-interface)<!-- -->&lt;[TestEnum](docs/simple-suite-test#testnamespace-testenum-enum)

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

#### Class Details

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
|  [testClassProperty](docs/simple-suite-test#testnamespace-testclass-testclassproperty-property) | <code>readonly</code> | string | Test interface property |

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

<b>Returns</b>

A Promise

<b>Return type:</b> Promise&lt;string&gt;

<b>Throws</b>

An Error when something happens for which an error should be thrown. Except in the cases where another kind of error is thrown. We don't throw this error in those cases.

A different kind of error when a thing happens, but not when the first kind of error is thrown instead.

😁

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

#### Type Details

##### TestTypeAlias {#testnamespace-testtypealias-typealias}

Test Type-Alias

###### Signature {#testtypealias-signature}

```typescript
type TestTypeAlias = boolean;
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
|  testParameter | number | \-\-\- |

###### Returns {#testfunction-returns}

A number

<b>Return type:</b> number

###### Throws {#testfunction-throws}

An Error

#### Variable Details

##### TestConst {#testnamespace-testconst-variable}

Test Constant

###### Signature {#testconst-signature}

```typescript
TestConst = "Hello world!"
```

#### Namespace Details

##### TestSubNamespace {#testnamespace-testsubnamespace-namespace}

Test sub-namespace

###### Signature {#testsubnamespace-signature}

```typescript
namespace TestSubNamespace 
```