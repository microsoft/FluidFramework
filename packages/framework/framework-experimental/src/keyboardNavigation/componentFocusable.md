# IComponentFocusable

IComponentFocusable interface specifies contracts for managing focus between components and their hosts.

## Interface Methods

- giveFocus(focusDirection?: FocusDirection): boolean
  giveFocus is used by a component to focus to its nested component or vice versa. It returns true if focus was successfully accepted by that component.
  Parameters:
  `FocusDirection` specifies if the current position of focus is `before` or `after` the component we are trying to give focus to.
- isComponentFocused():boolean
  Allows us to query the component to know if it currently has focus.
- setHostComponentFocusable(hostComponent:IComponentFocusable):void
  The host can pass to the nested component an implementation of IComponentFocusable, that allows nested component to return focus to host by calling `hostComponent.IComponentFocusable.giveFocus`

## Example Implementation

After a component is loaded, a host can use setHostComponentFocusable to provide a way for the nested component to move back focus to the host.

```typescript
...
 // Host Component
 // hostComponent loads the nested component
 loadComponent(componenturl).then((component)=>{
    if (component?.IComponentFocusable?.setHostComponentFocusable){
      component.IComponentFocusable.setHostComponentFocusable(getHostComponentFocusable());
    }
 });
 private someFunctionToFocusNestedComponent(focusDirection: FocusDirection){
   component.IComponentFocusable?.giveFocus(focusDirection);
 }
  // hostComponent IComponentFocusable implementation to be passed to nested components
 private getHostComponentFocusable(): IComponentFocusable {
    const hostComponentFocusable: IComponentFocusable = {
      get ComponentFocusable(): IComponentFocusable {
        return this;
      },
      isComponentFocused: () => {
        // return true if parent component or any of its children is focused
      },
      giveFocus: (direction: FocusDirection) => {
        // set focus in host component
      }
    };
    return hostComponentFocusable;
  }
...
```

```typescript
...
// Nested Component
ComponentFoo implements IComponentFocusable{
  private hostComponent: IComponent |undefined;
  private isFocused:boolean;
  public get ComponentFocusable() {
    return this;
  }
  public giveFocus(focusDirection: FocusDirection){
    // component Foo implementation to focus
    this.isFocused=true;
  }
  public isComponentFocused(){
    // return component focus state
    return this.isFocused;
  }
  public setHostComponentFocusable(hostComponentFocusable:IComponentFocusable){
    this.hostComponent= {...this.hostComponent, IComponentFocusable:hostComponentFocusable}
  }
  private someFunctionThatShouldReturnFocusToHost(focusDirection: FocusDirection){
    this.hostComponent?.IComponentFocusable?.giveFocus(focusDirection);
    this.isFocused=false;
  }
}
...
```
