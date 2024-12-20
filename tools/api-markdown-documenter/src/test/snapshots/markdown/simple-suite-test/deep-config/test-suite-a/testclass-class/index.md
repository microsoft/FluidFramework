# TestClass

[Packages](./) &gt; [test-suite-a](./test-suite-a/) &gt; [TestClass](./test-suite-a/testclass-class/)

Test class

## Signature {#testclass-signature}

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> extends TestAbstractClass
```

**Extends:** [TestAbstractClass](./test-suite-a/testabstractclass-class/)

### Type Parameters

| Parameter | Description |
| --- | --- |
| TTypeParameterA | A type parameter |
| TTypeParameterB | Another type parameter |

## Remarks {#testclass-remarks}

Here are some remarks about the class

## Constructors

| Constructor | Description |
| --- | --- |
| [(constructor)(privateProperty, protectedProperty, testClassProperty, testClassEventProperty)](./test-suite-a/testclass-class/_constructor_-constructor) | Test class constructor |

## Static Properties

| Property | Type | Description |
| --- | --- | --- |
| [testClassStaticProperty](./test-suite-a/testclass-class/testclassstaticproperty-property) | (foo: number) =&gt; string | Test static class property |

## Static Methods

| Method | Return Type | Description |
| --- | --- | --- |
| [testClassStaticMethod(foo)](./test-suite-a/testclass-class/testclassstaticmethod-method) | string | Test class static method |

## Events

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [testClassEventProperty](./test-suite-a/testclass-class/testclasseventproperty-property) | `readonly` | () =&gt; void | Test class event property |

## Properties

| Property | Modifiers | Type | Description |
| --- | --- | --- | --- |
| [abstractPropertyGetter](./test-suite-a/testclass-class/abstractpropertygetter-property) | `readonly` | [TestMappedType](./test-suite-a/testmappedtype-typealias/) | A test abstract getter property. |
| [testClassGetterProperty](./test-suite-a/testclass-class/testclassgetterproperty-property) | `virtual` | number | Test class property with both a getter and a setter. |
| [testClassProperty](./test-suite-a/testclass-class/testclassproperty-property) | `readonly` | TTypeParameterB | Test class property |

## Methods

| Method | Modifiers | Return Type | Description |
| --- | --- | --- | --- |
| [publicAbstractMethod()](./test-suite-a/testclass-class/publicabstractmethod-method) |  | void | A test public abstract method. |
| [testClassMethod(input)](./test-suite-a/testclass-class/testclassmethod-method) | `sealed` | TTypeParameterA | Test class method |
| [virtualMethod()](./test-suite-a/testclass-class/virtualmethod-method) |  | number | Overrides [virtualMethod()](./test-suite-a/testabstractclass-class/virtualmethod-method). |

## See Also {#testclass-see-also}

[TestAbstractClass](./test-suite-a/testabstractclass-class/)
