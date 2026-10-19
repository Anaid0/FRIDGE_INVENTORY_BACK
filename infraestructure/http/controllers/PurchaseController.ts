import type { Request, Response } from 'express';
import type { UseCases } from '../../config/container';
import { actorOf, param } from '../requestContext';
import { listPurchasesQuery, registerPurchaseSchema } from '../schemas';

export class PurchaseController {
  constructor(
    private readonly useCases: Pick<
      UseCases,
      'registerPurchase' | 'voidPurchase' | 'listPurchases' | 'getPurchase' | 'getPurchaseReceipt'
    >,
  ) {}

  list = async (req: Request, res: Response) => {
    res.json(await this.useCases.listPurchases.execute(listPurchasesQuery.parse(req.query)));
  };

  detail = async (req: Request, res: Response) => {
    res.json(await this.useCases.getPurchase.execute(param(req, 'id')));
  };

  /** multipart/form-data (con comprobante en el campo `receipt`) o JSON sin comprobante. */
  register = async (req: Request, res: Response) => {
    const input = registerPurchaseSchema.parse(req.body);
    const receipt = req.file
      ? { content: req.file.buffer, originalName: req.file.originalname, mimeType: req.file.mimetype }
      : null;
    res.status(201).json(await this.useCases.registerPurchase.execute({ ...input, receipt }, actorOf(req)));
  };

  void = async (req: Request, res: Response) => {
    res.json(await this.useCases.voidPurchase.execute(param(req, 'id'), actorOf(req)));
  };

  receipt = async (req: Request, res: Response) => {
    const file = await this.useCases.getPurchaseReceipt.execute(param(req, 'id'));
    res
      .type(file.mimeType)
      .setHeader('Content-Disposition', `inline; filename="${file.fileName}"`)
      .send(Buffer.from(file.content));
  };
}
