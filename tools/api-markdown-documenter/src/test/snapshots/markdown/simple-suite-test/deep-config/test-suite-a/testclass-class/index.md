# TestClass

[Packages](/) > [test-suite-a](/test-suite-a/) > [TestClass](/test-suite-a/testclass-class/)

Test class

<h2 id="testclass-signature">Signature</h2>

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> extends TestAbstractClass
```

**Extends**: [TestAbstractClass](/test-suite-a/testabstractclass-class/)

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
| [(constructor)(privateProperty, protectedProperty, testClassProperty, testClassEventProperty)](/test-suite-a/testclass-class/_constructor_-constructor) | Test class constructor |

## Static Properties

| Property | Type | Description |
| - | - | - |
| [testClassStaticProperty](/test-suite-a/testclass-class/testclassstaticproperty-property) | (foo: number) => string | Test static class property |

## Static Methods

| Method | Return Type | Description |
| - | - | - |
| [testClassStaticMethod(foo)](/test-suite-a/testclass-class/testclassstaticmethod-method) | string | Test class static method |

## Events

| Property | Modifiers | Type | Description |
| - | - | - | - |
| [testClassEventProperty](/test-suite-a/testclass-class/testclasseventproperty-property) | `readonly` | () => void | Test class event property |

## Properties

| Property | Inherited From | Modifiers | Type | Description |
| - | - | - | - | - |
| [abstractPropertyGetter](/test-suite-a/testclass-class/abstractpropertygetter-property) | | `readonly` | [TestMappedType](/test-suite-a/testmappedtype-typealias/) | <p>A test abstract getter property.</p><p>@escapedTag</p> |
| [protectedProperty](/test-suite-a/testabstractclass-class/protectedproperty-property) | [TestAbstractClass](/test-suite-a/testabstractclass-class/) | `readonly` | [TestEnum](/test-suite-a/testenum-enum/) | A test protected property. |
| [testClassGetterProperty](/test-suite-a/testclass-class/testclassgetterproperty-property) | | `virtual` | number | Test class property with both a getter and a setter. |
| [testClassProperty](/test-suite-a/testclass-class/testclassproperty-property) | | `readonly` | TTypeParameterB | Test class property |

## Methods

| Method | Inherited From | Modifiers | Return Type | Description |
| - | - | - | - | - |
| [publicAbstractMethod()](/test-suite-a/testclass-class/publicabstractmethod-method) | | | void | A test public abstract method. |
| [sealedMethod()](/test-suite-a/testabstractclass-class/sealedmethod-method) | [TestAbstractClass](/test-suite-a/testabstractclass-class/) | `sealed` | string | A test `@sealed` method. |
| [testClassMethod(input)](/test-suite-a/testclass-class/testclassmethod-method) | | `sealed` | TTypeParameterA | Test class method |
| [virtualMethod()](/test-suite-a/testclass-class/virtualmethod-method) | | | number | Overrides [virtualMethod()](/test-suite-a/testabstractclass-class/virtualmethod-method). |

<h2 id="testclass-see-also">See Also</h2>

[TestAbstractClass](/test-suite-a/testabstractclass-class/)
