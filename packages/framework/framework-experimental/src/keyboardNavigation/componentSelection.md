# IComponentSelection

IComponentSelection interface specifies contracts for managing selection between components and their hosts.

## Interface Methods

- setSelection(selectionParams: SetSelectionParams): boolean
  SetSelection is used by a component to move selection to its nested component or vice versa. It returns true if selection was successfully moved to that component.
  Parameters: `SetSelectionParams` is an exported type of the interface , it includes:
  1. `SelectionMode` specifies whether the selection is ip selection or select all selection.
  2. `currentCoordinates` x y client coordinates of the selection before moving. For example in case of moving to a table component the x y coordinates of the ip can help specify which cell to move selection to.
  3. `SelectionDirection` specifies the direction from where selection is being moved (right, left, up or down). For example moving selection with right arrow key should correspond to SelectionDirection.right
- clearSelection():void
  Allows host to clear selection in a nested component or vice versa
- setHostComponentSelection(hostComponent: IComponentSelection):void
  The host can pass to the nested component an implementation of IComponentSelection, that allows nested component to return selection to host by calling `hostComponent.IComponentSelection.setSelection`

## Example Implementation

After a component is loaded , a host can use setHostComponentSelection to provide a way for the nested component to move back selection to the host.

```typescript
...
 // Host Component
 // hostComponent loads the nested component
 loadComponent(componenturl).then((component)=>{
    if (component?.IComponentSelection?.setHostComponent){
      component.IComponentSelection.setHostComponentSelection(getHostComponentSelection());
    }
 });

 private someFunctionToSelectNestedComponent(currentSelection: SetSelectionParams){
   component.IComponentSelection?.setSelection(currentSelection);
 }

   // hostComponent IComponentSelection implementation to be passed to nested components
    private getHostComponentSelection(): IComponentSelection {
      const hostComponentSelection: IComponentSelection = {
        get ComponentSelection(): IComponentSelection {
          return this;
        },
        clearSelection: () => {
          // clear selection in host component
        },
        setSelection: (params: SetSelectionParams) => {
          // set selection in host component
        }
    };
    return hostComponentSelection;
  }
...
```

```typescript
...
// Nested Component
ComponentFoo implements IComponentSelection{

  private hostComponent: IComponent |undefined;
  public get ComponentSelection() {
    return this;
  }

  public setSelection(selectionParams:SetSelectionParams){
    // component Foo implementation to set selection
  }

  public clearSelection(){
    // component Foo implementation to clear selection
  }

  public setHostComponentSelection(hostComponentSelection:IComponentSelection){
    this.hostComponent= {...this.hostComponent, IComponentSelection:hostComponentSelection}
  }

  private someFunctionThatShouldReturnSelectionToHost(selectionParams:SetSelectionParams){
    this.hostComponent?.IComponentSelection?.setSelection(selectionParams)
  }

}
...
```
