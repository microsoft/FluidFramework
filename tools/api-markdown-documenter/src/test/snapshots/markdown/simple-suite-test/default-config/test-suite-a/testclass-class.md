# TestClass

[Packages](/) > [test-suite-a](/test-suite-a/) > [TestClass](/test-suite-a/testclass-class)

Test class

<h2 id="testclass-signature">Signature</h2>

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> extends TestAbstractClass
```

**Extends**: [TestAbstractClass](/test-suite-a/testabstractclass-class)

### Type Parameters

| Parameter | Description |
| - | - |
| TTypeParameterA | A type parameter |
| TTypeParameterB | Another type parameter |

<h2 id="testclass-remarks">Remarks</h2>

Here are some remarks about the class

## Constructors

| Constructor | Description |
| - | - |
| [(constructor)(privateProperty, protectedProperty, testClassProperty, testClassEventProperty)](/test-suite-a/testclass-class#_constructor_-constructor) | Test class constructor |

## Static Properties

| Property | Type | Description |
| - | - | - |
| [testClassStaticProperty](/test-suite-a/testclass-class#testclassstaticproperty-property) | (foo: number) => string | Test static class property |

## Static Methods

| Method | Return Type | Description |
| - | - | - |
| [testClassStaticMethod(foo)](/test-suite-a/testclass-class#testclassstaticmethod-method) | string | Test class static method |

## Events

| Property | Modifiers | Type | Description |
| - | - | - | - |
| [testClassEventProperty](/test-suite-a/testclass-class#testclasseventproperty-property) | `readonly` | () => void | Test class event property |

## Properties

| Property | Modifiers | Type | Description |
| - | - | - | - |
| [abstractPropertyGetter](/test-suite-a/testclass-class#abstractpropertygetter-property) | `readonly` | [TestMappedType](/test-suite-a/testmappedtype-typealias) | A test abstract getter property. |
| [testClassGetterProperty](/test-suite-a/testclass-class#testclassgetterproperty-property) | `virtual` | number | Test class property with both a getter and a setter. |
| [testClassProperty](/test-suite-a/testclass-class#testclassproperty-property) | `readonly` | TTypeParameterB | Test class property |

## Methods

| Method | Modifiers | Return Type | Description |
| - | - | - | - |
| [publicAbstractMethod()](/test-suite-a/testclass-class#publicabstractmethod-method) | | void | A test public abstract method. |
| [testClassMethod(input)](/test-suite-a/testclass-class#testclassmethod-method) | `sealed` | TTypeParameterA | Test class method |
| [virtualMethod()](/test-suite-a/testclass-class#virtualmethod-method) | | number | Overrides [virtualMethod()](/test-suite-a/testabstractclass-class#virtualmethod-method). |

## Constructor Details

<h3 id="_constructor_-constructor">(constructor)</h3>

Test class constructor

<h4 id="_constructor_-signature">Signature</h4>

```typescript
constructor(privateProperty: number, protectedProperty: TestEnum, testClassProperty: TTypeParameterB, testClassEventProperty: () => void);
```

<h4 id="_constructor_-remarks">Remarks</h4>

Here are some remarks about the constructor

<h4 id="_constructor_-parameters">Parameters</h4>

| Parameter | Type | Description |
| - | - | - |
| privateProperty | number | See [TestAbstractClass](/test-suite-a/testabstractclass-class)'s constructor. |
| protectedProperty | [TestEnum](/test-suite-a/testenum-enum) | <p>Some notes about the parameter.</p><p>See <a href="/test-suite-a/testabstractclass-class#protectedproperty-property">protectedProperty</a>.</p> |
| testClassProperty | TTypeParameterB | See [testClassProperty](/test-suite-a/testclass-class#testclassproperty-property). |
| testClassEventProperty | () => void | See [testClassEventProperty](/test-suite-a/testclass-class#testclasseventproperty-property). |

## Event Details

<h3 id="testclasseventproperty-property">testClassEventProperty</h3>

Test class event property

<h4 id="testclasseventproperty-signature">Signature</h4>

```typescript
readonly testClassEventProperty: () => void;
```

**Type**: () => void

<h4 id="testclasseventproperty-remarks">Remarks</h4>

Here are some remarks about the property

## Property Details

<h3 id="abstractpropertygetter-property">abstractPropertyGetter</h3>

A test abstract getter property.

<h4 id="abstractpropertygetter-signature">Signature</h4>

```typescript
get abstractPropertyGetter(): TestMappedType;
```

**Type**: [TestMappedType](/test-suite-a/testmappedtype-typealias)

<h3 id="testclassgetterproperty-property">testClassGetterProperty</h3>

Test class property with both a getter and a setter.

<h4 id="testclassgetterproperty-signature">Signature</h4>

```typescript
/** @virtual */
get testClassGetterProperty(): number;

set testClassGetterProperty(newValue: number);
```

**Type**: number

<h4 id="testclassgetterproperty-remarks">Remarks</h4>

Here are some remarks about the getter-only property

<h3 id="testclassproperty-property">testClassProperty</h3>

Test class property

<h4 id="testclassproperty-signature">Signature</h4>

```typescript
readonly testClassProperty: TTypeParameterB;
```

**Type**: TTypeParameterB

<h4 id="testclassproperty-remarks">Remarks</h4>

Here are some remarks about the property

<h3 id="testclassstaticproperty-property">testClassStaticProperty</h3>

Test static class property

<h4 id="testclassstaticproperty-signature">Signature</h4>

```typescript
static testClassStaticProperty: (foo: number) => string;
```

**Type**: (foo: number) => string

## Method Details

<h3 id="publicabstractmethod-method">publicAbstractMethod</h3>

A test public abstract method.

<h4 id="publicabstractmethod-signature">Signature</h4>

```typescript
publicAbstractMethod(): void;
```

<h3 id="testclassmethod-method">testClassMethod</h3>

Test class method

<h4 id="testclassmethod-signature">Signature</h4>

```typescript
/** @sealed */
testClassMethod(input: TTypeParameterA): TTypeParameterA;
```

<h4 id="testclassmethod-remarks">Remarks</h4>

Here are some remarks about the method

<h4 id="testclassmethod-parameters">Parameters</h4>

| Parameter | Type | Description |
| - | - | - |
| input | TTypeParameterA | |

<h4 id="testclassmethod-returns">Returns</h4>

**Return type**: TTypeParameterA

<h4 id="testclassmethod-throws">Throws</h4>

Some sort of error in 1 case.

Some other sort of error in another case. For example, a case where some thing happens.

<h3 id="testclassstaticmethod-method">testClassStaticMethod</h3>

Test class static method

<h4 id="testclassstaticmethod-signature">Signature</h4>

```typescript
static testClassStaticMethod(foo: number): string;
```

<h4 id="testclassstaticmethod-parameters">Parameters</h4>

| Parameter | Type | Description |
| - | - | - |
| foo | number | Some number |

<h4 id="testclassstaticmethod-returns">Returns</h4>

- Some string

**Return type**: string

<h3 id="virtualmethod-method">virtualMethod</h3>

Overrides [virtualMethod()](/test-suite-a/testabstractclass-class#virtualmethod-method).

<h4 id="virtualmethod-signature">Signature</h4>

```typescript
/** @override */
protected virtualMethod(): number;
```

<h4 id="virtualmethod-returns">Returns</h4>

**Return type**: number

<h2 id="testclass-see-also">See Also</h2>

[TestAbstractClass](/test-suite-a/testabstractclass-class)
