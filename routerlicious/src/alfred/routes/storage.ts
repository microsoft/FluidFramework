import { Router } from "express";

const router: Router = Router();

router.get("/:id", (request, response, next) => {
    return response.status(200).json();
});

export default router;
