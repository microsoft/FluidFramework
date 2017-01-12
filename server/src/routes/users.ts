import * as express from "express";
import * as agent from "./agent";

let router = express.Router();

/* GET users listing. */
router.get("/", (req, res, next) => {
  res.send("respond with a resource");
});

router.get("/math", (req, res, next) => {
  let answer = false;
  if (req.query.text && req.query.axiom && req.query.vname) {
    try {
      let checker = agent.createChecker(req.query.axiom, req.query.vname);
      answer = checker.check(req.query.text);
    } catch (e) {
      answer = false;
    }
  }
  let msg = answer ? ("on the right track: " + req.query.text + " leads to " + req.query.axiom) : "keep trying"
  res.send("agent says: " + msg);
});

export = router;
