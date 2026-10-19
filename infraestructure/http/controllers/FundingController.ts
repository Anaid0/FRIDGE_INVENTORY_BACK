import type { Request, Response } from 'express';
import type { UseCases } from '../../config/container';
import { actorOf, param } from '../requestContext';
import { contributionSchema, openPeriodSchema } from '../schemas';

export class FundingController {
  constructor(
    private readonly useCases: Pick<
      UseCases,
      | 'openFundingPeriod'
      | 'closeFundingPeriod'
      | 'listFundingPeriods'
      | 'getCurrentFundingPeriod'
      | 'getFundingPeriodDetail'
      | 'registerContribution'
    >,
  ) {}

  list = async (_req: Request, res: Response) => {
    res.json(await this.useCases.listFundingPeriods.execute());
  };

  current = async (_req: Request, res: Response) => {
    res.json(await this.useCases.getCurrentFundingPeriod.execute());
  };

  detail = async (req: Request, res: Response) => {
    res.json(await this.useCases.getFundingPeriodDetail.execute(param(req, 'id')));
  };

  open = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(await this.useCases.openFundingPeriod.execute(openPeriodSchema.parse(req.body), actorOf(req)));
  };

  close = async (req: Request, res: Response) => {
    res.json(await this.useCases.closeFundingPeriod.execute(param(req, 'id'), actorOf(req)));
  };

  contribute = async (req: Request, res: Response) => {
    const { paidAt, ...input } = contributionSchema.parse(req.body);
    const contribution = await this.useCases.registerContribution.execute(
      param(req, 'id'),
      { ...input, paidAt: paidAt ?? new Date() },
      actorOf(req),
    );
    res.status(201).json(contribution);
  };
}
