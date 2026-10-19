import type { Request, Response } from 'express';
import type { UseCases } from '../../config/container';
import { actorOf, kioskDeviceOf, param } from '../requestContext';
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
      | 'getPeriodRanking'
      | 'computePeriodRanking'
      | 'getLatestPeriodRanking'
      | 'listRankingPeriods'
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

  ranking = async (req: Request, res: Response) => {
    res.json(await this.useCases.getPeriodRanking.execute(param(req, 'id')));
  };

  /** Desde la administración (admin) o desde la tablet (solo la primera vez). */
  computeRanking = async (req: Request, res: Response) => {
    const caller = req.actor ? { actor: actorOf(req) } : { kioskDeviceId: kioskDeviceOf(req).id };
    res.json(await this.useCases.computePeriodRanking.execute(param(req, 'id'), caller));
  };

  rankingPeriods = async (_req: Request, res: Response) => {
    res.json(await this.useCases.listRankingPeriods.execute());
  };

  /** `{ ranking: null }` si todavía no se ha calculado ninguna quincena. */
  latestRanking = async (_req: Request, res: Response) => {
    res.json({ ranking: await this.useCases.getLatestPeriodRanking.execute() });
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
