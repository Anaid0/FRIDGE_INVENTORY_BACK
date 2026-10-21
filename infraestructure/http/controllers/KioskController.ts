import type { Request, Response } from 'express';
import type { UseCases } from '../../config/container';
import { actorOf, kioskDeviceOf, param } from '../requestContext';
import {
  changeOwnPinSchema,
  kioskAdminSessionSchema,
  kioskMovementSchema,
  pairKioskSchema,
} from '../schemas';

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
      | 'changeOwnPinByPin'
      | 'kioskAdminSession'
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
      .json(
        await this.useCases.kioskRegisterMovements.execute(
          kioskMovementSchema.parse(req.body),
          kioskDeviceOf(req).id,
        ),
      );
  };

  changePin = async (req: Request, res: Response) => {
    const input = changeOwnPinSchema.parse(req.body);
    await this.useCases.changeOwnPin.execute({ personId: param(req, 'id'), ...input });
    res.status(204).end();
  };

  /** Un admin marca su código en el teclado: devuelve una sesión de admin (igual que /auth/login). */
  adminSession = async (req: Request, res: Response) => {
    const { code } = kioskAdminSessionSchema.parse(req.body);
    res.json(await this.useCases.kioskAdminSession.execute(kioskDeviceOf(req).id, code));
  };

  /** Cambiar el PIN sin elegir nombre: el PIN actual identifica a la persona. Devuelve su nombre. */
  changePinByPin = async (req: Request, res: Response) => {
    const input = changeOwnPinSchema.parse(req.body);
    res.json(await this.useCases.changeOwnPinByPin.execute({ deviceId: kioskDeviceOf(req).id, ...input }));
  };
}
