import type { Request, Response } from 'express';
import type { PersonDto } from '../../../application';
import type { UseCases } from '../../config/container';
import { actorOf, param } from '../requestContext';
import { listPeopleQuery, registerPersonSchema, resetPinSchema, updatePersonSchema } from '../schemas';

/** Personas (empleados) que se identifican en la tablet con nombre + PIN. Solo admin. */
export class PeopleController {
  constructor(
    private readonly useCases: Pick<
      UseCases,
      'listPeople' | 'registerPerson' | 'updatePerson' | 'resetPersonPin' | 'setUserActive'
    >,
  ) {}

  list = async (req: Request, res: Response) => {
    res.json(await this.useCases.listPeople.execute(listPeopleQuery.parse(req.query), actorOf(req)));
  };

  register = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(await this.useCases.registerPerson.execute(registerPersonSchema.parse(req.body), actorOf(req)));
  };

  update = async (req: Request, res: Response) => {
    const actor = actorOf(req);
    const personId = param(req, 'id');
    const { isActive, ...fields } = updatePersonSchema.parse(req.body);

    let person: PersonDto | undefined;
    if (Object.keys(fields).length > 0)
      person = await this.useCases.updatePerson.execute(personId, fields, actor);
    if (isActive !== undefined) {
      await this.useCases.setUserActive.execute(personId, isActive, actor);
      person = (await this.useCases.listPeople.execute({}, actor)).find((p) => p.id === personId);
    }
    res.json(person);
  };

  resetPin = async (req: Request, res: Response) => {
    res.json(
      await this.useCases.resetPersonPin.execute(
        param(req, 'id'),
        resetPinSchema.parse(req.body),
        actorOf(req),
      ),
    );
  };
}
