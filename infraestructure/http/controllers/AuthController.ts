import type { Request, Response } from 'express';
import type { UseCases } from '../../config/container';
import { actorOf } from '../requestContext';
import { loginSchema, setAdminCodeSchema } from '../schemas';

export class AuthController {
  constructor(private readonly useCases: Pick<UseCases, 'login' | 'getCurrentUser' | 'setAdminCode'>) {}

  login = async (req: Request, res: Response) => {
    res.json(await this.useCases.login.execute(loginSchema.parse(req.body)));
  };

  me = async (req: Request, res: Response) => {
    res.json(await this.useCases.getCurrentUser.execute(actorOf(req).id));
  };

  /** El admin define o cambia su código para entrar desde la tablet. */
  setAdminCode = async (req: Request, res: Response) => {
    await this.useCases.setAdminCode.execute(setAdminCodeSchema.parse(req.body), actorOf(req));
    res.status(204).end();
  };
}
