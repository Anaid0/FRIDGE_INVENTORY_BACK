import type { Request, Response } from 'express';
import type { UseCases } from '../../config/container';
import { actorOf } from '../requestContext';
import { listMovementsQuery, stockMovementSchema, topWithdrawersQuery } from '../schemas';

export class MovementController {
  constructor(
    private readonly useCases: Pick<
      UseCases,
      | 'registerStockIn'
      | 'registerStockOut'
      | 'listMovements'
      | 'getTopWithdrawers'
      | 'getDashboardSummary'
      | 'getPeopleActivity'
    >,
  ) {}

  stockIn = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(await this.useCases.registerStockIn.execute(stockMovementSchema.parse(req.body), actorOf(req)));
  };

  stockOut = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(await this.useCases.registerStockOut.execute(stockMovementSchema.parse(req.body), actorOf(req)));
  };

  list = async (req: Request, res: Response) => {
    res.json(await this.useCases.listMovements.execute(listMovementsQuery.parse(req.query)));
  };

  peopleActivity = async (req: Request, res: Response) => {
    const periodId =
      typeof req.query.periodId === 'string' && req.query.periodId ? req.query.periodId : undefined;
    res.json(await this.useCases.getPeopleActivity.execute({ periodId }));
  };

  topWithdrawers = async (req: Request, res: Response) => {
    const { period, periodId, limit } = topWithdrawersQuery.parse(req.query);
    res.json(await this.useCases.getTopWithdrawers.execute({ window: period, periodId, limit }));
  };

  dashboard = async (_req: Request, res: Response) => {
    res.json(await this.useCases.getDashboardSummary.execute());
  };
}
