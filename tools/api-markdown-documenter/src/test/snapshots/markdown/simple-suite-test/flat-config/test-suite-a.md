[Packages](docs/) > [test-suite-a](docs/test-suite-a)

Test package

<a id="test-suite-a-remarks"></a>

# Remarks

This remarks block includes a bulleted list!

- Bullet 1
- Bullet 2

And an ordered list for good measure!

1. List item 1
1. List item 2
1. List item 3

Also, here is a link test, including a bad link, because we should have some reasonable support if this happens:

- Good link (no alias): [TestClass](docs/test-suite-a#testclass-class)
- Good link (with alias): _function alias text_
- Bad link (no alias): _InvalidItem_
- Bad link (with alias): _even though I link to an invalid item, I would still like this text to be rendered_

<a id="test-suite-a-example"></a>

# Example

A test example

```typescript
const foo = bar;
```

# Interfaces

| Interface | Description |
| - | - |
| [TestEmptyInterface](docs/test-suite-a#testemptyinterface-interface) | An empty interface |
| [TestInterface](docs/test-suite-a#testinterface-interface) | Test interface |
| [TestInterfaceExtendingOtherInterfaces](docs/test-suite-a#testinterfaceextendingotherinterfaces-interface) | Test interface that extends other interfaces |
| [TestInterfaceWithIndexSignature](docs/test-suite-a#testinterfacewithindexsignature-interface) | An interface with an index signature. |
| [TestInterfaceWithTypeParameter](docs/test-suite-a#testinterfacewithtypeparameter-interface) | Test interface with generic type parameter |

# Classes

| Class | Description |
| - | - |
| [TestAbstractClass](docs/test-suite-a#testabstractclass-class) | A test abstract class. |
| [TestClass](docs/test-suite-a#testclass-class) | Test class |

# Enumerations

| Enum | Description |
| - | - |
| [TestEnum](docs/test-suite-a#testenum-enum) | Test Enum |

# Types

| TypeAlias | Description |
| - | - |
| [TestMappedType](docs/test-suite-a#testmappedtype-typealias) | Test Mapped Type, using [TestEnum](docs/test-suite-a#testenum-enum) |
| [TypeAlias](docs/test-suite-a#typealias-typealias) | Test Type-Alias |

# Functions

| Function | Alerts | Return Type | Description |
| - | - | - | - |
| [testFunctionReturningInlineType()](docs/test-suite-a#testfunctionreturninginlinetype-function) | | {     foo: number;     bar: [TestEnum](docs/test-suite-a#testenum-enum); } | Test function that returns an inline type |
| [testFunctionReturningIntersectionType()](docs/test-suite-a#testfunctionreturningintersectiontype-function) | `Deprecated` | [TestEmptyInterface](docs/test-suite-a#testemptyinterface-interface) & [TestInterfaceWithTypeParameter](docs/test-suite-a#testinterfacewithtypeparameter-interface)\<number> | Test function that returns an inline type |
| [testFunctionReturningUnionType()](docs/test-suite-a#testfunctionreturninguniontype-function) | | string \| [TestInterface](docs/test-suite-a#testinterface-interface) | Test function that returns an inline type |

# Variables

| Variable | Alerts | Modifiers | Type | Description |
| - | - | - | - | - |
| [testConst](docs/test-suite-a#testconst-variable) | `Beta` | `readonly` | | Test Constant |
| [testConstWithEmptyDeprecatedBlock](docs/test-suite-a#testconstwithemptydeprecatedblock-variable) | `Deprecated` | `readonly` | string | I have a `@deprecated` tag with an empty comment block. |

# Namespaces

| Namespace | Alerts | Description |
| - | - | - |
| [TestBetaNamespace](docs/test-suite-a#testbetanamespace-namespace) | `Beta` | A namespace tagged as `@beta`. |
| [TestModule](docs/test-suite-a#testmodule-namespace) | | |
| [TestNamespace](docs/test-suite-a#testnamespace-namespace) | | Test Namespace |

# Interface Details

<a id="testemptyinterface-interface"></a>

## TestEmptyInterface

An empty interface

<a id="testemptyinterface-signature"></a>

### Signature

```typescript
export interface TestEmptyInterface
```

<a id="testinterface-interface"></a>

## TestInterface

Test interface

<a id="testinterface-signature"></a>

### Signature

```typescript
export interface TestInterface
```

<a id="testinterface-remarks"></a>

### Remarks

Here are some remarks about the interface

### Constructors

| Constructor | Return Type | Description |
| - | - | - |
| [new (): TestInterface](docs/test-suite-a#testinterface-_new_-constructsignature) | [TestInterface](docs/test-suite-a#testinterface-interface) | Test construct signature. |

### Events

| Property | Modifiers | Type | Description |
| - | - | - | - |
| [testClassEventProperty](docs/test-suite-a#testinterface-testclasseventproperty-propertysignature) | `readonly` | () => void | Test interface event property |

### Properties

| Property | Modifiers | Default Value | Type | Description |
| - | - | - | - | - |
| [getterProperty](docs/test-suite-a#testinterface-getterproperty-property) | `readonly` | | boolean | A test getter-only interface property. |
| [propertyWithBadInheritDocTarget](docs/test-suite-a#testinterface-propertywithbadinheritdoctarget-propertysignature) | | | boolean | |
| [setterProperty](docs/test-suite-a#testinterface-setterproperty-property) | | | boolean | A test property with a getter and a setter. |
| [testInterfaceProperty](docs/test-suite-a#testinterface-testinterfaceproperty-propertysignature) | | | number | Test interface property |
| [testOptionalInterfaceProperty](docs/test-suite-a#testinterface-testoptionalinterfaceproperty-propertysignature) | `optional` | 0 | number | Test optional property |

### Methods

| Method | Return Type | Description |
| - | - | - |
| [testInterfaceMethod()](docs/test-suite-a#testinterface-testinterfacemethod-methodsignature) | void | Test interface method |

### Call Signatures

| CallSignature | Description |
| - | - |
| [(event: 'testCallSignature', listener: (input: unknown) => void): any](docs/test-suite-a#testinterface-_call_-callsignature) | Test interface event call signature |
| [(event: 'anotherTestCallSignature', listener: (input: number) => string): number](docs/test-suite-a#testinterface-_call__1-callsignature) | Another example call signature |

### Constructor Details

<a id="testinterface-_new_-constructsignature"></a>

#### new (): TestInterface

Test construct signature.

<a id="_new_-signature"></a>

##### Signature

```typescript
new (): TestInterface;
```

<a id="_new_-returns"></a>

##### Returns

**Return type**: [TestInterface](docs/test-suite-a#testinterface-interface)

### Event Details

<a id="testinterface-testclasseventproperty-propertysignature"></a>

#### testClassEventProperty

Test interface event property

<a id="testclasseventproperty-signature"></a>

##### Signature

```typescript
readonly testClassEventProperty: () => void;
```

**Type**: () => void

<a id="testclasseventproperty-remarks"></a>

##### Remarks

Here are some remarks about the event property

### Property Details

<a id="testinterface-getterproperty-property"></a>

#### getterProperty

A test getter-only interface property.

<a id="getterproperty-signature"></a>

##### Signature

```typescript
get getterProperty(): boolean;
```

**Type**: boolean

<a id="testinterface-propertywithbadinheritdoctarget-propertysignature"></a>

#### propertyWithBadInheritDocTarget

<a id="propertywithbadinheritdoctarget-signature"></a>

##### Signature

```typescript
propertyWithBadInheritDocTarget: boolean;
```

**Type**: boolean

<a id="testinterface-setterproperty-property"></a>

#### setterProperty

A test property with a getter and a setter.

<a id="setterproperty-signature"></a>

##### Signature

```typescript
get setterProperty(): boolean;

set setterProperty(newValue: boolean);
```

**Type**: boolean

<a id="testinterface-testinterfaceproperty-propertysignature"></a>

#### testInterfaceProperty

Test interface property

<a id="testinterfaceproperty-signature"></a>

##### Signature

```typescript
testInterfaceProperty: number;
```

**Type**: number

<a id="testinterfaceproperty-remarks"></a>

##### Remarks

Here are some remarks about the property

<a id="testinterface-testoptionalinterfaceproperty-propertysignature"></a>

#### testOptionalInterfaceProperty

Test optional property

<a id="testoptionalinterfaceproperty-signature"></a>

##### Signature

```typescript
testOptionalInterfaceProperty?: number;
```

**Type**: number

### Method Details

<a id="testinterface-testinterfacemethod-methodsignature"></a>

#### testInterfaceMethod

Test interface method

<a id="testinterfacemethod-signature"></a>

##### Signature

```typescript
testInterfaceMethod(): void;
```

<a id="testinterfacemethod-remarks"></a>

##### Remarks

Here are some remarks about the method

### Call Signature Details

<a id="testinterface-_call_-callsignature"></a>

#### (event: 'testCallSignature', listener: (input: unknown) => void): any

Test interface event call signature

<a id="_call_-signature"></a>

##### Signature

```typescript
(event: 'testCallSignature', listener: (input: unknown) => void): any;
```

<a id="_call_-remarks"></a>

##### Remarks

Here are some remarks about the event call signature

<a id="testinterface-_call__1-callsignature"></a>

#### (event: 'anotherTestCallSignature', listener: (input: number) => string): number

Another example call signature

<a id="_call__1-signature"></a>

##### Signature

```typescript
(event: 'anotherTestCallSignature', listener: (input: number) => string): number;
```

<a id="_call__1-remarks"></a>

##### Remarks

Here are some remarks about the event call signature

<a id="testinterface-see-also"></a>

### See Also

[testInterfaceMethod()](docs/test-suite-a#testinterface-testinterfacemethod-methodsignature)

[testInterfaceProperty](docs/test-suite-a#testinterface-testinterfaceproperty-propertysignature)

[testOptionalInterfaceProperty](docs/test-suite-a#testinterface-testoptionalinterfaceproperty-propertysignature)

[testClassEventProperty](docs/test-suite-a#testinterface-testclasseventproperty-propertysignature)

<a id="testinterfaceextendingotherinterfaces-interface"></a>

## TestInterfaceExtendingOtherInterfaces

Test interface that extends other interfaces

<a id="testinterfaceextendingotherinterfaces-signature"></a>

### Signature

```typescript
export interface TestInterfaceExtendingOtherInterfaces extends TestInterface, TestMappedType, TestInterfaceWithTypeParameter<number>
```

**Extends**: [TestInterface](docs/test-suite-a#testinterface-interface), [TestMappedType](docs/test-suite-a#testmappedtype-typealias), [TestInterfaceWithTypeParameter](docs/test-suite-a#testinterfacewithtypeparameter-interface)\<number>

<a id="testinterfaceextendingotherinterfaces-remarks"></a>

### Remarks

Here are some remarks about the interface

### Methods

| Method | Return Type | Description |
| - | - | - |
| [testMethod(input)](docs/test-suite-a#testinterfaceextendingotherinterfaces-testmethod-methodsignature) | number | Test interface method accepting a string and returning a number. |

### Method Details

<a id="testinterfaceextendingotherinterfaces-testmethod-methodsignature"></a>

#### testMethod

Test interface method accepting a string and returning a number.

<a id="testmethod-signature"></a>

##### Signature

```typescript
testMethod(input: string): number;
```

<a id="testmethod-remarks"></a>

##### Remarks

Here are some remarks about the method

<a id="testmethod-parameters"></a>

##### Parameters

| Parameter | Type | Description |
| - | - | - |
| input | string | A string |

<a id="testmethod-returns"></a>

##### Returns

A number

**Return type**: number

<a id="testinterfaceextendingotherinterfaces-see-also"></a>

### See Also

- [TestInterface](docs/test-suite-a#testinterface-interface)
- [TestInterfaceWithTypeParameter](docs/test-suite-a#testinterfacewithtypeparameter-interface)
- [TestMappedType](docs/test-suite-a#testmappedtype-typealias)

<a id="testinterfacewithindexsignature-interface"></a>

## TestInterfaceWithIndexSignature

An interface with an index signature.

<a id="testinterfacewithindexsignature-signature"></a>

### Signature

```typescript
export interface TestInterfaceWithIndexSignature
```

### Index Signatures

| IndexSignature | Description |
| - | - |
| [\[foo: number\]: { bar: string; }](docs/test-suite-a#testinterfacewithindexsignature-_indexer_-indexsignature) | Test index signature. |

### Index Signature Details

<a id="testinterfacewithindexsignature-_indexer_-indexsignature"></a>

#### \[foo: number]: { bar: string; }

Test index signature.

<a id="_indexer_-signature"></a>

##### Signature

```typescript
[foo: number]: {
        bar: string;
    };
```

<a id="testinterfacewithtypeparameter-interface"></a>

## TestInterfaceWithTypeParameter

Test interface with generic type parameter

<a id="testinterfacewithtypeparameter-signature"></a>

### Signature

```typescript
export interface TestInterfaceWithTypeParameter<T>
```

#### Type Parameters

| Parameter | Description |
| - | - |
| T | A type parameter |

<a id="testinterfacewithtypeparameter-remarks"></a>

### Remarks

Here are some remarks about the interface

### Properties

| Property | Type | Description |
| - | - | - |
| [testProperty](docs/test-suite-a#testinterfacewithtypeparameter-testproperty-propertysignature) | T | A test interface property using generic type parameter |

### Property Details

<a id="testinterfacewithtypeparameter-testproperty-propertysignature"></a>

#### testProperty

A test interface property using generic type parameter

<a id="testproperty-signature"></a>

##### Signature

```typescript
testProperty: T;
```

**Type**: T

<a id="testproperty-remarks"></a>

##### Remarks

Here are some remarks about the property

# Class Details

<a id="testabstractclass-class"></a>

## TestAbstractClass

A test abstract class.

<a id="testabstractclass-signature"></a>

### Signature

```typescript
export declare abstract class TestAbstractClass
```

### Constructors

| Constructor | Description |
| - | - |
| [(constructor)(privateProperty, protectedProperty)](docs/test-suite-a#testabstractclass-_constructor_-constructor) | This is a _{@customTag constructor}_. |

### Properties

| Property | Modifiers | Type | Description |
| - | - | - | - |
| [abstractPropertyGetter](docs/test-suite-a#testabstractclass-abstractpropertygetter-property) | `readonly` | [TestMappedType](docs/test-suite-a#testmappedtype-typealias) | <p>A test abstract getter property.</p><p>@escapedTag</p> |
| [protectedProperty](docs/test-suite-a#testabstractclass-protectedproperty-property) | `readonly` | [TestEnum](docs/test-suite-a#testenum-enum) | A test protected property. |

### Methods

| Method | Modifiers | Return Type | Description |
| - | - | - | - |
| [publicAbstractMethod()](docs/test-suite-a#testabstractclass-publicabstractmethod-method) | | void | A test public abstract method. |
| [sealedMethod()](docs/test-suite-a#testabstractclass-sealedmethod-method) | `sealed` | string | A test `@sealed` method. |
| [virtualMethod()](docs/test-suite-a#testabstractclass-virtualmethod-method) | `virtual` | number | A test `@virtual` method. |

### Constructor Details

<a id="testabstractclass-_constructor_-constructor"></a>

#### (constructor)

This is a _{@customTag constructor}_.

<a id="_constructor_-signature"></a>

##### Signature

```typescript
protected constructor(privateProperty: number, protectedProperty: TestEnum);
```

<a id="_constructor_-parameters"></a>

##### Parameters

| Parameter | Type | Description |
| - | - | - |
| privateProperty | number | |
| protectedProperty | [TestEnum](docs/test-suite-a#testenum-enum) | |

### Property Details

<a id="testabstractclass-abstractpropertygetter-property"></a>

#### abstractPropertyGetter

A test abstract getter property.

@escapedTag

<a id="abstractpropertygetter-signature"></a>

##### Signature

```typescript
abstract get abstractPropertyGetter(): TestMappedType;
```

**Type**: [TestMappedType](docs/test-suite-a#testmappedtype-typealias)

<a id="testabstractclass-protectedproperty-property"></a>

#### protectedProperty

A test protected property.

<a id="protectedproperty-signature"></a>

##### Signature

```typescript
protected readonly protectedProperty: TestEnum;
```

**Type**: [TestEnum](docs/test-suite-a#testenum-enum)

### Method Details

<a id="testabstractclass-publicabstractmethod-method"></a>

#### publicAbstractMethod

A test public abstract method.

<a id="publicabstractmethod-signature"></a>

##### Signature

```typescript
abstract publicAbstractMethod(): void;
```

<a id="testabstractclass-sealedmethod-method"></a>

#### sealedMethod

A test `@sealed` method.

<a id="sealedmethod-signature"></a>

##### Signature

```typescript
/** @sealed */
protected sealedMethod(): string;
```

<a id="sealedmethod-returns"></a>

##### Returns

A string!

**Return type**: string

<a id="testabstractclass-virtualmethod-method"></a>

#### virtualMethod

A test `@virtual` method.

<a id="virtualmethod-signature"></a>

##### Signature

```typescript
/** @virtual */
protected virtualMethod(): number;
```

<a id="virtualmethod-returns"></a>

##### Returns

A number!

**Return type**: number

<a id="testclass-class"></a>

## TestClass

Test class

<a id="testclass-signature"></a>

### Signature

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> extends TestAbstractClass
```

**Extends**: [TestAbstractClass](docs/test-suite-a#testabstractclass-class)

#### Type Parameters

| Parameter | Description |
| - | - |
| TTypeParameterA | A type parameter |
| TTypeParameterB | Another type parameter |

<a id="testclass-remarks"></a>

### Remarks

Here are some remarks about the class

### Constructors

| Constructor | Description |
| - | - |
| [(constructor)(privateProperty, protectedProperty, testClassProperty, testClassEventProperty)](docs/test-suite-a#testclass-_constructor_-constructor) | Test class constructor |

### Static Properties

| Property | Type | Description |
| - | - | - |
| [testClassStaticProperty](docs/test-suite-a#testclass-testclassstaticproperty-property) | (foo: number) => string | Test static class property |

### Static Methods

| Method | Return Type | Description |
| - | - | - |
| [testClassStaticMethod(foo)](docs/test-suite-a#testclass-testclassstaticmethod-method) | string | Test class static method |

### Events

| Property | Modifiers | Type | Description |
| - | - | - | - |
| [testClassEventProperty](docs/test-suite-a#testclass-testclasseventproperty-property) | `readonly` | () => void | Test class event property |

### Properties

| Property | Modifiers | Type | Description |
| - | - | - | - |
| [abstractPropertyGetter](docs/test-suite-a#testclass-abstractpropertygetter-property) | `readonly` | [TestMappedType](docs/test-suite-a#testmappedtype-typealias) | A test abstract getter property. |
| [testClassGetterProperty](docs/test-suite-a#testclass-testclassgetterproperty-property) | `virtual` | number | Test class property with both a getter and a setter. |
| [testClassProperty](docs/test-suite-a#testclass-testclassproperty-property) | `readonly` | TTypeParameterB | Test class property |

### Methods

| Method | Modifiers | Return Type | Description |
| - | - | - | - |
| [publicAbstractMethod()](docs/test-suite-a#testclass-publicabstractmethod-method) | | void | A test public abstract method. |
| [testClassMethod(input)](docs/test-suite-a#testclass-testclassmethod-method) | `sealed` | TTypeParameterA | Test class method |
| [virtualMethod()](docs/test-suite-a#testclass-virtualmethod-method) | | number | Overrides [virtualMethod()](docs/test-suite-a#testabstractclass-virtualmethod-method). |

### Constructor Details

<a id="testclass-_constructor_-constructor"></a>

#### (constructor)

Test class constructor

<a id="_constructor_-signature"></a>

##### Signature

```typescript
constructor(privateProperty: number, protectedProperty: TestEnum, testClassProperty: TTypeParameterB, testClassEventProperty: () => void);
```

<a id="_constructor_-remarks"></a>

##### Remarks

Here are some remarks about the constructor

<a id="_constructor_-parameters"></a>

##### Parameters

| Parameter | Type | Description |
| - | - | - |
| privateProperty | number | See [TestAbstractClass](docs/test-suite-a#testabstractclass-class)'s constructor. |
| protectedProperty | [TestEnum](docs/test-suite-a#testenum-enum) | <p>Some notes about the parameter.</p><p>See <a href="docs/test-suite-a#testabstractclass-protectedproperty-property">protectedProperty</a>.</p> |
| testClassProperty | TTypeParameterB | See [testClassProperty](docs/test-suite-a#testclass-testclassproperty-property). |
| testClassEventProperty | () => void | See [testClassEventProperty](docs/test-suite-a#testclass-testclasseventproperty-property). |

### Event Details

<a id="testclass-testclasseventproperty-property"></a>

#### testClassEventProperty

Test class event property

<a id="testclasseventproperty-signature"></a>

##### Signature

```typescript
readonly testClassEventProperty: () => void;
```

**Type**: () => void

<a id="testclasseventproperty-remarks"></a>

##### Remarks

Here are some remarks about the property

### Property Details

<a id="testclass-abstractpropertygetter-property"></a>

#### abstractPropertyGetter

A test abstract getter property.

<a id="abstractpropertygetter-signature"></a>

##### Signature

```typescript
get abstractPropertyGetter(): TestMappedType;
```

**Type**: [TestMappedType](docs/test-suite-a#testmappedtype-typealias)

<a id="testclass-testclassgetterproperty-property"></a>

#### testClassGetterProperty

Test class property with both a getter and a setter.

<a id="testclassgetterproperty-signature"></a>

##### Signature

```typescript
/** @virtual */
get testClassGetterProperty(): number;

set testClassGetterProperty(newValue: number);
```

**Type**: number

<a id="testclassgetterproperty-remarks"></a>

##### Remarks

Here are some remarks about the getter-only property

<a id="testclass-testclassproperty-property"></a>

#### testClassProperty

Test class property

<a id="testclassproperty-signature"></a>

##### Signature

```typescript
readonly testClassProperty: TTypeParameterB;
```

**Type**: TTypeParameterB

<a id="testclassproperty-remarks"></a>

##### Remarks

Here are some remarks about the property

<a id="testclass-testclassstaticproperty-property"></a>

#### testClassStaticProperty

Test static class property

<a id="testclassstaticproperty-signature"></a>

##### Signature

```typescript
static testClassStaticProperty: (foo: number) => string;
```

**Type**: (foo: number) => string

### Method Details

<a id="testclass-publicabstractmethod-method"></a>

#### publicAbstractMethod

A test public abstract method.

<a id="publicabstractmethod-signature"></a>

##### Signature

```typescript
publicAbstractMethod(): void;
```

<a id="testclass-testclassmethod-method"></a>

#### testClassMethod

Test class method

<a id="testclassmethod-signature"></a>

##### Signature

```typescript
/** @sealed */
testClassMethod(input: TTypeParameterA): TTypeParameterA;
```

<a id="testclassmethod-remarks"></a>

##### Remarks

Here are some remarks about the method

<a id="testclassmethod-parameters"></a>

##### Parameters

| Parameter | Type | Description |
| - | - | - |
| input | TTypeParameterA | |

<a id="testclassmethod-returns"></a>

##### Returns

**Return type**: TTypeParameterA

<a id="testclassmethod-throws"></a>

##### Throws

Some sort of error in 1 case.

Some other sort of error in another case. For example, a case where some thing happens.

<a id="testclass-testclassstaticmethod-method"></a>

#### testClassStaticMethod

Test class static method

<a id="testclassstaticmethod-signature"></a>

##### Signature

```typescript
static testClassStaticMethod(foo: number): string;
```

<a id="testclassstaticmethod-parameters"></a>

##### Parameters

| Parameter | Type | Description |
| - | - | - |
| foo | number | Some number |

<a id="testclassstaticmethod-returns"></a>

##### Returns

- Some string

**Return type**: string

<a id="testclass-virtualmethod-method"></a>

#### virtualMethod

Overrides [virtualMethod()](docs/test-suite-a#testabstractclass-virtualmethod-method).

<a id="virtualmethod-signature"></a>

##### Signature

```typescript
/** @override */
protected virtualMethod(): number;
```

<a id="virtualmethod-returns"></a>

##### Returns

**Return type**: number

<a id="testclass-see-also"></a>

### See Also

[TestAbstractClass](docs/test-suite-a#testabstractclass-class)

# Enumeration Details

<a id="testenum-enum"></a>

## TestEnum

Test Enum

<a id="testenum-signature"></a>

### Signature

```typescript
export declare enum TestEnum
```

<a id="testenum-remarks"></a>

### Remarks

Here are some remarks about the enum

<a id="testenum-examples"></a>

### Examples

<a id="testenum-example1"></a>

#### Example 1

Some example

```typescript
const foo = TestEnum.TestEnumValue1
```

<a id="testenum-example2"></a>

#### Example 2

Another example

```ts
const bar = TestEnum.TestEnumValue2
```

### Flags

| Flag | Description |
| - | - |
| [TestEnumValue1](docs/test-suite-a#testenum-testenumvalue1-enummember) | Test enum value 1 (string) |
| [TestEnumValue2](docs/test-suite-a#testenum-testenumvalue2-enummember) | Test enum value 2 (number) |
| [TestEnumValue3](docs/test-suite-a#testenum-testenumvalue3-enummember) | Test enum value 3 (default) |

<a id="testenum-testenumvalue1-enummember"></a>

#### TestEnumValue1

Test enum value 1 (string)

<a id="testenumvalue1-signature"></a>

##### Signature

```typescript
TestEnumValue1 = "test-enum-value-1"
```

<a id="testenumvalue1-remarks"></a>

##### Remarks

Here are some remarks about the enum value

<a id="testenum-testenumvalue2-enummember"></a>

#### TestEnumValue2

Test enum value 2 (number)

<a id="testenumvalue2-signature"></a>

##### Signature

```typescript
TestEnumValue2 = 3
```

<a id="testenumvalue2-remarks"></a>

##### Remarks

Here are some remarks about the enum value

<a id="testenum-testenumvalue3-enummember"></a>

#### TestEnumValue3

Test enum value 3 (default)

<a id="testenumvalue3-signature"></a>

##### Signature

```typescript
TestEnumValue3 = 4
```

<a id="testenumvalue3-remarks"></a>

##### Remarks

Here are some remarks about the enum value

# Type Details

<a id="testmappedtype-typealias"></a>

## TestMappedType

Test Mapped Type, using [TestEnum](docs/test-suite-a#testenum-enum)

<a id="testmappedtype-signature"></a>

### Signature

```typescript
export type TestMappedType = {
    [K in TestEnum]: boolean;
};
```

<a id="testmappedtype-remarks"></a>

### Remarks

Here are some remarks about the mapped type

<a id="typealias-typealias"></a>

## TypeAlias

Test Type-Alias

<a id="typealias-signature"></a>

### Signature

```typescript
export type TypeAlias = string;
```

<a id="typealias-remarks"></a>

### Remarks

Here are some remarks about the type alias

# Function Details

<a id="testfunctionreturninginlinetype-function"></a>

## testFunctionReturningInlineType

Test function that returns an inline type

<a id="testfunctionreturninginlinetype-signature"></a>

### Signature

```typescript
export declare function testFunctionReturningInlineType(): {
    foo: number;
    bar: TestEnum;
};
```

<a id="testfunctionreturninginlinetype-returns"></a>

### Returns

An inline type

**Return type**: {     foo: number;     bar: [TestEnum](docs/test-suite-a#testenum-enum); }

<a id="testfunctionreturningintersectiontype-function"></a>

## testFunctionReturningIntersectionType

Test function that returns an inline type

**WARNING: This API is deprecated and will be removed in a future release.**

This is a test deprecation notice. Here is a [link](docs/test-suite-a#testfunctionreturninguniontype-function) to something else!

<a id="testfunctionreturningintersectiontype-signature"></a>

### Signature

```typescript
export declare function testFunctionReturningIntersectionType(): TestEmptyInterface & TestInterfaceWithTypeParameter<number>;
```

<a id="testfunctionreturningintersectiontype-returns"></a>

### Returns

an intersection type

**Return type**: [TestEmptyInterface](docs/test-suite-a#testemptyinterface-interface) & [TestInterfaceWithTypeParameter](docs/test-suite-a#testinterfacewithtypeparameter-interface)\<number>

<a id="testfunctionreturninguniontype-function"></a>

## testFunctionReturningUnionType

Test function that returns an inline type

<a id="testfunctionreturninguniontype-signature"></a>

### Signature

```typescript
export declare function testFunctionReturningUnionType(): string | TestInterface;
```

<a id="testfunctionreturninguniontype-returns"></a>

### Returns

A union type

**Return type**: string | [TestInterface](docs/test-suite-a#testinterface-interface)

# Variable Details

<a id="testconst-variable"></a>

## testConst

Test Constant

**WARNING: This API is provided as a beta preview and may change without notice. Use at your own risk.**

<a id="testconst-signature"></a>

### Signature

```typescript
testConst = 42
```

<a id="testconst-remarks"></a>

### Remarks

Here are some remarks about the variable

<a id="testconstwithemptydeprecatedblock-variable"></a>

## testConstWithEmptyDeprecatedBlock

I have a `@deprecated` tag with an empty comment block.

**WARNING: This API is deprecated and will be removed in a future release.**

<a id="testconstwithemptydeprecatedblock-signature"></a>

### Signature

```typescript
testConstWithEmptyDeprecatedBlock: string
```

**Type**: string

# Namespace Details

<a id="testbetanamespace-namespace"></a>

## TestBetaNamespace

A namespace tagged as `@beta`.

**WARNING: This API is provided as a beta preview and may change without notice. Use at your own risk.**

<a id="testbetanamespace-signature"></a>

### Signature

```typescript
export declare namespace TestBetaNamespace
```

<a id="testbetanamespace-remarks"></a>

### Remarks

Tests release level inheritance.

### Variables

| Variable | Alerts | Modifiers | Type | Description |
| - | - | - | - | - |
| [betaMember](docs/test-suite-a#testbetanamespace-betamember-variable) | `Beta` | `readonly` | | |
| [publicMember](docs/test-suite-a#testbetanamespace-publicmember-variable) | `Beta` | `readonly` | | |

### Variable Details

<a id="testbetanamespace-betamember-variable"></a>

#### betaMember

**WARNING: This API is provided as a beta preview and may change without notice. Use at your own risk.**

<a id="betamember-signature"></a>

##### Signature

```typescript
betaMember = "beta"
```

<a id="testbetanamespace-publicmember-variable"></a>

#### publicMember

**WARNING: This API is provided as a beta preview and may change without notice. Use at your own risk.**

<a id="publicmember-signature"></a>

##### Signature

```typescript
publicMember = "public"
```

<a id="testmodule-namespace"></a>

## TestModule

### Variables

| Variable | Modifiers | Type | Description |
| - | - | - | - |
| [foo](docs/test-suite-a#testmodule-foo-variable) | `readonly` | | Test constant in module. |

### Variable Details

<a id="testmodule-foo-variable"></a>

#### foo

Test constant in module.

<a id="foo-signature"></a>

##### Signature

```typescript
foo = 2
```

<a id="testnamespace-namespace"></a>

## TestNamespace

Test Namespace

<a id="testnamespace-signature"></a>

### Signature

```typescript
export declare namespace TestNamespace
```

<a id="testnamespace-remarks"></a>

### Remarks

Here are some remarks about the namespace

<a id="testnamespace-examples"></a>

### Examples

<a id="testnamespace-example1"></a>

#### Example: TypeScript Example

```typescript
const foo: Foo = {
	bar: "Hello world!";
	baz = 42;
};
```

<a id="testnamespace-example2"></a>

#### Example: JavaScript Example

```javascript
const foo = {
	bar: "Hello world!";
	baz = 42;
};
```

### Classes

| Class | Description |
| - | - |
| [TestClass](docs/test-suite-a#testnamespace-testclass-class) | Test class |

### Enumerations

| Enum | Description |
| - | - |
| [TestEnum](docs/test-suite-a#testnamespace-testenum-enum) | Test Enum |

### Types

| TypeAlias | Description |
| - | - |
| [TestTypeAlias](docs/test-suite-a#testnamespace-testtypealias-typealias) | Test Type-Alias |

### Functions

| Function | Return Type | Description |
| - | - | - |
| [testFunction(testParameter)](docs/test-suite-a#testnamespace-testfunction-function) | number | Test function |

### Variables

| Variable | Alerts | Modifiers | Type | Description |
| - | - | - | - | - |
| [TestConst](docs/test-suite-a#testnamespace-testconst-variable) | `Beta` | `readonly` | | Test Constant |

### Namespaces

| Namespace | Description |
| - | - |
| [TestSubNamespace](docs/test-suite-a#testnamespace-testsubnamespace-namespace) | Test sub-namespace |

### Class Details

<a id="testnamespace-testclass-class"></a>

#### TestClass

Test class

<a id="testclass-signature"></a>

##### Signature

```typescript
class TestClass
```

##### Constructors

| Constructor | Description |
| - | - |
| [(constructor)(testClassProperty)](docs/test-suite-a#testnamespace-testclass-_constructor_-constructor) | Test class constructor |

##### Properties

| Property | Modifiers | Type | Description |
| - | - | - | - |
| [testClassProperty](docs/test-suite-a#testnamespace-testclass-testclassproperty-property) | `readonly` | string | Test interface property |

##### Methods

| Method | Return Type | Description |
| - | - | - |
| [testClassMethod(testParameter)](docs/test-suite-a#testnamespace-testclass-testclassmethod-method) | Promise\<string> | Test class method |

##### Constructor Details

<a id="testnamespace-testclass-_constructor_-constructor"></a>

###### (constructor)

Test class constructor

<a id="_constructor_-signature"></a>\
**Signature**

```typescript
constructor(testClassProperty: string);
```

<a id="_constructor_-parameters"></a>\
**Parameters**

| Parameter | Type | Description |
| - | - | - |
| testClassProperty | string | See [testClassProperty](docs/test-suite-a#testclass-testclassproperty-property) |

##### Property Details

<a id="testnamespace-testclass-testclassproperty-property"></a>

###### testClassProperty

Test interface property

<a id="testclassproperty-signature"></a>\
**Signature**

```typescript
readonly testClassProperty: string;
```

**Type**: string

##### Method Details

<a id="testnamespace-testclass-testclassmethod-method"></a>

###### testClassMethod

Test class method

<a id="testclassmethod-signature"></a>\
**Signature**

```typescript
testClassMethod(testParameter: string): Promise<string>;
```

<a id="testclassmethod-parameters"></a>\
**Parameters**

| Parameter | Type | Description |
| - | - | - |
| testParameter | string | A string |

<a id="testclassmethod-returns"></a>\
**Returns**

A Promise

**Return type**: Promise\<string>

<a id="testclassmethod-throws"></a>\
**Throws**

An Error when something happens for which an error should be thrown. Except in the cases where another kind of error is thrown. We don't throw this error in those cases.

A different kind of error when a thing happens, but not when the first kind of error is thrown instead.

😁

### Enumeration Details

<a id="testnamespace-testenum-enum"></a>

#### TestEnum

Test Enum

<a id="testenum-signature"></a>

##### Signature

```typescript
enum TestEnum
```

##### Flags

| Flag | Description |
| - | - |
| [TestEnumValue1](docs/test-suite-a#testnamespace-testenum-testenumvalue1-enummember) | Test enum value 1 |
| [TestEnumValue2](docs/test-suite-a#testnamespace-testenum-testenumvalue2-enummember) | Test enum value 2 |

<a id="testnamespace-testenum-testenumvalue1-enummember"></a>

###### TestEnumValue1

Test enum value 1

<a id="testenumvalue1-signature"></a>\
**Signature**

```typescript
TestEnumValue1 = 0
```

<a id="testnamespace-testenum-testenumvalue2-enummember"></a>

###### TestEnumValue2

Test enum value 2

<a id="testenumvalue2-signature"></a>\
**Signature**

```typescript
TestEnumValue2 = 1
```

### Type Details

<a id="testnamespace-testtypealias-typealias"></a>

#### TestTypeAlias

Test Type-Alias

<a id="testtypealias-signature"></a>

##### Signature

```typescript
type TestTypeAlias = boolean;
```

### Function Details

<a id="testnamespace-testfunction-function"></a>

#### testFunction

Test function

<a id="testfunction-signature"></a>

##### Signature

```typescript
function testFunction(testParameter: number): number;
```

<a id="testfunction-parameters"></a>

##### Parameters

| Parameter | Type | Description |
| - | - | - |
| testParameter | number | |

<a id="testfunction-returns"></a>

##### Returns

A number

**Return type**: number

<a id="testfunction-throws"></a>

##### Throws

An Error

### Variable Details

<a id="testnamespace-testconst-variable"></a>

#### TestConst

Test Constant

**WARNING: This API is provided as a beta preview and may change without notice. Use at your own risk.**

<a id="testconst-signature"></a>

##### Signature

```typescript
TestConst = "Hello world!"
```

### Namespace Details

<a id="testnamespace-testsubnamespace-namespace"></a>

#### TestSubNamespace

Test sub-namespace

<a id="testsubnamespace-signature"></a>

##### Signature

```typescript
namespace TestSubNamespace
```
