import type { Request, Response } from 'express';
import type { UseCases } from '../../config/container';
import { actorOf } from '../requestContext';
import { listMovementsQuery, stockMovementSchema, topWithdrawersQuery } from '../schemas';

export class MovementController {
  constructor(
    private readonly useCases: Pick<
      UseCases,
      'registerStockIn' | 'registerStockOut' | 'listMovements' | 'getTopWithdrawers' | 'getDashboardSummary'
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

  topWithdrawers = async (req: Request, res: Response) => {
    const { period, limit } = topWithdrawersQuery.parse(req.query);
    res.json(await this.useCases.getTopWithdrawers.execute({ window: period, limit }));
  };

  dashboard = async (_req: Request, res: Response) => {
    res.json(await this.useCases.getDashboardSummary.execute());
  };
}
