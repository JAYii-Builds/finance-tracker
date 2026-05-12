import { Router, type IRouter } from "express";
import healthRouter from "./health";
import transactionsRouter from "./transactions";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(transactionsRouter);
router.use(statsRouter);

export default router;
