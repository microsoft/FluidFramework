[Packages](docs/) &gt; [test-suite-a](docs/test-suite-a)

Test package

# Remarks {#test-suite-a-remarks}

This remarks block includes a bulleted list!

- Bullet 1

- Bullet 2

And an ordered list for good measure!

1. List item 1

2. List item 2

3. List item 3

Also, here is a link test, including a bad link, because we should have some reasonable support if this happens:

- Good link (no alias): [TestClass](docs/test-suite-a#testclass-class)

- Good link (with alias): _function alias text_

- Bad link (no alias): _InvalidItem_

- Bad link (with alias): _even though I link to an invalid item, I would still like this text to be rendered_

# Example {#test-suite-a-example}

A test example

```typescript
const foo = bar;
```

# Interfaces

| Interface | Description |
| --- | --- |
| [TestEmptyInterface](docs/test-suite-a#testemptyinterface-interface) | An empty interface |
| [TestInterface](docs/test-suite-a#testinterface-interface) | Test interface |
| [TestInterfaceExtendingOtherInterfaces](docs/test-suite-a#testinterfaceextendingotherinterfaces-interface) | Test interface that extends other interfaces |
| [TestInterfaceWithIndexSignature](docs/test-suite-a#testinterfacewithindexsignature-interface) | An interface with an index signature. |
| [TestInterfaceWithTypeParameter](docs/test-suite-a#testinterfacewithtypeparameter-interface) | Test interface with generic type parameter |

# Classes

| Class | Description |
| --- | --- |
| [TestAbstractClass](docs/test-suite-a#testabstractclass-class) | A test abstract class. |
| [TestClass](docs/test-suite-a#testclass-class) | Test class |

# Enumerations

| Enum | Description |
| --- | --- |
| [TestEnum](docs/test-suite-a#testenum-enum) | Test Enum |

# Types

| TypeAlias | Description |
| --- | --- |
| [TestMappedType](docs/test-suite-a#testmappedtype-typealias) | Test Mapped Type, using [TestEnum](docs/test-suite-a#testenum-enum) |
| [TypeAlias](docs/test-suite-a#typealias-typealias) | Test Type-Alias |

# Functions

| Function | Alerts | Return Type | Description |
| --- | --- | --- | --- |
| [testFunctionReturningInlineType()](docs/test-suite-a#testfunctionreturninginlinetype-function) |  | {     foo: number;     bar: [TestEnum](docs/test-suite-a#testenum-enum); } | Test function that returns an inline type |
| [testFunctionReturningIntersectionType()](docs/test-suite-a#testfunctionreturningintersectiontype-function) | `Deprecated` | [TestEmptyInterface](docs/test-suite-a#testemptyinterface-interface) &amp; [TestInterfaceWithTypeParameter](docs/test-suite-a#testinterfacewithtypeparameter-interface)&lt;number&gt; | Test function that returns an inline type |
| [testFunctionReturningUnionType()](docs/test-suite-a#testfunctionreturninguniontype-function) |  | string \| [TestInterface](docs/test-suite-a#testinterface-interface) | Test function that returns an inline type |

# Variables

| Variable | Alerts | Modifiers | Type | Description |
| --- | --- | --- | --- | --- |
| [testConst](docs/test-suite-a#testconst-variable) | `Beta` | `readonly` |  | Test Constant |
| [testConstWithEmptyDeprecatedBlock](docs/test-suite-a#testconstwithemptydeprecatedblock-variable) | `Deprecated` | `readonly` | string | I have a `@deprecated` tag with an empty comment block. |

# Namespaces

| Namespace | Alerts | Description |
| --- | --- | --- |
| [TestBetaNamespace](docs/test-suite-a#testbetanamespace-namespace) | `Beta` | A namespace tagged as `@beta`. |
| [TestModule](docs/test-suite-a#testmodule-namespace) |  |  |
| [TestNamespace](docs/test-suite-a#testnamespace-namespace) |  | Test Namespace |

# Interface Details

## TestEmptyInterface {#testemptyinterface-interface}

An empty interface

### Signature {#testemptyinterface-signature}

```typescript
export interface TestEmptyInterface
```

## TestInterface {#testinterface-interface}

Test interface

### Signature {#testinterface-signature}

```typescript
export interface TestInterface
```

### Remarks {#testinterface-remarks}

Here are some remarks about the interface

### Constructors

| Constructor | Return Type | Description |
| --- | --- | --- |
| [new (): TestInterface](docs/test-suite-a#testinterface-_new_-constructsignature) | [TestInterface](docs/test-suite-a#testinterface-interface) | Test construct signature. |

### Events

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [testClassEventProperty](docs/test-suite-a#testinterface-testclasseventproperty-propertysignature) | `readonly` | () =&gt; void | Test interface event property |

### Properties

| Property | Modifiers | Default Value | Type | Description |
| --- | --- | --- | --- | --- |
| [getterProperty](docs/test-suite-a#testinterface-getterproperty-property) | `readonly` |  | boolean | A test getter-only interface property. |
| [propertyWithBadInheritDocTarget](docs/test-suite-a#testinterface-propertywithbadinheritdoctarget-propertysignature) |  |  | boolean |  |
| [setterProperty](docs/test-suite-a#testinterface-setterproperty-property) |  |  | boolean | A test property with a getter and a setter. |
| [testInterfaceProperty](docs/test-suite-a#testinterface-testinterfaceproperty-propertysignature) |  |  | number | Test interface property |
| [testOptionalInterfaceProperty](docs/test-suite-a#testinterface-testoptionalinterfaceproperty-propertysignature) | `optional` | 0 | number | Test optional property |

### Methods

| Method | Return Type | Description |
| --- | --- | --- |
| [testInterfaceMethod()](docs/test-suite-a#testinterface-testinterfacemethod-methodsignature) | void | Test interface method |

### Call Signatures

| CallSignature | Description |
| --- | --- |
| [(event: 'testCallSignature', listener: (input: unknown) =&gt; void): any](docs/test-suite-a#testinterface-_call_-callsignature) | Test interface event call signature |
| [(event: 'anotherTestCallSignature', listener: (input: number) =&gt; string): number](docs/test-suite-a#testinterface-_call__1-callsignature) | Another example call signature |

### Constructor Details

#### new (): TestInterface {#testinterface-\_new\_-constructsignature}

Test construct signature.

##### Signature {#\_new\_-signature}

```typescript
new (): TestInterface;
```

##### Returns {#\_new\_-returns}

**Return type:** [TestInterface](docs/test-suite-a#testinterface-interface)

### Event Details

#### testClassEventProperty {#testinterface-testclasseventproperty-propertysignature}

Test interface event property

##### Signature {#testclasseventproperty-signature}

```typescript
readonly testClassEventProperty: () => void;
```

**Type:** () =&gt; void

##### Remarks {#testclasseventproperty-remarks}

Here are some remarks about the event property

### Property Details

#### getterProperty {#testinterface-getterproperty-property}

A test getter-only interface property.

##### Signature {#getterproperty-signature}

```typescript
get getterProperty(): boolean;
```

**Type:** boolean

#### propertyWithBadInheritDocTarget {#testinterface-propertywithbadinheritdoctarget-propertysignature}

##### Signature {#propertywithbadinheritdoctarget-signature}

```typescript
propertyWithBadInheritDocTarget: boolean;
```

**Type:** boolean

#### setterProperty {#testinterface-setterproperty-property}

A test property with a getter and a setter.

##### Signature {#setterproperty-signature}

```typescript
get setterProperty(): boolean;
set setterProperty(newValue: boolean);
```

**Type:** boolean

#### testInterfaceProperty {#testinterface-testinterfaceproperty-propertysignature}

Test interface property

##### Signature {#testinterfaceproperty-signature}

```typescript
testInterfaceProperty: number;
```

**Type:** number

##### Remarks {#testinterfaceproperty-remarks}

Here are some remarks about the property

#### testOptionalInterfaceProperty {#testinterface-testoptionalinterfaceproperty-propertysignature}

Test optional property

##### Signature {#testoptionalinterfaceproperty-signature}

```typescript
testOptionalInterfaceProperty?: number;
```

**Type:** number

### Method Details

#### testInterfaceMethod {#testinterface-testinterfacemethod-methodsignature}

Test interface method

##### Signature {#testinterfacemethod-signature}

```typescript
testInterfaceMethod(): void;
```

##### Remarks {#testinterfacemethod-remarks}

Here are some remarks about the method

### Call Signature Details

#### (event: 'testCallSignature', listener: (input: unknown) =&gt; void): any {#testinterface-\_call\_-callsignature}

Test interface event call signature

##### Signature {#\_call\_-signature}

```typescript
(event: 'testCallSignature', listener: (input: unknown) => void): any;
```

##### Remarks {#\_call\_-remarks}

Here are some remarks about the event call signature

#### (event: 'anotherTestCallSignature', listener: (input: number) =&gt; string): number {#testinterface-\_call\_\_1-callsignature}

Another example call signature

##### Signature {#\_call\_\_1-signature}

```typescript
(event: 'anotherTestCallSignature', listener: (input: number) => string): number;
```

##### Remarks {#\_call\_\_1-remarks}

Here are some remarks about the event call signature

### See Also {#testinterface-see-also}

[testInterfaceMethod()](docs/test-suite-a#testinterface-testinterfacemethod-methodsignature)

[testInterfaceProperty](docs/test-suite-a#testinterface-testinterfaceproperty-propertysignature)

[testOptionalInterfaceProperty](docs/test-suite-a#testinterface-testoptionalinterfaceproperty-propertysignature)

[testClassEventProperty](docs/test-suite-a#testinterface-testclasseventproperty-propertysignature)

## TestInterfaceExtendingOtherInterfaces {#testinterfaceextendingotherinterfaces-interface}

Test interface that extends other interfaces

### Signature {#testinterfaceextendingotherinterfaces-signature}

```typescript
export interface TestInterfaceExtendingOtherInterfaces extends TestInterface, TestMappedType, TestInterfaceWithTypeParameter<number>
```

**Extends:** [TestInterface](docs/test-suite-a#testinterface-interface), [TestMappedType](docs/test-suite-a#testmappedtype-typealias), [TestInterfaceWithTypeParameter](docs/test-suite-a#testinterfacewithtypeparameter-interface)&lt;number&gt;

### Remarks {#testinterfaceextendingotherinterfaces-remarks}

Here are some remarks about the interface

### Methods

| Method | Return Type | Description |
| --- | --- | --- |
| [testMethod(input)](docs/test-suite-a#testinterfaceextendingotherinterfaces-testmethod-methodsignature) | number | Test interface method accepting a string and returning a number. |

### Method Details

#### testMethod {#testinterfaceextendingotherinterfaces-testmethod-methodsignature}

Test interface method accepting a string and returning a number.

##### Signature {#testmethod-signature}

```typescript
testMethod(input: string): number;
```

##### Remarks {#testmethod-remarks}

Here are some remarks about the method

##### Parameters {#testmethod-parameters}

| Parameter | Type | Description |
| --- | --- | --- |
| input | string | A string |

##### Returns {#testmethod-returns}

A number

**Return type:** number

### See Also {#testinterfaceextendingotherinterfaces-see-also}

- [TestInterface](docs/test-suite-a#testinterface-interface)

- [TestInterfaceWithTypeParameter](docs/test-suite-a#testinterfacewithtypeparameter-interface)

- [TestMappedType](docs/test-suite-a#testmappedtype-typealias)

## TestInterfaceWithIndexSignature {#testinterfacewithindexsignature-interface}

An interface with an index signature.

### Signature {#testinterfacewithindexsignature-signature}

```typescript
export interface TestInterfaceWithIndexSignature
```

### Index Signatures

| IndexSignature | Description |
| --- | --- |
| [\[foo: number\]: { bar: string; }](docs/test-suite-a#testinterfacewithindexsignature-_indexer_-indexsignature) | Test index signature. |

### Index Signature Details

#### \[foo: number\]: { bar: string; } {#testinterfacewithindexsignature-\_indexer\_-indexsignature}

Test index signature.

##### Signature {#\_indexer\_-signature}

```typescript
[foo: number]: {
        bar: string;
    };
```

## TestInterfaceWithTypeParameter {#testinterfacewithtypeparameter-interface}

Test interface with generic type parameter

### Signature {#testinterfacewithtypeparameter-signature}

```typescript
export interface TestInterfaceWithTypeParameter<T>
```

#### Type Parameters

| Parameter | Description |
| --- | --- |
| T | A type parameter |

### Remarks {#testinterfacewithtypeparameter-remarks}

Here are some remarks about the interface

### Properties

| Property | Type | Description |
| --- | --- | --- |
| [testProperty](docs/test-suite-a#testinterfacewithtypeparameter-testproperty-propertysignature) | T | A test interface property using generic type parameter |

### Property Details

#### testProperty {#testinterfacewithtypeparameter-testproperty-propertysignature}

A test interface property using generic type parameter

##### Signature {#testproperty-signature}

```typescript
testProperty: T;
```

**Type:** T

##### Remarks {#testproperty-remarks}

Here are some remarks about the property

# Class Details

## TestAbstractClass {#testabstractclass-class}

A test abstract class.

### Signature {#testabstractclass-signature}

```typescript
export declare abstract class TestAbstractClass
```

### Constructors

| Constructor | Description |
| --- | --- |
| [(constructor)(privateProperty, protectedProperty)](docs/test-suite-a#testabstractclass-_constructor_-constructor) | This is a _{@customTag constructor}_. |

### Properties

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [abstractPropertyGetter](docs/test-suite-a#testabstractclass-abstractpropertygetter-property) | `readonly` | [TestMappedType](docs/test-suite-a#testmappedtype-typealias) | A test abstract getter property. |
| [protectedProperty](docs/test-suite-a#testabstractclass-protectedproperty-property) | `readonly` | [TestEnum](docs/test-suite-a#testenum-enum) | A test protected property. |

### Methods

| Method | Modifiers | Return Type | Description |
| --- | --- | --- | --- |
| [publicAbstractMethod()](docs/test-suite-a#testabstractclass-publicabstractmethod-method) |  | void | A test public abstract method. |
| [sealedMethod()](docs/test-suite-a#testabstractclass-sealedmethod-method) | `sealed` | string | A test `@sealed` method. |
| [virtualMethod()](docs/test-suite-a#testabstractclass-virtualmethod-method) | `virtual` | number | A test `@virtual` method. |

### Constructor Details

#### (constructor) {#testabstractclass-\_constructor\_-constructor}

This is a _{@customTag constructor}_.

##### Signature {#\_constructor\_-signature}

```typescript
protected constructor(privateProperty: number, protectedProperty: TestEnum);
```

##### Parameters {#\_constructor\_-parameters}

| Parameter | Type | Description |
| --- | --- | --- |
| privateProperty | number |  |
| protectedProperty | [TestEnum](docs/test-suite-a#testenum-enum) |  |

### Property Details

#### abstractPropertyGetter {#testabstractclass-abstractpropertygetter-property}

A test abstract getter property.

##### Signature {#abstractpropertygetter-signature}

```typescript
abstract get abstractPropertyGetter(): TestMappedType;
```

**Type:** [TestMappedType](docs/test-suite-a#testmappedtype-typealias)

#### protectedProperty {#testabstractclass-protectedproperty-property}

A test protected property.

##### Signature {#protectedproperty-signature}

```typescript
protected readonly protectedProperty: TestEnum;
```

**Type:** [TestEnum](docs/test-suite-a#testenum-enum)

### Method Details

#### publicAbstractMethod {#testabstractclass-publicabstractmethod-method}

A test public abstract method.

##### Signature {#publicabstractmethod-signature}

```typescript
abstract publicAbstractMethod(): void;
```

#### sealedMethod {#testabstractclass-sealedmethod-method}

A test `@sealed` method.

##### Signature {#sealedmethod-signature}

```typescript
/** @sealed */
protected sealedMethod(): string;
```

##### Returns {#sealedmethod-returns}

A string!

**Return type:** string

#### virtualMethod {#testabstractclass-virtualmethod-method}

A test `@virtual` method.

##### Signature {#virtualmethod-signature}

```typescript
/** @virtual */
protected virtualMethod(): number;
```

##### Returns {#virtualmethod-returns}

A number!

**Return type:** number

## TestClass {#testclass-class}

Test class

### Signature {#testclass-signature}

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> extends TestAbstractClass
```

**Extends:** [TestAbstractClass](docs/test-suite-a#testabstractclass-class)

#### Type Parameters

| Parameter | Description |
| --- | --- |
| TTypeParameterA | A type parameter |
| TTypeParameterB | Another type parameter |

### Remarks {#testclass-remarks}

Here are some remarks about the class

### Constructors

| Constructor | Description |
| --- | --- |
| [(constructor)(privateProperty, protectedProperty, testClassProperty, testClassEventProperty)](docs/test-suite-a#testclass-_constructor_-constructor) | Test class constructor |

### Static Properties

| Property | Type | Description |
| --- | --- | --- |
| [testClassStaticProperty](docs/test-suite-a#testclass-testclassstaticproperty-property) | (foo: number) =&gt; string | Test static class property |

### Static Methods

| Method | Return Type | Description |
| --- | --- | --- |
| [testClassStaticMethod(foo)](docs/test-suite-a#testclass-testclassstaticmethod-method) | string | Test class static method |

### Events

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [testClassEventProperty](docs/test-suite-a#testclass-testclasseventproperty-property) | `readonly` | () =&gt; void | Test class event property |

### Properties

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [abstractPropertyGetter](docs/test-suite-a#testclass-abstractpropertygetter-property) | `readonly` | [TestMappedType](docs/test-suite-a#testmappedtype-typealias) | A test abstract getter property. |
| [testClassGetterProperty](docs/test-suite-a#testclass-testclassgetterproperty-property) | `virtual` | number | Test class property with both a getter and a setter. |
| [testClassProperty](docs/test-suite-a#testclass-testclassproperty-property) | `readonly` | TTypeParameterB | Test class property |

### Methods

| Method | Modifiers | Return Type | Description |
| --- | --- | --- | --- |
| [publicAbstractMethod()](docs/test-suite-a#testclass-publicabstractmethod-method) |  | void | A test public abstract method. |
| [testClassMethod(input)](docs/test-suite-a#testclass-testclassmethod-method) | `sealed` | TTypeParameterA | Test class method |
| [virtualMethod()](docs/test-suite-a#testclass-virtualmethod-method) |  | number | Overrides [virtualMethod()](docs/test-suite-a#testabstractclass-virtualmethod-method). |

### Constructor Details

#### (constructor) {#testclass-\_constructor\_-constructor}

Test class constructor

##### Signature {#\_constructor\_-signature}

```typescript
constructor(privateProperty: number, protectedProperty: TestEnum, testClassProperty: TTypeParameterB, testClassEventProperty: () => void);
```

##### Remarks {#\_constructor\_-remarks}

Here are some remarks about the constructor

##### Parameters {#\_constructor\_-parameters}

| Parameter | Type | Description |
| --- | --- | --- |
| privateProperty | number | See [TestAbstractClass](docs/test-suite-a#testabstractclass-class)'s constructor. |
| protectedProperty | [TestEnum](docs/test-suite-a#testenum-enum) | <p>Some notes about the parameter.</p><p>See <a href="docs/test-suite-a#testabstractclass-protectedproperty-property">protectedProperty</a>.</p> |
| testClassProperty | TTypeParameterB | See [testClassProperty](docs/test-suite-a#testclass-testclassproperty-property). |
| testClassEventProperty | () =&gt; void | See [testClassEventProperty](docs/test-suite-a#testclass-testclasseventproperty-property). |

### Event Details

#### testClassEventProperty {#testclass-testclasseventproperty-property}

Test class event property

##### Signature {#testclasseventproperty-signature}

```typescript
readonly testClassEventProperty: () => void;
```

**Type:** () =&gt; void

##### Remarks {#testclasseventproperty-remarks}

Here are some remarks about the property

### Property Details

#### abstractPropertyGetter {#testclass-abstractpropertygetter-property}

A test abstract getter property.

##### Signature {#abstractpropertygetter-signature}

```typescript
get abstractPropertyGetter(): TestMappedType;
```

**Type:** [TestMappedType](docs/test-suite-a#testmappedtype-typealias)

#### testClassGetterProperty {#testclass-testclassgetterproperty-property}

Test class property with both a getter and a setter.

##### Signature {#testclassgetterproperty-signature}

```typescript
/** @virtual */
get testClassGetterProperty(): number;
set testClassGetterProperty(newValue: number);
```

**Type:** number

##### Remarks {#testclassgetterproperty-remarks}

Here are some remarks about the getter-only property

#### testClassProperty {#testclass-testclassproperty-property}

Test class property

##### Signature {#testclassproperty-signature}

```typescript
readonly testClassProperty: TTypeParameterB;
```

**Type:** TTypeParameterB

##### Remarks {#testclassproperty-remarks}

Here are some remarks about the property

#### testClassStaticProperty {#testclass-testclassstaticproperty-property}

Test static class property

##### Signature {#testclassstaticproperty-signature}

```typescript
static testClassStaticProperty: (foo: number) => string;
```

**Type:** (foo: number) =&gt; string

### Method Details

#### publicAbstractMethod {#testclass-publicabstractmethod-method}

A test public abstract method.

##### Signature {#publicabstractmethod-signature}

```typescript
publicAbstractMethod(): void;
```

#### testClassMethod {#testclass-testclassmethod-method}

Test class method

##### Signature {#testclassmethod-signature}

```typescript
/** @sealed */
testClassMethod(input: TTypeParameterA): TTypeParameterA;
```

##### Remarks {#testclassmethod-remarks}

Here are some remarks about the method

##### Parameters {#testclassmethod-parameters}

| Parameter | Type | Description |
| --- | --- | --- |
| input | TTypeParameterA |  |

##### Returns {#testclassmethod-returns}

**Return type:** TTypeParameterA

##### Throws {#testclassmethod-throws}

Some sort of error in 1 case.

Some other sort of error in another case. For example, a case where some thing happens.

#### testClassStaticMethod {#testclass-testclassstaticmethod-method}

Test class static method

##### Signature {#testclassstaticmethod-signature}

```typescript
static testClassStaticMethod(foo: number): string;
```

##### Parameters {#testclassstaticmethod-parameters}

| Parameter | Type | Description |
| --- | --- | --- |
| foo | number | Some number |

##### Returns {#testclassstaticmethod-returns}

- Some string

**Return type:** string

#### virtualMethod {#testclass-virtualmethod-method}

Overrides [virtualMethod()](docs/test-suite-a#testabstractclass-virtualmethod-method).

##### Signature {#virtualmethod-signature}

```typescript
/** @override */
protected virtualMethod(): number;
```

##### Returns {#virtualmethod-returns}

**Return type:** number

### See Also {#testclass-see-also}

[TestAbstractClass](docs/test-suite-a#testabstractclass-class)

# Enumeration Details

## TestEnum {#testenum-enum}

Test Enum

### Signature {#testenum-signature}

```typescript
export declare enum TestEnum
```

### Remarks {#testenum-remarks}

Here are some remarks about the enum

### Examples {#testenum-examples}

#### Example 1 {#testenum-example1}

Some example

```typescript
const foo = TestEnum.TestEnumValue1
```

#### Example 2 {#testenum-example2}

Another example

```ts
const bar = TestEnum.TestEnumValue2
```

### Flags

| Flag | Description |
| --- | --- |
| [TestEnumValue1](docs/test-suite-a#testenum-testenumvalue1-enummember) | Test enum value 1 (string) |
| [TestEnumValue2](docs/test-suite-a#testenum-testenumvalue2-enummember) | Test enum value 2 (number) |
| [TestEnumValue3](docs/test-suite-a#testenum-testenumvalue3-enummember) | Test enum value 3 (default) |

#### TestEnumValue1 {#testenum-testenumvalue1-enummember}

Test enum value 1 (string)

##### Signature {#testenumvalue1-signature}

```typescript
TestEnumValue1 = "test-enum-value-1"
```

##### Remarks {#testenumvalue1-remarks}

Here are some remarks about the enum value

#### TestEnumValue2 {#testenum-testenumvalue2-enummember}

Test enum value 2 (number)

##### Signature {#testenumvalue2-signature}

```typescript
TestEnumValue2 = 3
```

##### Remarks {#testenumvalue2-remarks}

Here are some remarks about the enum value

#### TestEnumValue3 {#testenum-testenumvalue3-enummember}

Test enum value 3 (default)

##### Signature {#testenumvalue3-signature}

```typescript
TestEnumValue3 = 4
```

##### Remarks {#testenumvalue3-remarks}

Here are some remarks about the enum value

# Type Details

## TestMappedType {#testmappedtype-typealias}

Test Mapped Type, using [TestEnum](docs/test-suite-a#testenum-enum)

### Signature {#testmappedtype-signature}

```typescript
export type TestMappedType = {
    [K in TestEnum]: boolean;
};
```

### Remarks {#testmappedtype-remarks}

Here are some remarks about the mapped type

## TypeAlias {#typealias-typealias}

Test Type-Alias

### Signature {#typealias-signature}

```typescript
export type TypeAlias = string;
```

### Remarks {#typealias-remarks}

Here are some remarks about the type alias

# Function Details

## testFunctionReturningInlineType {#testfunctionreturninginlinetype-function}

Test function that returns an inline type

### Signature {#testfunctionreturninginlinetype-signature}

```typescript
export declare function testFunctionReturningInlineType(): {
    foo: number;
    bar: TestEnum;
};
```

### Returns {#testfunctionreturninginlinetype-returns}

An inline type

**Return type:** {     foo: number;     bar: [TestEnum](docs/test-suite-a#testenum-enum); }

## testFunctionReturningIntersectionType {#testfunctionreturningintersectiontype-function}

Test function that returns an inline type

**WARNING: This API is deprecated and will be removed in a future release.**

_This is a test deprecation notice. Here is a_ [_link_](docs/test-suite-a#testfunctionreturninguniontype-function)<!-- --> _to something else!_

### Signature {#testfunctionreturningintersectiontype-signature}

```typescript
export declare function testFunctionReturningIntersectionType(): TestEmptyInterface & TestInterfaceWithTypeParameter<number>;
```

### Returns {#testfunctionreturningintersectiontype-returns}

an intersection type

**Return type:** [TestEmptyInterface](docs/test-suite-a#testemptyinterface-interface) &amp; [TestInterfaceWithTypeParameter](docs/test-suite-a#testinterfacewithtypeparameter-interface)&lt;number&gt;

## testFunctionReturningUnionType {#testfunctionreturninguniontype-function}

Test function that returns an inline type

### Signature {#testfunctionreturninguniontype-signature}

```typescript
export declare function testFunctionReturningUnionType(): string | TestInterface;
```

### Returns {#testfunctionreturninguniontype-returns}

A union type

**Return type:** string \| [TestInterface](docs/test-suite-a#testinterface-interface)

# Variable Details

## testConst {#testconst-variable}

Test Constant

**WARNING: This API is provided as a beta preview and may change without notice. Use at your own risk.**

### Signature {#testconst-signature}

```typescript
testConst = 42
```

### Remarks {#testconst-remarks}

Here are some remarks about the variable

## testConstWithEmptyDeprecatedBlock {#testconstwithemptydeprecatedblock-variable}

I have a `@deprecated` tag with an empty comment block.

**WARNING: This API is deprecated and will be removed in a future release.**

### Signature {#testconstwithemptydeprecatedblock-signature}

```typescript
testConstWithEmptyDeprecatedBlock: string
```

**Type:** string

# Namespace Details

## TestBetaNamespace {#testbetanamespace-namespace}

A namespace tagged as `@beta`.

**WARNING: This API is provided as a beta preview and may change without notice. Use at your own risk.**

### Signature {#testbetanamespace-signature}

```typescript
export declare namespace TestBetaNamespace
```

### Remarks {#testbetanamespace-remarks}

Tests release level inheritance.

### Variables

| Variable | Alerts | Modifiers | Type | Description |
| --- | --- | --- | --- | --- |
| [betaMember](docs/test-suite-a#testbetanamespace-betamember-variable) | `Beta` | `readonly` |  |  |
| [publicMember](docs/test-suite-a#testbetanamespace-publicmember-variable) | `Beta` | `readonly` |  |  |

### Variable Details

#### betaMember {#testbetanamespace-betamember-variable}

**WARNING: This API is provided as a beta preview and may change without notice. Use at your own risk.**

##### Signature {#betamember-signature}

```typescript
betaMember = "beta"
```

#### publicMember {#testbetanamespace-publicmember-variable}

**WARNING: This API is provided as a beta preview and may change without notice. Use at your own risk.**

##### Signature {#publicmember-signature}

```typescript
publicMember = "public"
```

## TestModule {#testmodule-namespace}

### Variables

| Variable | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [foo](docs/test-suite-a#testmodule-foo-variable) | `readonly` |  | Test constant in module. |

### Variable Details

#### foo {#testmodule-foo-variable}

Test constant in module.

##### Signature {#foo-signature}

```typescript
foo = 2
```

## TestNamespace {#testnamespace-namespace}

Test Namespace

### Signature {#testnamespace-signature}

```typescript
export declare namespace TestNamespace
```

### Remarks {#testnamespace-remarks}

Here are some remarks about the namespace

### Examples {#testnamespace-examples}

#### Example: TypeScript Example {#testnamespace-example1}

```typescript
const foo: Foo = {
	bar: "Hello world!";
	baz = 42;
};
```

#### Example: JavaScript Example {#testnamespace-example2}

```javascript
const foo = {
	bar: "Hello world!";
	baz = 42;
};
```

### Classes

| Class | Description |
| --- | --- |
| [TestClass](docs/test-suite-a#testnamespace-testclass-class) | Test class |

### Enumerations

| Enum | Description |
| --- | --- |
| [TestEnum](docs/test-suite-a#testnamespace-testenum-enum) | Test Enum |

### Types

| TypeAlias | Description |
| --- | --- |
| [TestTypeAlias](docs/test-suite-a#testnamespace-testtypealias-typealias) | Test Type-Alias |

### Functions

| Function | Return Type | Description |
| --- | --- | --- |
| [testFunction(testParameter)](docs/test-suite-a#testnamespace-testfunction-function) | number | Test function |

### Variables

| Variable | Alerts | Modifiers | Type | Description |
| --- | --- | --- | --- | --- |
| [TestConst](docs/test-suite-a#testnamespace-testconst-variable) | `Beta` | `readonly` |  | Test Constant |

### Namespaces

| Namespace | Description |
| --- | --- |
| [TestSubNamespace](docs/test-suite-a#testnamespace-testsubnamespace-namespace) | Test sub-namespace |

### Class Details

#### TestClass {#testnamespace-testclass-class}

Test class

##### Signature {#testclass-signature}

```typescript
class TestClass
```

##### Constructors

| Constructor | Description |
| --- | --- |
| [(constructor)(testClassProperty)](docs/test-suite-a#testnamespace-testclass-_constructor_-constructor) | Test class constructor |

##### Properties

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [testClassProperty](docs/test-suite-a#testnamespace-testclass-testclassproperty-property) | `readonly` | string | Test interface property |

##### Methods

| Method | Return Type | Description |
| --- | --- | --- |
| [testClassMethod(testParameter)](docs/test-suite-a#testnamespace-testclass-testclassmethod-method) | Promise&lt;string&gt; | Test class method |

##### Constructor Details

###### (constructor) {#testnamespace-testclass-\_constructor\_-constructor}

Test class constructor

<a id="_constructor_-signature"></a>
**Signature**

```typescript
constructor(testClassProperty: string);
```

<a id="_constructor_-parameters"></a>
**Parameters**

| Parameter | Type | Description |
| --- | --- | --- |
| testClassProperty | string | See [testClassProperty](docs/test-suite-a#testclass-testclassproperty-property) |

##### Property Details

###### testClassProperty {#testnamespace-testclass-testclassproperty-property}

Test interface property

<a id="testclassproperty-signature"></a>
**Signature**

```typescript
readonly testClassProperty: string;
```

**Type:** string

##### Method Details

###### testClassMethod {#testnamespace-testclass-testclassmethod-method}

Test class method

<a id="testclassmethod-signature"></a>
**Signature**

```typescript
testClassMethod(testParameter: string): Promise<string>;
```

<a id="testclassmethod-parameters"></a>
**Parameters**

| Parameter | Type | Description |
| --- | --- | --- |
| testParameter | string | A string |

<a id="testclassmethod-returns"></a>
**Returns**

A Promise

**Return type:** Promise&lt;string&gt;

<a id="testclassmethod-throws"></a>
**Throws**

An Error when something happens for which an error should be thrown. Except in the cases where another kind of error is thrown. We don't throw this error in those cases.

A different kind of error when a thing happens, but not when the first kind of error is thrown instead.

😁

### Enumeration Details

#### TestEnum {#testnamespace-testenum-enum}

Test Enum

##### Signature {#testenum-signature}

```typescript
enum TestEnum
```

##### Flags

| Flag | Description |
| --- | --- |
| [TestEnumValue1](docs/test-suite-a#testnamespace-testenum-testenumvalue1-enummember) | Test enum value 1 |
| [TestEnumValue2](docs/test-suite-a#testnamespace-testenum-testenumvalue2-enummember) | Test enum value 2 |

###### TestEnumValue1 {#testnamespace-testenum-testenumvalue1-enummember}

Test enum value 1

<a id="testenumvalue1-signature"></a>
**Signature**

```typescript
TestEnumValue1 = 0
```

###### TestEnumValue2 {#testnamespace-testenum-testenumvalue2-enummember}

Test enum value 2

<a id="testenumvalue2-signature"></a>
**Signature**

```typescript
TestEnumValue2 = 1
```

### Type Details

#### TestTypeAlias {#testnamespace-testtypealias-typealias}

Test Type-Alias

##### Signature {#testtypealias-signature}

```typescript
type TestTypeAlias = boolean;
```

### Function Details

#### testFunction {#testnamespace-testfunction-function}

Test function

##### Signature {#testfunction-signature}

```typescript
function testFunction(testParameter: number): number;
```

##### Parameters {#testfunction-parameters}

| Parameter | Type | Description |
| --- | --- | --- |
| testParameter | number |  |

##### Returns {#testfunction-returns}

A number

**Return type:** number

##### Throws {#testfunction-throws}

An Error

### Variable Details

#### TestConst {#testnamespace-testconst-variable}

Test Constant

**WARNING: This API is provided as a beta preview and may change without notice. Use at your own risk.**

##### Signature {#testconst-signature}

```typescript
TestConst = "Hello world!"
```

### Namespace Details

#### TestSubNamespace {#testnamespace-testsubnamespace-namespace}

Test sub-namespace

##### Signature {#testsubnamespace-signature}

```typescript
namespace TestSubNamespace
```
