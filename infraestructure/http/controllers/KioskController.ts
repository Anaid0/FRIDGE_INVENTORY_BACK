import type { Request, Response } from 'express';
import type { UseCases } from '../../config/container';
import { actorOf, kioskDeviceOf, param } from '../requestContext';
import { changeOwnPinSchema, kioskMovementSchema, pairKioskSchema } from '../schemas';

/** Tablets: el admin las autoriza/revoca; la tablet lista personas y registra movimientos con PIN. */
export class KioskController {
  constructor(
    private readonly useCases: Pick<
      UseCases,
      | 'pairKioskDevice'
      | 'listKioskDevices'
      | 'revokeKioskDevice'
      | 'listKioskPeople'
      | 'kioskRegisterMovements'
      | 'changeOwnPin'
    >,
  ) {}

  // --- Admin ---
  pair = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(await this.useCases.pairKioskDevice.execute(pairKioskSchema.parse(req.body), actorOf(req)));
  };

  list = async (req: Request, res: Response) => {
    res.json(await this.useCases.listKioskDevices.execute(actorOf(req)));
  };

  revoke = async (req: Request, res: Response) => {
    res.json(await this.useCases.revokeKioskDevice.execute(param(req, 'id'), actorOf(req)));
  };

  // --- Tablet ---
  me = async (req: Request, res: Response) => {
    res.json(kioskDeviceOf(req));
  };

  people = async (_req: Request, res: Response) => {
    res.json(await this.useCases.listKioskPeople.execute());
  };

  registerMovements = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(await this.useCases.kioskRegisterMovements.execute(kioskMovementSchema.parse(req.body)));
  };

  changePin = async (req: Request, res: Response) => {
    const input = changeOwnPinSchema.parse(req.body);
    await this.useCases.changeOwnPin.execute({ personId: param(req, 'id'), ...input });
    res.status(204).end();
  };
}
