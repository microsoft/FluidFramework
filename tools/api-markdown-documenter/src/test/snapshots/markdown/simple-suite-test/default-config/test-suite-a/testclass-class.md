# TestClass

[Packages](/) > [test-suite-a](/test-suite-a/) > [TestClass](/test-suite-a/testclass-class)

Test class

<a id="testclass-signature"></a>

## Signature

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> extends TestAbstractClass
```

**Extends**: [TestAbstractClass](/test-suite-a/testabstractclass-class)

### Type Parameters

| Parameter | Description |
| - | - |
| TTypeParameterA | A type parameter |
| TTypeParameterB | Another type parameter |

<a id="testclass-remarks"></a>

## Remarks

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

<a id="_constructor_-constructor"></a>

### (constructor)

Test class constructor

<a id="_constructor_-signature"></a>

#### Signature

```typescript
constructor(privateProperty: number, protectedProperty: TestEnum, testClassProperty: TTypeParameterB, testClassEventProperty: () => void);
```

<a id="_constructor_-remarks"></a>

#### Remarks

Here are some remarks about the constructor

<a id="_constructor_-parameters"></a>

#### Parameters

| Parameter | Type | Description |
| - | - | - |
| privateProperty | number | See [TestAbstractClass](/test-suite-a/testabstractclass-class)'s constructor. |
| protectedProperty | [TestEnum](/test-suite-a/testenum-enum) | <p>Some notes about the parameter.</p><p>See <a href="/test-suite-a/testabstractclass-class#protectedproperty-property">protectedProperty</a>.</p> |
| testClassProperty | TTypeParameterB | See [testClassProperty](/test-suite-a/testclass-class#testclassproperty-property). |
| testClassEventProperty | () => void | See [testClassEventProperty](/test-suite-a/testclass-class#testclasseventproperty-property). |

## Event Details

<a id="testclasseventproperty-property"></a>

### testClassEventProperty

Test class event property

<a id="testclasseventproperty-signature"></a>

#### Signature

```typescript
readonly testClassEventProperty: () => void;
```

**Type**: () => void

<a id="testclasseventproperty-remarks"></a>

#### Remarks

Here are some remarks about the property

## Property Details

<a id="abstractpropertygetter-property"></a>

### abstractPropertyGetter

A test abstract getter property.

<a id="abstractpropertygetter-signature"></a>

#### Signature

```typescript
get abstractPropertyGetter(): TestMappedType;
```

**Type**: [TestMappedType](/test-suite-a/testmappedtype-typealias)

<a id="testclassgetterproperty-property"></a>

### testClassGetterProperty

Test class property with both a getter and a setter.

<a id="testclassgetterproperty-signature"></a>

#### Signature

```typescript
/** @virtual */
get testClassGetterProperty(): number;

set testClassGetterProperty(newValue: number);
```

**Type**: number

<a id="testclassgetterproperty-remarks"></a>

#### Remarks

Here are some remarks about the getter-only property

<a id="testclassproperty-property"></a>

### testClassProperty

Test class property

<a id="testclassproperty-signature"></a>

#### Signature

```typescript
readonly testClassProperty: TTypeParameterB;
```

**Type**: TTypeParameterB

<a id="testclassproperty-remarks"></a>

#### Remarks

Here are some remarks about the property

<a id="testclassstaticproperty-property"></a>

### testClassStaticProperty

Test static class property

<a id="testclassstaticproperty-signature"></a>

#### Signature

```typescript
static testClassStaticProperty: (foo: number) => string;
```

**Type**: (foo: number) => string

## Method Details

<a id="publicabstractmethod-method"></a>

### publicAbstractMethod

A test public abstract method.

<a id="publicabstractmethod-signature"></a>

#### Signature

```typescript
publicAbstractMethod(): void;
```

<a id="testclassmethod-method"></a>

### testClassMethod

Test class method

<a id="testclassmethod-signature"></a>

#### Signature

```typescript
/** @sealed */
testClassMethod(input: TTypeParameterA): TTypeParameterA;
```

<a id="testclassmethod-remarks"></a>

#### Remarks

Here are some remarks about the method

<a id="testclassmethod-parameters"></a>

#### Parameters

| Parameter | Type | Description |
| - | - | - |
| input | TTypeParameterA | |

<a id="testclassmethod-returns"></a>

#### Returns

**Return type**: TTypeParameterA

<a id="testclassmethod-throws"></a>

#### Throws

Some sort of error in 1 case.

Some other sort of error in another case. For example, a case where some thing happens.

<a id="testclassstaticmethod-method"></a>

### testClassStaticMethod

Test class static method

<a id="testclassstaticmethod-signature"></a>

#### Signature

```typescript
static testClassStaticMethod(foo: number): string;
```

<a id="testclassstaticmethod-parameters"></a>

#### Parameters

| Parameter | Type | Description |
| - | - | - |
| foo | number | Some number |

<a id="testclassstaticmethod-returns"></a>

#### Returns

- Some string

**Return type**: string

<a id="virtualmethod-method"></a>

### virtualMethod

Overrides [virtualMethod()](/test-suite-a/testabstractclass-class#virtualmethod-method).

<a id="virtualmethod-signature"></a>

#### Signature

```typescript
/** @override */
protected virtualMethod(): number;
```

<a id="virtualmethod-returns"></a>

#### Returns

**Return type**: number

<a id="testclass-see-also"></a>

## See Also

[TestAbstractClass](/test-suite-a/testabstractclass-class)
