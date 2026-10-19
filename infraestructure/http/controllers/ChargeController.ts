import type { Request, Response } from 'express';
import type { UseCases } from '../../config/container';
import { actorOf, param } from '../requestContext';
import { chargePaymentSchema } from '../schemas';

/** Cobros por consumo: quien más consume, más aporta al siguiente mercado. */
export class ChargeController {
  constructor(
    private readonly useCases: Pick<
      UseCases,
      'getPeriodCharges' | 'generateConsumptionCharges' | 'listPendingCharges' | 'payConsumptionCharge'
    >,
  ) {}

  byPeriod = async (req: Request, res: Response) => {
    res.json(await this.useCases.getPeriodCharges.execute(param(req, 'id')));
  };

  generate = async (req: Request, res: Response) => {
    res.json(await this.useCases.generateConsumptionCharges.execute(param(req, 'id'), actorOf(req)));
  };

  pending = async (_req: Request, res: Response) => {
    res.json(await this.useCases.listPendingCharges.execute());
  };

  pay = async (req: Request, res: Response) => {
    const input = chargePaymentSchema.parse(req.body);
    res
      .status(201)
      .json(await this.useCases.payConsumptionCharge.execute(param(req, 'id'), input, actorOf(req)));
  };
}
