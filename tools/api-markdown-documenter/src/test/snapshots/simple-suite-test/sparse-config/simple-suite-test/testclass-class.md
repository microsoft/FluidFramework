
# TestClass

Test class

## Remarks {#testclass-remarks}

Here are some remarks about the class

## Signature {#testclass-signature}

```typescript
export declare class TestClass<TTypeParameterA, TTypeParameterB> extends TestAbstractClass 
```
<b>Extends:</b> [TestAbstractClass](docs/simple-suite-test/testabstractclass-class)


<b>Type parameters:</b> 

* <b>TTypeParameterA</b>: A type parameter


* <b>TTypeParameterB</b>: Another type parameter


## Constructors

|  Constructor | Return Type | Description |
|  --- | --- | --- |
|  [(constructor)(privateProperty, protectedProperty, testClassProperty, testClassEventProperty)](docs/simple-suite-test/testclass-_constructor_-constructor) |  | Test class constructor |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [abstractPropertyGetter](docs/simple-suite-test/testclass-abstractpropertygetter-property) | readonly | [TestMappedType](docs/simple-suite-test/testmappedtype-typealias) | A test abstract getter property. |
|  [testClassEventProperty](docs/simple-suite-test/testclass-testclasseventproperty-property) | readonly | () =&gt; void | Test class event property |
|  [testClassGetterProperty](docs/simple-suite-test/testclass-testclassgetterproperty-property) | readonly | number | Test class getter-only property |
|  [testClassProperty](docs/simple-suite-test/testclass-testclassproperty-property) | readonly | TTypeParameterB | Test class property |

## Methods

|  Method | Return Type | Description |
|  --- | --- | --- |
|  [publicAbstractMethod()](docs/simple-suite-test/testclass-publicabstractmethod-method) | void | A test public abstract method. |
|  [testClassMethod(input)](docs/simple-suite-test/testclass-testclassmethod-method) | TTypeParameterA | Test class method |
|  [virtualMethod()](docs/simple-suite-test/testclass-virtualmethod-method) | number | Overrides [TestAbstractClass.virtualMethod()](docs/simple-suite-test/testabstractclass-virtualmethod-method)<!-- -->. |

