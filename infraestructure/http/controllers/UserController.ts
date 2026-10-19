import type { Request, Response } from 'express';
import type { UserDto } from '../../../application';
import type { UseCases } from '../../config/container';
import { actorOf, param } from '../requestContext';
import { listUsersQuery, registerUserSchema, updateUserSchema } from '../schemas';

export class UserController {
  constructor(
    private readonly useCases: Pick<
      UseCases,
      'registerAdmin' | 'listUsers' | 'listUserOptions' | 'updateUser' | 'setUserActive'
    >,
  ) {}

  /** Crea otro administrador (email + contraseña). Las personas se crean en /people. */
  register = async (req: Request, res: Response) => {
    const { role: _role, ...input } = registerUserSchema.parse(req.body);
    res.status(201).json(await this.useCases.registerAdmin.execute(input, actorOf(req)));
  };

  list = async (req: Request, res: Response) => {
    res.json(await this.useCases.listUsers.execute(listUsersQuery.parse(req.query), actorOf(req)));
  };

  options = async (_req: Request, res: Response) => {
    res.json(await this.useCases.listUserOptions.execute());
  };

  /** PATCH: datos, email, contraseña y/o activación en una sola petición. */
  update = async (req: Request, res: Response) => {
    const actor = actorOf(req);
    const userId = param(req, 'id');
    const { isActive, ...fields } = updateUserSchema.parse(req.body);

    let user: UserDto | undefined;
    if (Object.keys(fields).length > 0) user = await this.useCases.updateUser.execute(userId, fields, actor);
    if (isActive !== undefined) user = await this.useCases.setUserActive.execute(userId, isActive, actor);
    res.json(user);
  };
}
