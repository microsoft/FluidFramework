## TestClass

Test class

### Signature {#testclass-signature}

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> extends TestAbstractClass
```

**Extends:** [TestAbstractClass](docs/simple-suite-test/testabstractclass-class)

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
| [(constructor)(privateProperty, protectedProperty, testClassProperty, testClassEventProperty)](docs/simple-suite-test/testclass-_constructor_-constructor) | Test class constructor |

### Static Properties

| Property | Type | Description |
| --- | --- | --- |
| [testClassStaticProperty](docs/simple-suite-test/testclass-testclassstaticproperty-property) | (foo: number) =&gt; string | Test static class property |

### Static Methods

| Method | Return Type | Description |
| --- | --- | --- |
| [testClassStaticMethod(foo)](docs/simple-suite-test/testclass-testclassstaticmethod-method) | string | Test class static method |

### Events

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [testClassEventProperty](docs/simple-suite-test/testclass-testclasseventproperty-property) | `readonly` | () =&gt; void | Test class event property |

### Properties

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [abstractPropertyGetter](docs/simple-suite-test/testclass-abstractpropertygetter-property) | `readonly` | [TestMappedType](docs/simple-suite-test/testmappedtype-typealias) | A test abstract getter property. |
| [testClassGetterProperty](docs/simple-suite-test/testclass-testclassgetterproperty-property) | `readonly`, `virtual` | number | Test class getter-only property |
| [testClassProperty](docs/simple-suite-test/testclass-testclassproperty-property) | `readonly` | TTypeParameterB | Test class property |

### Methods

| Method | Modifiers | Return Type | Description |
| --- | --- | --- | --- |
| [publicAbstractMethod()](docs/simple-suite-test/testclass-publicabstractmethod-method) |  | void | A test public abstract method. |
| [testClassMethod(input)](docs/simple-suite-test/testclass-testclassmethod-method) | `sealed` | TTypeParameterA | Test class method |
| [virtualMethod()](docs/simple-suite-test/testclass-virtualmethod-method) |  | number | Overrides [virtualMethod()](docs/simple-suite-test/testabstractclass-virtualmethod-method). |

### See Also {#testclass-see-also}

[TestAbstractClass](docs/simple-suite-test/testabstractclass-class)
