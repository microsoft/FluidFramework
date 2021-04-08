/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable require-jsdoc */
/* globals sinon */

/**
 * @fileoverview Example DataBinder usage
 */
import { ComponentTree } from '@adsk/forge-appfw-di';
import { hfdmDefaultProviders, HFDMConnection, HFDMWorkspaceComponent } from '@adsk/forge-appfw-hfdm';
import { PropertyFactory } from '@adsk/forge-hfdm';
import { DataBinder, StatelessDataBinding } from '../../src/index';

const pointSchema = {
  typeid: 'autodesk.appfwtutorials:point-1.0.0',
  properties: [{
    id: 'x',
    typeid: 'Float64'
  },
  {
    id: 'y',
    typeid: 'Float64'
  }]
};

PropertyFactory.register(pointSchema);

// SnippetStart{StatelessBinding}
// A stateless DataBinding that logs point coordinates on insert and modify events.
class PointLogger extends StatelessDataBinding {
  // A callback function that is called on property insertion.
  onPostCreate() {
    // The property returned by `this.getProperty()` is the property that has been inserted.
    console.log(this.getProperty().getValues());
  }

  // A callback function that is called on property modification.
  onModify() {
    // The property returned by `this.getProperty()` is the property that has been modified.
    console.log(this.getProperty().getValues());
  }
}
// SnippetEnd{StatelessBinding}

const pointLoggerSpy = sinon.spy(PointLogger.prototype, 'onPostCreate');

/**
 * A simple AppComponent to illustrate usage of data binder
 */
class TutorialComponent {
  // SnippetStart{Depending}
  // Depending on an authentication component in an AppComponent
  static defineDependencies() {
    return [
      { type: 'DataBinderComponent' }
    ];
  }
  // SnippetEnd{Depending}

  /**
   * The constructor
   * @param {DataBinder} dataBinder The DataBinder instance.
   */
  constructor(dataBinder) {
    this._dataBinder = dataBinder;
    this.initializeComponent();
  }

  /**
   * This function initializes the component and its dependency.
   * @return {Promise} A promise that indicates whether this component has been resolved successfully.
   */
  initializeComponent() {
    if (!this._initPromise) {
      this._initPromise = new Promise((resolve, reject) => {
        this._dataBinder.initializeComponent().then(() => {
          const workspace = this._dataBinder.getWorkspace();
          const pointLogger = new PointLogger({ dataBinder: this._dataBinder });
          this._dataBinder.registerStateless('LOGGING', pointSchema.typeid, pointLogger);
          workspace.insert('point', PropertyFactory.create(pointSchema.typeid));
          resolve(this);
        }).catch(error => {
          reject(error);
        });
      });
    }

    return this._initPromise;
  }
}

describe('DataBinder documentation snippets', function() {
  beforeEach(function() {
    pointLoggerSpy.resetHistory();
  });

  it('stand-alone snippet works', function() {
    // NOTE: This snippet is embedded based on line numbers. Be careful when changing it!
    // SnippetStart{StandAloneExample}
    // Create a DataBinder instance and its dependencies.
    const hfdm = new HFDMConnection();
    const hfdmWorkspace = new HFDMWorkspaceComponent(hfdm);
    const dataBinder = new DataBinder(hfdmWorkspace);

    // Create a stateless DataBinding and register it for a point schema.
    const pointLogger = new PointLogger({ dataBinder: this._dataBinder });
    // The member functions of the DataBinder can be accessed without initialization.
    dataBinder.registerStateless('LOGGING', pointSchema.typeid, pointLogger);

    const promise = // This line (11) is excluded from the snippet
    // We have to initialize the workspace before we can use it.
    hfdmWorkspace.initializeComponent().then(workspace => {
      // Any time a point is inserted to or modified in the workspace, we print its values to the console.
      workspace.insert('point', PropertyFactory.create(pointSchema.typeid));
    });
    // SnippetEnd{StandAloneExample}
    return promise.then(() => {
      pointLoggerSpy.callCount.should.equal(1);
    });
  });

  it('explicit initialization snippet works', function() {
    // Create a the DataBinder instance and its dependencies.
    const hfdm = new HFDMConnection();
    const hfdmWorkspace = new HFDMWorkspaceComponent(hfdm);

    // NOTE: This snippet is embedded based on line numbers. Be careful when changing it!
    // SnippetStart{ExplicitInitialization}
    /**
     * In the previous snippet, we explained that the DataBinder can be used without explicit initialization.
     * However, we had to initialize the workspace component in order to insert a property. Alternatively,
     * we can also get the workspace that corresponds to a DataBinder via the `getWorkspace` method.
     * This is the only case that requires us to explicitly initialize the DataBinder, though.
     */
    // ...
    const dataBinder = new DataBinder(hfdmWorkspace);
    dataBinder.initializeComponent().then(() => {
      const workspace = dataBinder.getWorkspace();
      workspace.insert('point', PropertyFactory.create(pointSchema.typeid));
    });
    // SnippetEnd{ExplicitInitialization}

    // Create a stateless DataBinding and register it for the point schema.
    const pointLogger = new PointLogger({ dataBinder: this._dataBinder });
    // The member functions of the DataBinder can be accessed without initialization.
    dataBinder.registerStateless('LOGGING', pointSchema.typeid, pointLogger);

    return dataBinder.initializeComponent().then(() => {
      pointLoggerSpy.callCount.should.equal(1);
    });
  });

  it('component tree snippet works', function() {
    const providers = {
      // SnippetStart{Providers}
      providers: [
        { type: 'DataBinderComponent', useClass: DataBinder }
        // ...
      ]
      // SnippetEnd{Providers}
    };

    const componentTree = new ComponentTree({
      // Register providers. Each one can be either a component class or a data object.
      // The "type" strings will be used for referring to the registered providers later.
      providers: [
        ...hfdmDefaultProviders(),
        ...providers.providers,
        { type: 'TutorialComponent', useClass: TutorialComponent }
      ],
      app: [
        { type: 'TutorialComponent' }
      ]
    });

    return componentTree.create().then(() => {
      pointLoggerSpy.callCount.should.equal(1);
    });
  });
});
