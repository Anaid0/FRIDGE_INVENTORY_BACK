import type { Request, Response } from 'express';
import type { UseCases } from '../../config/container';
import { actorOf } from '../requestContext';
import { loginSchema } from '../schemas';

export class AuthController {
  constructor(private readonly useCases: Pick<UseCases, 'login' | 'getCurrentUser'>) {}

  login = async (req: Request, res: Response) => {
    res.json(await this.useCases.login.execute(loginSchema.parse(req.body)));
  };

  me = async (req: Request, res: Response) => {
    res.json(await this.useCases.getCurrentUser.execute(actorOf(req).id));
  };
}
