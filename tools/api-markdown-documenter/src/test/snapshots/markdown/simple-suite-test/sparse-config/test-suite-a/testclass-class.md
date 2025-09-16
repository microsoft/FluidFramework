## TestClass

Test class

<h3 id="testclass-signature">Signature</h3>

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> extends TestAbstractClass
```

**Extends**: [TestAbstractClass](docs/test-suite-a/testabstractclass-class)

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
| [(constructor)(privateProperty, protectedProperty, testClassProperty, testClassEventProperty)](docs/test-suite-a/testclass-_constructor_-constructor) | Test class constructor |

### Static Properties

| Property | Type | Description |
| - | - | - |
| [testClassStaticProperty](docs/test-suite-a/testclass-testclassstaticproperty-property) | (foo: number) => string | Test static class property |

### Static Methods

| Method | Return Type | Description |
| - | - | - |
| [testClassStaticMethod(foo)](docs/test-suite-a/testclass-testclassstaticmethod-method) | string | Test class static method |

### Events

| Property | Modifiers | Type | Description |
| - | - | - | - |
| [testClassEventProperty](docs/test-suite-a/testclass-testclasseventproperty-property) | `readonly` | () => void | Test class event property |

### Properties

| Property | Modifiers | Type | Description |
| - | - | - | - |
| [abstractPropertyGetter](docs/test-suite-a/testclass-abstractpropertygetter-property) | `readonly` | [TestMappedType](docs/test-suite-a/testmappedtype-typealias) | A test abstract getter property. |
| [testClassGetterProperty](docs/test-suite-a/testclass-testclassgetterproperty-property) | `virtual` | number | Test class property with both a getter and a setter. |
| [testClassProperty](docs/test-suite-a/testclass-testclassproperty-property) | `readonly` | TTypeParameterB | Test class property |
| [protectedProperty](docs/test-suite-a/testabstractclass-protectedproperty-property) | `readonly` | [TestEnum](docs/test-suite-a/testenum-enum) | A test protected property. |

### Methods

| Method | Modifiers | Return Type | Description |
| - | - | - | - |
| [publicAbstractMethod()](docs/test-suite-a/testclass-publicabstractmethod-method) | | void | A test public abstract method. |
| [testClassMethod(input)](docs/test-suite-a/testclass-testclassmethod-method) | `sealed` | TTypeParameterA | Test class method |
| [virtualMethod()](docs/test-suite-a/testclass-virtualmethod-method) | | number | Overrides [virtualMethod()](docs/test-suite-a/testabstractclass-virtualmethod-method). |
| [sealedMethod()](docs/test-suite-a/testabstractclass-sealedmethod-method) | `sealed` | string | A test `@sealed` method. |

<h3 id="testclass-see-also">See Also</h3>

[TestAbstractClass](docs/test-suite-a/testabstractclass-class)
