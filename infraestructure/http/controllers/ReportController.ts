import type { Request, Response } from 'express';
import type { UseCases } from '../../config/container';
import { param } from '../requestContext';
import { dateRangeQuerySchema, reportScopeQuery } from '../schemas';

export class ReportController {
  constructor(
    private readonly useCases: Pick<
      UseCases,
      'getSpendingByProduct' | 'getSpendingByCategory' | 'getProductPriceHistory'
    >,
  ) {}

  byProduct = async (req: Request, res: Response) => {
    res.json(await this.useCases.getSpendingByProduct.execute(reportScopeQuery.parse(req.query)));
  };

  byCategory = async (req: Request, res: Response) => {
    res.json(await this.useCases.getSpendingByCategory.execute(reportScopeQuery.parse(req.query)));
  };

  priceHistory = async (req: Request, res: Response) => {
    const range = dateRangeQuerySchema.parse(req.query);
    res.json(await this.useCases.getProductPriceHistory.execute(param(req, 'productId'), range));
  };
}
