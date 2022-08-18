
export class MyClass {
    private context: {};
    private setContextP = Promise.resolve();

    constructor(sessionId) {
      this.context = { };
      this.setContext({ sessionId });
    }

    public async logEvent(message) {
      await this.setContextP;
      console.log(JSON.stringify(this.context), ` ${message}`);
    }

    public setContext(context) {
      this.setContextP = this.setContextP.then((_) => {
        this.context = { ...this.context, ...context };
      });
    }
}

const c1 = new MyClass("session1");
c1.logEvent("1 hola");
const c2 = new MyClass("session2");
c1.logEvent("1 adios");
c2.logEvent("2 hola");
c2.logEvent("2 adios");
c1.logEvent("1 final");
c2.logEvent("2 final");
