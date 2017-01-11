// The main app code
/// <reference path="utils.ts"/>
/// <reference path="StickyNote.ts"/>
/// <reference path="inkCanvas.ts"/>

var appObject;
var sticky;
var mainBoard;


// App Class 
class App {
  ink: InkCanvas;

  handleKeys: boolean = true;
  stickyCount: number = 0;

  constructor() {

    // register all of the different handlers
    var p : HTMLElement = id("hitPlane");
    this.ink = new InkCanvas(p);

    window.addEventListener("keydown", this.keyPress, false);
    window.addEventListener("keyup", this.keyRelease, false);

    // toolbar buttons
    document.querySelector("#strokeColors").addEventListener("click", (e) => { appObject.ink.inkColor() }, false);
    document.querySelector("#clearButton").addEventListener("click", (e) => { appObject.clear(); }, false);
    document.querySelector("#undoButton").addEventListener("click", (e) => { appObject.ink.undo(); }, false);
    document.querySelector("#redoButton").addEventListener("click", (e) => { appObject.ink.redo(); }, false);
    document.querySelector("#testButton").addEventListener("click", (e) => { appObject.test(e); }, false);
    document.querySelector("#turnOnInk").addEventListener("click", (e) => { appObject.test(e); }, false);

  }


  //  Key Handlers:
  //   Escape
  //   ^C  Copy
  //   ^V  Paste
  //   ^F  Find
  //   ^O  Load
  //   ^S  Save
  //   ^R  Recognize
  //   ^Q  Quit (shuts down the sample app)

  keyRelease(evt) {

  }

  keyPress(evt) {
    if (this.handleKeys === false)
      return false;
    if (evt.keyCode === 27) { // Escape
      evt.preventDefault();
      displayStatus("Escape");
    } else if (evt.ctrlKey === true && evt.keyCode !== 17) {  // look for keys while control down
      displayStatus("KeyCode: " + evt.keyCode);
      if (evt.keyCode === 67) {        // Control c
        evt.preventDefault();
        displayStatus("CTRL-C");
      } else if (evt.keyCode === 86) { // Control v
        evt.preventDefault();
        displayStatus("CTRL-V");
      } else if (evt.keyCode === 79) { // Control o
        evt.preventDefault();
        displayStatus("CTRL-O");
      } else if (evt.keyCode === 83) { // Control s
        evt.preventDefault();
        displayStatus("CTRL-S");
      } else if (evt.keyCode === 82) { // Control r
        evt.preventDefault();
        displayStatus("CTRL-R");
      } else if (evt.keyCode === 81) { // Control q
        evt.preventDefault();
        displayStatus("CTRL-Q");
      } else if (evt.keyCode === 89) { // Control y
        evt.preventDefault();
        displayStatus("CTRL-Y");
      } else if (evt.keyCode === 90) { // Control z
        evt.preventDefault();
        displayStatus("CTRL-Z");
      }
    }
  }


  // this method will try up the entire board
  clear() {
    appObject.ink.clear();
    var board = id("content");
    var stickies = document.querySelectorAll(".stickyNote");
    for (var i = 0; i < stickies.length; i++) {
      board.removeChild(stickies[i]);
    }
  }

  // find all of the things that are selected and unselect them
  unselectAll() {
    var sel = document.querySelectorAll(".stickySelected");
    var elem;
    if (sel.length > 0) {
      for (var i = 0; i < sel.length; i++) {
        elem = sel.item(i);
        if (elem.classList.contains("stickySelected")) {
          elem.classList.remove("stickySelected");
          elem.style.zIndex = "1";
        }
      }
    }
  }

  makeInkable() {   
    var sel = document.querySelectorAll(".stickySelected");
    var elem;
    if (sel.length > 0) {
      for (var i = 0; i < sel.length; i++) {
        elem = sel.item(i);
        elem.classList.add("stickyInkable");
        var ic = new InkCanvas(elem);
      }
    }
  }

  // this is the handler for the test tube
  test(e) {
    if (e.target.id === 'testButton') {
      this.unselectAll();
      var x = new StickyNote(id("content"));
    }
    if (e.target.id === 'turnOnInk') {
      this.makeInkable();
    }
  }

}

// create the new app

(function () {
  document.addEventListener("DOMContentLoaded", () => {
    appObject = new App();
    sticky = new StickyNote(id("content"));
    mainBoard = new BackBoard("hitPlane");
    // id("ToolBar").appendChild(new ToolBarButton("images/icons/pencil.svg").click(appObject.clear).elem());

  });
})();
