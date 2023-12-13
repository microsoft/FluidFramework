<!--- This is sample front-matter for API item "simple-suite-test" -->

[Packages](docs/) &gt; [simple-suite-test](docs/simple-suite-test)

Test package

# Remarks {#simple-suite-test-remarks}

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

- Bad link (no alias): _InvalidItem_

- Bad link (with alias): _even though I link to an invalid item, I would still like this text to be rendered_

# Example {#simple-suite-test-example}

A test example

```typescript
const foo = bar;
```

# Interfaces

| Interface | Description |
| --- | --- |
| [TestEmptyInterface](docs/simple-suite-test#testemptyinterface-interface) | An empty interface |
| [TestInterface](docs/simple-suite-test#testinterface-interface) | Test interface |
| [TestInterfaceExtendingOtherInterfaces](docs/simple-suite-test#testinterfaceextendingotherinterfaces-interface) | Test interface that extends other interfaces |
| [TestInterfaceWithIndexSignature](docs/simple-suite-test#testinterfacewithindexsignature-interface) | An interface with an index signature. |
| [TestInterfaceWithTypeParameter](docs/simple-suite-test#testinterfacewithtypeparameter-interface) | Test interface with generic type parameter |

# Classes

| Class | Description |
| --- | --- |
| [TestAbstractClass](docs/simple-suite-test#testabstractclass-class) | A test abstract class. |
| [TestClass](docs/simple-suite-test#testclass-class) | Test class |

# Enumerations

| Enum | Description |
| --- | --- |
| [TestEnum](docs/simple-suite-test#testenum-enum) | Test Enum |

# Types

| TypeAlias | Description |
| --- | --- |
| [TestMappedType](docs/simple-suite-test#testmappedtype-typealias) | Test Mapped Type, using [TestEnum](docs/simple-suite-test#testenum-enum) |
| [TypeAlias](docs/simple-suite-test#typealias-typealias) | Test Type-Alias |

# Functions

| Function | Alerts | Return Type | Description |
| --- | --- | --- | --- |
| [testFunctionReturningInlineType()](docs/simple-suite-test#testfunctionreturninginlinetype-function) |  | {     foo: number;     bar: [TestEnum](docs/simple-suite-test#testenum-enum); } | Test function that returns an inline type |
| [testFunctionReturningIntersectionType()](docs/simple-suite-test#testfunctionreturningintersectiontype-function) | `DEPRECATED` | [TestEmptyInterface](docs/simple-suite-test#testemptyinterface-interface) &amp; [TestInterfaceWithTypeParameter](docs/simple-suite-test#testinterfacewithtypeparameter-interface)&lt;number&gt; | Test function that returns an inline type |
| [testFunctionReturningUnionType()](docs/simple-suite-test#testfunctionreturninguniontype-function) |  | string \| [TestInterface](docs/simple-suite-test#testinterface-interface) | Test function that returns an inline type |

# Variables

| Variable | Alerts | Modifiers | Description |
| --- | --- | --- | --- |
| [testConst](docs/simple-suite-test#testconst-variable) | `BETA` | `readonly` | Test Constant |
| [testConstWithEmptyDeprecatedBlock](docs/simple-suite-test#testconstwithemptydeprecatedblock-variable) | `DEPRECATED` | `readonly` | I have a `@deprecated` tag with an empty comment block. |

# Namespaces

| Namespace | Description |
| --- | --- |
| [TestModule](docs/simple-suite-test#testmodule-namespace) |  |
| [TestNamespace](docs/simple-suite-test#testnamespace-namespace) | Test Namespace |

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

### Construct Signatures

| ConstructSignature | Return Type | Description |
| --- | --- | --- |
| [new (): TestInterface](docs/simple-suite-test#testinterface-_new_-constructsignature) | [TestInterface](docs/simple-suite-test#testinterface-interface) | Test construct signature. |

### Events

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [testClassEventProperty](docs/simple-suite-test#testinterface-testclasseventproperty-propertysignature) | `readonly` | () =&gt; void | Test interface event property |

### Properties

| Property | Modifiers | Default Value | Type | Description |
| --- | --- | --- | --- | --- |
| [testInterfaceProperty](docs/simple-suite-test#testinterface-testinterfaceproperty-propertysignature) |  |  | number | Test interface property |
| [testOptionalInterfaceProperty](docs/simple-suite-test#testinterface-testoptionalinterfaceproperty-propertysignature) | `optional` | 0 | number | Test optional property |

### Methods

| Method | Return Type | Description |
| --- | --- | --- |
| [testInterfaceMethod()](docs/simple-suite-test#testinterface-testinterfacemethod-methodsignature) | void | Test interface method |

### Call Signatures

| CallSignature | Description |
| --- | --- |
| [(event: 'testCallSignature', listener: (input: unknown) =&gt; void): any](docs/simple-suite-test#testinterface-_call_-callsignature) | Test interface event call signature |
| [(event: 'anotherTestCallSignature', listener: (input: number) =&gt; string): number](docs/simple-suite-test#testinterface-_call__1-callsignature) | Another example call signature |

### Construct Signature Details

#### new (): TestInterface {#testinterface-_new_-constructsignature}

Test construct signature.

##### Signature {#_new_-signature}

```typescript
new (): TestInterface;
```

##### Returns {#_new_-returns}

**Return type:** [TestInterface](docs/simple-suite-test#testinterface-interface)

### Event Details

#### testClassEventProperty {#testinterface-testclasseventproperty-propertysignature}

Test interface event property

##### Signature {#testclasseventproperty-signature}

```typescript
readonly testClassEventProperty: () => void;
```

##### Remarks {#testclasseventproperty-remarks}

Here are some remarks about the event property

### Property Details

#### testInterfaceProperty {#testinterface-testinterfaceproperty-propertysignature}

Test interface property

##### Signature {#testinterfaceproperty-signature}

```typescript
testInterfaceProperty: number;
```

##### Remarks {#testinterfaceproperty-remarks}

Here are some remarks about the property

#### testOptionalInterfaceProperty {#testinterface-testoptionalinterfaceproperty-propertysignature}

Test optional property

##### Signature {#testoptionalinterfaceproperty-signature}

```typescript
testOptionalInterfaceProperty?: number;
```

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

#### (event: 'testCallSignature', listener: (input: unknown) =&gt; void): any {#testinterface-_call_-callsignature}

Test interface event call signature

##### Signature {#_call_-signature}

```typescript
(event: 'testCallSignature', listener: (input: unknown) => void): any;
```

##### Remarks {#_call_-remarks}

Here are some remarks about the event call signature

#### (event: 'anotherTestCallSignature', listener: (input: number) =&gt; string): number {#testinterface-_call__1-callsignature}

Another example call signature

##### Signature {#_call__1-signature}

```typescript
(event: 'anotherTestCallSignature', listener: (input: number) => string): number;
```

##### Remarks {#_call__1-remarks}

Here are some remarks about the event call signature

### See Also {#testinterface-see-also}

[testInterfaceMethod()](docs/simple-suite-test#testinterface-testinterfacemethod-methodsignature)

[testInterfaceProperty](docs/simple-suite-test#testinterface-testinterfaceproperty-propertysignature)

[testOptionalInterfaceProperty](docs/simple-suite-test#testinterface-testoptionalinterfaceproperty-propertysignature)

[testClassEventProperty](docs/simple-suite-test#testinterface-testclasseventproperty-propertysignature)

## TestInterfaceExtendingOtherInterfaces {#testinterfaceextendingotherinterfaces-interface}

Test interface that extends other interfaces

### Signature {#testinterfaceextendingotherinterfaces-signature}

```typescript
export interface TestInterfaceExtendingOtherInterfaces extends TestInterface, TestMappedType, TestInterfaceWithTypeParameter<number>
```

**Extends:** [TestInterface](docs/simple-suite-test#testinterface-interface), [TestMappedType](docs/simple-suite-test#testmappedtype-typealias), [TestInterfaceWithTypeParameter](docs/simple-suite-test#testinterfacewithtypeparameter-interface)&lt;number&gt;

### Remarks {#testinterfaceextendingotherinterfaces-remarks}

Here are some remarks about the interface

### Methods

| Method | Return Type | Description |
| --- | --- | --- |
| [testMethod(input)](docs/simple-suite-test#testinterfaceextendingotherinterfaces-testmethod-methodsignature) | number | Test interface method accepting a string and returning a number. |

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

- [TestInterface](docs/simple-suite-test#testinterface-interface)

- [TestInterfaceWithTypeParameter](docs/simple-suite-test#testinterfacewithtypeparameter-interface)

- [TestMappedType](docs/simple-suite-test#testmappedtype-typealias)

## TestInterfaceWithIndexSignature {#testinterfacewithindexsignature-interface}

An interface with an index signature.

### Signature {#testinterfacewithindexsignature-signature}

```typescript
export interface TestInterfaceWithIndexSignature
```

### Index Signatures

| IndexSignature | Description |
| --- | --- |
| [\[foo: number\]: { bar: string; }](docs/simple-suite-test#testinterfacewithindexsignature-_indexer_-indexsignature) | Test index signature. |

### Index Signature Details

#### \[foo: number\]: { bar: string; } {#testinterfacewithindexsignature-_indexer_-indexsignature}

Test index signature.

##### Signature {#_indexer_-signature}

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
| [testProperty](docs/simple-suite-test#testinterfacewithtypeparameter-testproperty-propertysignature) | T | A test interface property using generic type parameter |

### Property Details

#### testProperty {#testinterfacewithtypeparameter-testproperty-propertysignature}

A test interface property using generic type parameter

##### Signature {#testproperty-signature}

```typescript
testProperty: T;
```

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
| [(constructor)(privateProperty, protectedProperty)](docs/simple-suite-test#testabstractclass-_constructor_-constructor) | This is a constructor. |

### Properties

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [abstractPropertyGetter](docs/simple-suite-test#testabstractclass-abstractpropertygetter-property) | `readonly` | [TestMappedType](docs/simple-suite-test#testmappedtype-typealias) | A test abstract getter property. |
| [protectedProperty](docs/simple-suite-test#testabstractclass-protectedproperty-property) | `readonly` | [TestEnum](docs/simple-suite-test#testenum-enum) | A test protected property. |

### Methods

| Method | Modifiers | Return Type | Description |
| --- | --- | --- | --- |
| [publicAbstractMethod()](docs/simple-suite-test#testabstractclass-publicabstractmethod-method) |  | void | A test public abstract method. |
| [sealedMethod()](docs/simple-suite-test#testabstractclass-sealedmethod-method) | `sealed` | string | A test `@sealed` method. |
| [virtualMethod()](docs/simple-suite-test#testabstractclass-virtualmethod-method) | `virtual` | number | A test `@virtual` method. |

### Constructor Details

#### (constructor) {#testabstractclass-_constructor_-constructor}

This is a constructor.

##### Signature {#_constructor_-signature}

```typescript
protected constructor(privateProperty: number, protectedProperty: TestEnum);
```

##### Parameters {#_constructor_-parameters}

| Parameter | Type | Description |
| --- | --- | --- |
| privateProperty | number |  |
| protectedProperty | [TestEnum](docs/simple-suite-test#testenum-enum) |  |

### Property Details

#### abstractPropertyGetter {#testabstractclass-abstractpropertygetter-property}

A test abstract getter property.

##### Signature {#abstractpropertygetter-signature}

```typescript
abstract get abstractPropertyGetter(): TestMappedType;
```

#### protectedProperty {#testabstractclass-protectedproperty-property}

A test protected property.

##### Signature {#protectedproperty-signature}

```typescript
protected readonly protectedProperty: TestEnum;
```

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

**Extends:** [TestAbstractClass](docs/simple-suite-test#testabstractclass-class)

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
| [(constructor)(privateProperty, protectedProperty, testClassProperty, testClassEventProperty)](docs/simple-suite-test#testclass-_constructor_-constructor) | Test class constructor |

### Static Properties

| Property | Type | Description |
| --- | --- | --- |
| [testClassStaticProperty](docs/simple-suite-test#testclass-testclassstaticproperty-property) | (foo: number) =&gt; string | Test static class property |

### Static Methods

| Method | Return Type | Description |
| --- | --- | --- |
| [testClassStaticMethod(foo)](docs/simple-suite-test#testclass-testclassstaticmethod-method) | string | Test class static method |

### Events

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [testClassEventProperty](docs/simple-suite-test#testclass-testclasseventproperty-property) | `readonly` | () =&gt; void | Test class event property |

### Properties

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [abstractPropertyGetter](docs/simple-suite-test#testclass-abstractpropertygetter-property) | `readonly` | [TestMappedType](docs/simple-suite-test#testmappedtype-typealias) | A test abstract getter property. |
| [testClassGetterProperty](docs/simple-suite-test#testclass-testclassgetterproperty-property) | `readonly`, `virtual` | number | Test class getter-only property |
| [testClassProperty](docs/simple-suite-test#testclass-testclassproperty-property) | `readonly` | TTypeParameterB | Test class property |

### Methods

| Method | Modifiers | Return Type | Description |
| --- | --- | --- | --- |
| [publicAbstractMethod()](docs/simple-suite-test#testclass-publicabstractmethod-method) |  | void | A test public abstract method. |
| [testClassMethod(input)](docs/simple-suite-test#testclass-testclassmethod-method) | `sealed` | TTypeParameterA | Test class method |
| [virtualMethod()](docs/simple-suite-test#testclass-virtualmethod-method) |  | number | Overrides [virtualMethod()](docs/simple-suite-test#testabstractclass-virtualmethod-method). |

### Constructor Details

#### (constructor) {#testclass-_constructor_-constructor}

Test class constructor

##### Signature {#_constructor_-signature}

```typescript
constructor(privateProperty: number, protectedProperty: TestEnum, testClassProperty: TTypeParameterB, testClassEventProperty: () => void);
```

##### Remarks {#_constructor_-remarks}

Here are some remarks about the constructor

##### Parameters {#_constructor_-parameters}

| Parameter | Type | Description |
| --- | --- | --- |
| privateProperty | number | See [TestAbstractClass](docs/simple-suite-test#testabstractclass-class)'s constructor. |
| protectedProperty | [TestEnum](docs/simple-suite-test#testenum-enum) | <p>Some notes about the parameter.</p><p>See <a href='docs/simple-suite-test#testabstractclass-protectedproperty-property'>protectedProperty</a>.</p> |
| testClassProperty | TTypeParameterB | See [testClassProperty](docs/simple-suite-test#testclass-testclassproperty-property). |
| testClassEventProperty | () =&gt; void | See [testClassEventProperty](docs/simple-suite-test#testclass-testclasseventproperty-property). |

### Event Details

#### testClassEventProperty {#testclass-testclasseventproperty-property}

Test class event property

##### Signature {#testclasseventproperty-signature}

```typescript
readonly testClassEventProperty: () => void;
```

##### Remarks {#testclasseventproperty-remarks}

Here are some remarks about the property

### Property Details

#### abstractPropertyGetter {#testclass-abstractpropertygetter-property}

A test abstract getter property.

##### Signature {#abstractpropertygetter-signature}

```typescript
get abstractPropertyGetter(): TestMappedType;
```

#### testClassGetterProperty {#testclass-testclassgetterproperty-property}

Test class getter-only property

##### Signature {#testclassgetterproperty-signature}

```typescript
/** @virtual */
get testClassGetterProperty(): number;
```

##### Remarks {#testclassgetterproperty-remarks}

Here are some remarks about the getter-only property

#### testClassProperty {#testclass-testclassproperty-property}

Test class property

##### Signature {#testclassproperty-signature}

```typescript
readonly testClassProperty: TTypeParameterB;
```

##### Remarks {#testclassproperty-remarks}

Here are some remarks about the property

#### testClassStaticProperty {#testclass-testclassstaticproperty-property}

Test static class property

##### Signature {#testclassstaticproperty-signature}

```typescript
static testClassStaticProperty: (foo: number) => string;
```

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

Overrides [virtualMethod()](docs/simple-suite-test#testabstractclass-virtualmethod-method).

##### Signature {#virtualmethod-signature}

```typescript
/** @override */
protected virtualMethod(): number;
```

##### Returns {#virtualmethod-returns}

**Return type:** number

### See Also {#testclass-see-also}

[TestAbstractClass](docs/simple-suite-test#testabstractclass-class)

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
| [TestEnumValue1](docs/simple-suite-test#testenum-testenumvalue1-enummember) | Test enum value 1 (string) |
| [TestEnumValue2](docs/simple-suite-test#testenum-testenumvalue2-enummember) | Test enum value 2 (number) |
| [TestEnumValue3](docs/simple-suite-test#testenum-testenumvalue3-enummember) | Test enum value 3 (default) |

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

Test Mapped Type, using [TestEnum](docs/simple-suite-test#testenum-enum)

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

**Return type:** {     foo: number;     bar: [TestEnum](docs/simple-suite-test#testenum-enum); }

## testFunctionReturningIntersectionType {#testfunctionreturningintersectiontype-function}

Test function that returns an inline type

**WARNING: This API is deprecated and will be removed in a future release.**

_This is a test deprecation notice. Here is a_ [_link_](docs/simple-suite-test#testfunctionreturninguniontype-function)<!-- --> _to something else!_

### Signature {#testfunctionreturningintersectiontype-signature}

```typescript
export declare function testFunctionReturningIntersectionType(): TestEmptyInterface & TestInterfaceWithTypeParameter<number>;
```

### Returns {#testfunctionreturningintersectiontype-returns}

an intersection type

**Return type:** [TestEmptyInterface](docs/simple-suite-test#testemptyinterface-interface) &amp; [TestInterfaceWithTypeParameter](docs/simple-suite-test#testinterfacewithtypeparameter-interface)&lt;number&gt;

## testFunctionReturningUnionType {#testfunctionreturninguniontype-function}

Test function that returns an inline type

### Signature {#testfunctionreturninguniontype-signature}

```typescript
export declare function testFunctionReturningUnionType(): string | TestInterface;
```

### Returns {#testfunctionreturninguniontype-returns}

A union type

**Return type:** string \| [TestInterface](docs/simple-suite-test#testinterface-interface)

# Variable Details

## testConst (BETA) {#testconst-variable}

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
testConstWithEmptyDeprecatedBlock = "I have a `@deprecated` tag with an empty comment block."
```

# Namespace Details

## TestModule {#testmodule-namespace}

### Variables

| Variable | Modifiers | Description |
| --- | --- | --- |
| [foo](docs/simple-suite-test#testmodule-foo-variable) | `readonly` | Test constant in module. |

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
const foo = bar;
```

#### Example: JavaScript Example {#testnamespace-example2}

```javascript
const bar = foo
```

### Classes

| Class | Description |
| --- | --- |
| [TestClass](docs/simple-suite-test#testnamespace-testclass-class) | Test class |

### Enumerations

| Enum | Description |
| --- | --- |
| [TestEnum](docs/simple-suite-test#testnamespace-testenum-enum) | Test Enum |

### Types

| TypeAlias | Description |
| --- | --- |
| [TestTypeAlias](docs/simple-suite-test#testnamespace-testtypealias-typealias) | Test Type-Alias |

### Functions

| Function | Return Type | Description |
| --- | --- | --- |
| [testFunction(testParameter)](docs/simple-suite-test#testnamespace-testfunction-function) | number | Test function |

### Variables

| Variable | Alerts | Modifiers | Description |
| --- | --- | --- | --- |
| [TestConst](docs/simple-suite-test#testnamespace-testconst-variable) | `BETA` | `readonly` | Test Constant |

### Namespaces

| Namespace | Description |
| --- | --- |
| [TestSubNamespace](docs/simple-suite-test#testnamespace-testsubnamespace-namespace) | Test sub-namespace |

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
| [(constructor)(testClassProperty)](docs/simple-suite-test#testnamespace-testclass-_constructor_-constructor) | Test class constructor |

##### Properties

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [testClassProperty](docs/simple-suite-test#testnamespace-testclass-testclassproperty-property) | `readonly` | string | Test interface property |

##### Methods

| Method | Return Type | Description |
| --- | --- | --- |
| [testClassMethod(testParameter)](docs/simple-suite-test#testnamespace-testclass-testclassmethod-method) | Promise&lt;string&gt; | Test class method |

##### Constructor Details

###### (constructor) {#testnamespace-testclass-_constructor_-constructor}

Test class constructor

<a name="_constructor_-signature" />
**Signature**

```typescript
constructor(testClassProperty: string);
```

<a name="_constructor_-parameters" />
**Parameters**

| Parameter | Type | Description |
| --- | --- | --- |
| testClassProperty | string | See [testClassProperty](docs/simple-suite-test#testclass-testclassproperty-property) |

##### Property Details

###### testClassProperty {#testnamespace-testclass-testclassproperty-property}

Test interface property

<a name="testclassproperty-signature" />
**Signature**

```typescript
readonly testClassProperty: string;
```

##### Method Details

###### testClassMethod {#testnamespace-testclass-testclassmethod-method}

Test class method

<a name="testclassmethod-signature" />
**Signature**

```typescript
testClassMethod(testParameter: string): Promise<string>;
```

<a name="testclassmethod-parameters" />
**Parameters**

| Parameter | Type | Description |
| --- | --- | --- |
| testParameter | string | A string |

<a name="testclassmethod-returns" />
**Returns**

A Promise

**Return type:** Promise&lt;string&gt;

<a name="testclassmethod-throws" />
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
| [TestEnumValue1](docs/simple-suite-test#testnamespace-testenum-testenumvalue1-enummember) | Test enum value 1 |
| [TestEnumValue2](docs/simple-suite-test#testnamespace-testenum-testenumvalue2-enummember) | Test enum value 2 |

###### TestEnumValue1 {#testnamespace-testenum-testenumvalue1-enummember}

Test enum value 1

<a name="testenumvalue1-signature" />
**Signature**

```typescript
TestEnumValue1 = 0
```

###### TestEnumValue2 {#testnamespace-testenum-testenumvalue2-enummember}

Test enum value 2

<a name="testenumvalue2-signature" />
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

#### TestConst (BETA) {#testnamespace-testconst-variable}

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
