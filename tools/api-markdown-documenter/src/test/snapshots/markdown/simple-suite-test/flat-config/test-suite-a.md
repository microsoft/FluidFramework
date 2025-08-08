[Packages](docs/) > [test-suite-a](docs/test-suite-a)

Test package

<h1 id="test-suite-a-remarks">Remarks</h1>

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

<h1 id="test-suite-a-example">Example</h1>

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

<h2 id="testemptyinterface-interface">TestEmptyInterface</h2>

An empty interface

<h3 id="testemptyinterface-signature">Signature</h3>

```typescript
export interface TestEmptyInterface
```

<h2 id="testinterface-interface">TestInterface</h2>

Test interface

<h3 id="testinterface-signature">Signature</h3>

```typescript
export interface TestInterface
```

<h3 id="testinterface-remarks">Remarks</h3>

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

<h4 id="testinterface-_new_-constructsignature">new (): TestInterface</h4>

Test construct signature.

<h5 id="_new_-signature">Signature</h5>

```typescript
new (): TestInterface;
```

<h5 id="_new_-returns">Returns</h5>

**Return type**: [TestInterface](docs/test-suite-a#testinterface-interface)

### Event Details

<h4 id="testinterface-testclasseventproperty-propertysignature">testClassEventProperty</h4>

Test interface event property

<h5 id="testclasseventproperty-signature">Signature</h5>

```typescript
readonly testClassEventProperty: () => void;
```

**Type**: () => void

<h5 id="testclasseventproperty-remarks">Remarks</h5>

Here are some remarks about the event property

### Property Details

<h4 id="testinterface-getterproperty-property">getterProperty</h4>

A test getter-only interface property.

<h5 id="getterproperty-signature">Signature</h5>

```typescript
get getterProperty(): boolean;
```

**Type**: boolean

<h4 id="testinterface-propertywithbadinheritdoctarget-propertysignature">propertyWithBadInheritDocTarget</h4>

<h5 id="propertywithbadinheritdoctarget-signature">Signature</h5>

```typescript
propertyWithBadInheritDocTarget: boolean;
```

**Type**: boolean

<h4 id="testinterface-setterproperty-property">setterProperty</h4>

A test property with a getter and a setter.

<h5 id="setterproperty-signature">Signature</h5>

```typescript
get setterProperty(): boolean;

set setterProperty(newValue: boolean);
```

**Type**: boolean

<h4 id="testinterface-testinterfaceproperty-propertysignature">testInterfaceProperty</h4>

Test interface property

<h5 id="testinterfaceproperty-signature">Signature</h5>

```typescript
testInterfaceProperty: number;
```

**Type**: number

<h5 id="testinterfaceproperty-remarks">Remarks</h5>

Here are some remarks about the property

<h4 id="testinterface-testoptionalinterfaceproperty-propertysignature">testOptionalInterfaceProperty</h4>

Test optional property

<h5 id="testoptionalinterfaceproperty-signature">Signature</h5>

```typescript
testOptionalInterfaceProperty?: number;
```

**Type**: number

### Method Details

<h4 id="testinterface-testinterfacemethod-methodsignature">testInterfaceMethod</h4>

Test interface method

<h5 id="testinterfacemethod-signature">Signature</h5>

```typescript
testInterfaceMethod(): void;
```

<h5 id="testinterfacemethod-remarks">Remarks</h5>

Here are some remarks about the method

### Call Signature Details

<h4 id="testinterface-_call_-callsignature">(event: 'testCallSignature', listener: (input: unknown) => void): any</h4>

Test interface event call signature

<h5 id="_call_-signature">Signature</h5>

```typescript
(event: 'testCallSignature', listener: (input: unknown) => void): any;
```

<h5 id="_call_-remarks">Remarks</h5>

Here are some remarks about the event call signature

<h4 id="testinterface-_call__1-callsignature">(event: 'anotherTestCallSignature', listener: (input: number) => string): number</h4>

Another example call signature

<h5 id="_call__1-signature">Signature</h5>

```typescript
(event: 'anotherTestCallSignature', listener: (input: number) => string): number;
```

<h5 id="_call__1-remarks">Remarks</h5>

Here are some remarks about the event call signature

<h3 id="testinterface-see-also">See Also</h3>

[testInterfaceMethod()](docs/test-suite-a#testinterface-testinterfacemethod-methodsignature)

[testInterfaceProperty](docs/test-suite-a#testinterface-testinterfaceproperty-propertysignature)

[testOptionalInterfaceProperty](docs/test-suite-a#testinterface-testoptionalinterfaceproperty-propertysignature)

[testClassEventProperty](docs/test-suite-a#testinterface-testclasseventproperty-propertysignature)

<h2 id="testinterfaceextendingotherinterfaces-interface">TestInterfaceExtendingOtherInterfaces</h2>

Test interface that extends other interfaces

<h3 id="testinterfaceextendingotherinterfaces-signature">Signature</h3>

```typescript
export interface TestInterfaceExtendingOtherInterfaces extends TestInterface, TestMappedType, TestInterfaceWithTypeParameter<number>
```

**Extends**: [TestInterface](docs/test-suite-a#testinterface-interface), [TestMappedType](docs/test-suite-a#testmappedtype-typealias), [TestInterfaceWithTypeParameter](docs/test-suite-a#testinterfacewithtypeparameter-interface)\<number>

<h3 id="testinterfaceextendingotherinterfaces-remarks">Remarks</h3>

Here are some remarks about the interface

### Methods

| Method | Return Type | Description |
| - | - | - |
| [testMethod(input)](docs/test-suite-a#testinterfaceextendingotherinterfaces-testmethod-methodsignature) | number | Test interface method accepting a string and returning a number. |

### Method Details

<h4 id="testinterfaceextendingotherinterfaces-testmethod-methodsignature">testMethod</h4>

Test interface method accepting a string and returning a number.

<h5 id="testmethod-signature">Signature</h5>

```typescript
testMethod(input: string): number;
```

<h5 id="testmethod-remarks">Remarks</h5>

Here are some remarks about the method

<h5 id="testmethod-parameters">Parameters</h5>

| Parameter | Type | Description |
| - | - | - |
| input | string | A string |

<h5 id="testmethod-returns">Returns</h5>

A number

**Return type**: number

<h3 id="testinterfaceextendingotherinterfaces-see-also">See Also</h3>

- [TestInterface](docs/test-suite-a#testinterface-interface)
- [TestInterfaceWithTypeParameter](docs/test-suite-a#testinterfacewithtypeparameter-interface)
- [TestMappedType](docs/test-suite-a#testmappedtype-typealias)

<h2 id="testinterfacewithindexsignature-interface">TestInterfaceWithIndexSignature</h2>

An interface with an index signature.

<h3 id="testinterfacewithindexsignature-signature">Signature</h3>

```typescript
export interface TestInterfaceWithIndexSignature
```

### Index Signatures

| IndexSignature | Description |
| - | - |
| [\[foo: number\]: { bar: string; }](docs/test-suite-a#testinterfacewithindexsignature-_indexer_-indexsignature) | Test index signature. |

### Index Signature Details

<h4 id="testinterfacewithindexsignature-_indexer_-indexsignature">[foo: number]: { bar: string; }</h4>

Test index signature.

<h5 id="_indexer_-signature">Signature</h5>

```typescript
[foo: number]: {
        bar: string;
    };
```

<h2 id="testinterfacewithtypeparameter-interface">TestInterfaceWithTypeParameter</h2>

Test interface with generic type parameter

<h3 id="testinterfacewithtypeparameter-signature">Signature</h3>

```typescript
export interface TestInterfaceWithTypeParameter<T>
```

#### Type Parameters

| Parameter | Description |
| - | - |
| T | A type parameter |

<h3 id="testinterfacewithtypeparameter-remarks">Remarks</h3>

Here are some remarks about the interface

### Properties

| Property | Type | Description |
| - | - | - |
| [testProperty](docs/test-suite-a#testinterfacewithtypeparameter-testproperty-propertysignature) | T | A test interface property using generic type parameter |

### Property Details

<h4 id="testinterfacewithtypeparameter-testproperty-propertysignature">testProperty</h4>

A test interface property using generic type parameter

<h5 id="testproperty-signature">Signature</h5>

```typescript
testProperty: T;
```

**Type**: T

<h5 id="testproperty-remarks">Remarks</h5>

Here are some remarks about the property

# Class Details

<h2 id="testabstractclass-class">TestAbstractClass</h2>

A test abstract class.

<h3 id="testabstractclass-signature">Signature</h3>

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

<h4 id="testabstractclass-_constructor_-constructor">(constructor)</h4>

This is a _{@customTag constructor}_.

<h5 id="_constructor_-signature">Signature</h5>

```typescript
protected constructor(privateProperty: number, protectedProperty: TestEnum);
```

<h5 id="_constructor_-parameters">Parameters</h5>

| Parameter | Type | Description |
| - | - | - |
| privateProperty | number | |
| protectedProperty | [TestEnum](docs/test-suite-a#testenum-enum) | |

### Property Details

<h4 id="testabstractclass-abstractpropertygetter-property">abstractPropertyGetter</h4>

A test abstract getter property.

@escapedTag

<h5 id="abstractpropertygetter-signature">Signature</h5>

```typescript
abstract get abstractPropertyGetter(): TestMappedType;
```

**Type**: [TestMappedType](docs/test-suite-a#testmappedtype-typealias)

<h4 id="testabstractclass-protectedproperty-property">protectedProperty</h4>

A test protected property.

<h5 id="protectedproperty-signature">Signature</h5>

```typescript
protected readonly protectedProperty: TestEnum;
```

**Type**: [TestEnum](docs/test-suite-a#testenum-enum)

### Method Details

<h4 id="testabstractclass-publicabstractmethod-method">publicAbstractMethod</h4>

A test public abstract method.

<h5 id="publicabstractmethod-signature">Signature</h5>

```typescript
abstract publicAbstractMethod(): void;
```

<h4 id="testabstractclass-sealedmethod-method">sealedMethod</h4>

A test `@sealed` method.

<h5 id="sealedmethod-signature">Signature</h5>

```typescript
/** @sealed */
protected sealedMethod(): string;
```

<h5 id="sealedmethod-returns">Returns</h5>

A string!

**Return type**: string

<h4 id="testabstractclass-virtualmethod-method">virtualMethod</h4>

A test `@virtual` method.

<h5 id="virtualmethod-signature">Signature</h5>

```typescript
/** @virtual */
protected virtualMethod(): number;
```

<h5 id="virtualmethod-returns">Returns</h5>

A number!

**Return type**: number

<h2 id="testclass-class">TestClass</h2>

Test class

<h3 id="testclass-signature">Signature</h3>

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> extends TestAbstractClass
```

**Extends**: [TestAbstractClass](docs/test-suite-a#testabstractclass-class)

#### Type Parameters

| Parameter | Description |
| - | - |
| TTypeParameterA | A type parameter |
| TTypeParameterB | Another type parameter |

<h3 id="testclass-remarks">Remarks</h3>

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

<h4 id="testclass-_constructor_-constructor">(constructor)</h4>

Test class constructor

<h5 id="_constructor_-signature">Signature</h5>

```typescript
constructor(privateProperty: number, protectedProperty: TestEnum, testClassProperty: TTypeParameterB, testClassEventProperty: () => void);
```

<h5 id="_constructor_-remarks">Remarks</h5>

Here are some remarks about the constructor

<h5 id="_constructor_-parameters">Parameters</h5>

| Parameter | Type | Description |
| - | - | - |
| privateProperty | number | See [TestAbstractClass](docs/test-suite-a#testabstractclass-class)'s constructor. |
| protectedProperty | [TestEnum](docs/test-suite-a#testenum-enum) | <p>Some notes about the parameter.</p><p>See <a href="docs/test-suite-a#testabstractclass-protectedproperty-property">protectedProperty</a>.</p> |
| testClassProperty | TTypeParameterB | See [testClassProperty](docs/test-suite-a#testclass-testclassproperty-property). |
| testClassEventProperty | () => void | See [testClassEventProperty](docs/test-suite-a#testclass-testclasseventproperty-property). |

### Event Details

<h4 id="testclass-testclasseventproperty-property">testClassEventProperty</h4>

Test class event property

<h5 id="testclasseventproperty-signature">Signature</h5>

```typescript
readonly testClassEventProperty: () => void;
```

**Type**: () => void

<h5 id="testclasseventproperty-remarks">Remarks</h5>

Here are some remarks about the property

### Property Details

<h4 id="testclass-abstractpropertygetter-property">abstractPropertyGetter</h4>

A test abstract getter property.

<h5 id="abstractpropertygetter-signature">Signature</h5>

```typescript
get abstractPropertyGetter(): TestMappedType;
```

**Type**: [TestMappedType](docs/test-suite-a#testmappedtype-typealias)

<h4 id="testclass-testclassgetterproperty-property">testClassGetterProperty</h4>

Test class property with both a getter and a setter.

<h5 id="testclassgetterproperty-signature">Signature</h5>

```typescript
/** @virtual */
get testClassGetterProperty(): number;

set testClassGetterProperty(newValue: number);
```

**Type**: number

<h5 id="testclassgetterproperty-remarks">Remarks</h5>

Here are some remarks about the getter-only property

<h4 id="testclass-testclassproperty-property">testClassProperty</h4>

Test class property

<h5 id="testclassproperty-signature">Signature</h5>

```typescript
readonly testClassProperty: TTypeParameterB;
```

**Type**: TTypeParameterB

<h5 id="testclassproperty-remarks">Remarks</h5>

Here are some remarks about the property

<h4 id="testclass-testclassstaticproperty-property">testClassStaticProperty</h4>

Test static class property

<h5 id="testclassstaticproperty-signature">Signature</h5>

```typescript
static testClassStaticProperty: (foo: number) => string;
```

**Type**: (foo: number) => string

### Method Details

<h4 id="testclass-publicabstractmethod-method">publicAbstractMethod</h4>

A test public abstract method.

<h5 id="publicabstractmethod-signature">Signature</h5>

```typescript
publicAbstractMethod(): void;
```

<h4 id="testclass-testclassmethod-method">testClassMethod</h4>

Test class method

<h5 id="testclassmethod-signature">Signature</h5>

```typescript
/** @sealed */
testClassMethod(input: TTypeParameterA): TTypeParameterA;
```

<h5 id="testclassmethod-remarks">Remarks</h5>

Here are some remarks about the method

<h5 id="testclassmethod-parameters">Parameters</h5>

| Parameter | Type | Description |
| - | - | - |
| input | TTypeParameterA | |

<h5 id="testclassmethod-returns">Returns</h5>

**Return type**: TTypeParameterA

<h5 id="testclassmethod-throws">Throws</h5>

Some sort of error in 1 case.

Some other sort of error in another case. For example, a case where some thing happens.

<h4 id="testclass-testclassstaticmethod-method">testClassStaticMethod</h4>

Test class static method

<h5 id="testclassstaticmethod-signature">Signature</h5>

```typescript
static testClassStaticMethod(foo: number): string;
```

<h5 id="testclassstaticmethod-parameters">Parameters</h5>

| Parameter | Type | Description |
| - | - | - |
| foo | number | Some number |

<h5 id="testclassstaticmethod-returns">Returns</h5>

- Some string

**Return type**: string

<h4 id="testclass-virtualmethod-method">virtualMethod</h4>

Overrides [virtualMethod()](docs/test-suite-a#testabstractclass-virtualmethod-method).

<h5 id="virtualmethod-signature">Signature</h5>

```typescript
/** @override */
protected virtualMethod(): number;
```

<h5 id="virtualmethod-returns">Returns</h5>

**Return type**: number

<h3 id="testclass-see-also">See Also</h3>

[TestAbstractClass](docs/test-suite-a#testabstractclass-class)

# Enumeration Details

<h2 id="testenum-enum">TestEnum</h2>

Test Enum

<h3 id="testenum-signature">Signature</h3>

```typescript
export declare enum TestEnum
```

<h3 id="testenum-remarks">Remarks</h3>

Here are some remarks about the enum

<h3 id="testenum-examples">Examples</h3>

<h4 id="testenum-example1">Example 1</h4>

Some example

```typescript
const foo = TestEnum.TestEnumValue1
```

<h4 id="testenum-example2">Example 2</h4>

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

<h4 id="testenum-testenumvalue1-enummember">TestEnumValue1</h4>

Test enum value 1 (string)

<h5 id="testenumvalue1-signature">Signature</h5>

```typescript
TestEnumValue1 = "test-enum-value-1"
```

<h5 id="testenumvalue1-remarks">Remarks</h5>

Here are some remarks about the enum value

<h4 id="testenum-testenumvalue2-enummember">TestEnumValue2</h4>

Test enum value 2 (number)

<h5 id="testenumvalue2-signature">Signature</h5>

```typescript
TestEnumValue2 = 3
```

<h5 id="testenumvalue2-remarks">Remarks</h5>

Here are some remarks about the enum value

<h4 id="testenum-testenumvalue3-enummember">TestEnumValue3</h4>

Test enum value 3 (default)

<h5 id="testenumvalue3-signature">Signature</h5>

```typescript
TestEnumValue3 = 4
```

<h5 id="testenumvalue3-remarks">Remarks</h5>

Here are some remarks about the enum value

# Type Details

<h2 id="testmappedtype-typealias">TestMappedType</h2>

Test Mapped Type, using [TestEnum](docs/test-suite-a#testenum-enum)

<h3 id="testmappedtype-signature">Signature</h3>

```typescript
export type TestMappedType = {
    [K in TestEnum]: boolean;
};
```

<h3 id="testmappedtype-remarks">Remarks</h3>

Here are some remarks about the mapped type

<h2 id="typealias-typealias">TypeAlias</h2>

Test Type-Alias

<h3 id="typealias-signature">Signature</h3>

```typescript
export type TypeAlias = string;
```

<h3 id="typealias-remarks">Remarks</h3>

Here are some remarks about the type alias

# Function Details

<h2 id="testfunctionreturninginlinetype-function">testFunctionReturningInlineType</h2>

Test function that returns an inline type

<h3 id="testfunctionreturninginlinetype-signature">Signature</h3>

```typescript
export declare function testFunctionReturningInlineType(): {
    foo: number;
    bar: TestEnum;
};
```

<h3 id="testfunctionreturninginlinetype-returns">Returns</h3>

An inline type

**Return type**: {     foo: number;     bar: [TestEnum](docs/test-suite-a#testenum-enum); }

<h2 id="testfunctionreturningintersectiontype-function">testFunctionReturningIntersectionType</h2>

Test function that returns an inline type

**WARNING: This API is deprecated and will be removed in a future release.**

This is a test deprecation notice. Here is a [link](docs/test-suite-a#testfunctionreturninguniontype-function) to something else!

<h3 id="testfunctionreturningintersectiontype-signature">Signature</h3>

```typescript
export declare function testFunctionReturningIntersectionType(): TestEmptyInterface & TestInterfaceWithTypeParameter<number>;
```

<h3 id="testfunctionreturningintersectiontype-returns">Returns</h3>

an intersection type

**Return type**: [TestEmptyInterface](docs/test-suite-a#testemptyinterface-interface) & [TestInterfaceWithTypeParameter](docs/test-suite-a#testinterfacewithtypeparameter-interface)\<number>

<h2 id="testfunctionreturninguniontype-function">testFunctionReturningUnionType</h2>

Test function that returns an inline type

<h3 id="testfunctionreturninguniontype-signature">Signature</h3>

```typescript
export declare function testFunctionReturningUnionType(): string | TestInterface;
```

<h3 id="testfunctionreturninguniontype-returns">Returns</h3>

A union type

**Return type**: string | [TestInterface](docs/test-suite-a#testinterface-interface)

# Variable Details

<h2 id="testconst-variable">testConst</h2>

Test Constant

**WARNING: This API is provided as a beta preview and may change without notice. Use at your own risk.**

<h3 id="testconst-signature">Signature</h3>

```typescript
testConst = 42
```

<h3 id="testconst-remarks">Remarks</h3>

Here are some remarks about the variable

<h2 id="testconstwithemptydeprecatedblock-variable">testConstWithEmptyDeprecatedBlock</h2>

I have a `@deprecated` tag with an empty comment block.

**WARNING: This API is deprecated and will be removed in a future release.**

<h3 id="testconstwithemptydeprecatedblock-signature">Signature</h3>

```typescript
testConstWithEmptyDeprecatedBlock: string
```

**Type**: string

# Namespace Details

<h2 id="testbetanamespace-namespace">TestBetaNamespace</h2>

A namespace tagged as `@beta`.

**WARNING: This API is provided as a beta preview and may change without notice. Use at your own risk.**

<h3 id="testbetanamespace-signature">Signature</h3>

```typescript
export declare namespace TestBetaNamespace
```

<h3 id="testbetanamespace-remarks">Remarks</h3>

Tests release level inheritance.

### Variables

| Variable | Alerts | Modifiers | Type | Description |
| - | - | - | - | - |
| [betaMember](docs/test-suite-a#testbetanamespace-betamember-variable) | `Beta` | `readonly` | | |
| [publicMember](docs/test-suite-a#testbetanamespace-publicmember-variable) | `Beta` | `readonly` | | |

### Variable Details

<h4 id="testbetanamespace-betamember-variable">betaMember</h4>

**WARNING: This API is provided as a beta preview and may change without notice. Use at your own risk.**

<h5 id="betamember-signature">Signature</h5>

```typescript
betaMember = "beta"
```

<h4 id="testbetanamespace-publicmember-variable">publicMember</h4>

**WARNING: This API is provided as a beta preview and may change without notice. Use at your own risk.**

<h5 id="publicmember-signature">Signature</h5>

```typescript
publicMember = "public"
```

<h2 id="testmodule-namespace">TestModule</h2>

### Variables

| Variable | Modifiers | Type | Description |
| - | - | - | - |
| [foo](docs/test-suite-a#testmodule-foo-variable) | `readonly` | | Test constant in module. |

### Variable Details

<h4 id="testmodule-foo-variable">foo</h4>

Test constant in module.

<h5 id="foo-signature">Signature</h5>

```typescript
foo = 2
```

<h2 id="testnamespace-namespace">TestNamespace</h2>

Test Namespace

<h3 id="testnamespace-signature">Signature</h3>

```typescript
export declare namespace TestNamespace
```

<h3 id="testnamespace-remarks">Remarks</h3>

Here are some remarks about the namespace

<h3 id="testnamespace-examples">Examples</h3>

<h4 id="testnamespace-example1">Example: TypeScript Example</h4>

```typescript
const foo: Foo = {
	bar: "Hello world!";
	baz = 42;
};
```

<h4 id="testnamespace-example2">Example: JavaScript Example</h4>

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

<h4 id="testnamespace-testclass-class">TestClass</h4>

Test class

<h5 id="testclass-signature">Signature</h5>

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

<h6 id="testnamespace-testclass-_constructor_-constructor">(constructor)</h6>

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

<h6 id="testnamespace-testclass-testclassproperty-property">testClassProperty</h6>

Test interface property

<a id="testclassproperty-signature"></a>\
**Signature**

```typescript
readonly testClassProperty: string;
```

**Type**: string

##### Method Details

<h6 id="testnamespace-testclass-testclassmethod-method">testClassMethod</h6>

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

<h4 id="testnamespace-testenum-enum">TestEnum</h4>

Test Enum

<h5 id="testenum-signature">Signature</h5>

```typescript
enum TestEnum
```

##### Flags

| Flag | Description |
| - | - |
| [TestEnumValue1](docs/test-suite-a#testnamespace-testenum-testenumvalue1-enummember) | Test enum value 1 |
| [TestEnumValue2](docs/test-suite-a#testnamespace-testenum-testenumvalue2-enummember) | Test enum value 2 |

<h6 id="testnamespace-testenum-testenumvalue1-enummember">TestEnumValue1</h6>

Test enum value 1

<a id="testenumvalue1-signature"></a>\
**Signature**

```typescript
TestEnumValue1 = 0
```

<h6 id="testnamespace-testenum-testenumvalue2-enummember">TestEnumValue2</h6>

Test enum value 2

<a id="testenumvalue2-signature"></a>\
**Signature**

```typescript
TestEnumValue2 = 1
```

### Type Details

<h4 id="testnamespace-testtypealias-typealias">TestTypeAlias</h4>

Test Type-Alias

<h5 id="testtypealias-signature">Signature</h5>

```typescript
type TestTypeAlias = boolean;
```

### Function Details

<h4 id="testnamespace-testfunction-function">testFunction</h4>

Test function

<h5 id="testfunction-signature">Signature</h5>

```typescript
function testFunction(testParameter: number): number;
```

<h5 id="testfunction-parameters">Parameters</h5>

| Parameter | Type | Description |
| - | - | - |
| testParameter | number | |

<h5 id="testfunction-returns">Returns</h5>

A number

**Return type**: number

<h5 id="testfunction-throws">Throws</h5>

An Error

### Variable Details

<h4 id="testnamespace-testconst-variable">TestConst</h4>

Test Constant

**WARNING: This API is provided as a beta preview and may change without notice. Use at your own risk.**

<h5 id="testconst-signature">Signature</h5>

```typescript
TestConst = "Hello world!"
```

### Namespace Details

<h4 id="testnamespace-testsubnamespace-namespace">TestSubNamespace</h4>

Test sub-namespace

<h5 id="testsubnamespace-signature">Signature</h5>

```typescript
namespace TestSubNamespace
```
