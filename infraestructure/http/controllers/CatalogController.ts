import type { Request, Response } from 'express';
import type { UseCases } from '../../config/container';
import { actorOf, param } from '../requestContext';
import { categorySchema, createProductSchema, listProductsQuery, updateProductSchema } from '../schemas';

export class CatalogController {
  constructor(
    private readonly useCases: Pick<
      UseCases,
      'createCategory' | 'listCategories' | 'createProduct' | 'updateProduct' | 'listProducts' | 'getProduct'
    >,
  ) {}

  listCategories = async (_req: Request, res: Response) => {
    res.json(await this.useCases.listCategories.execute());
  };

  createCategory = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(await this.useCases.createCategory.execute(categorySchema.parse(req.body), actorOf(req)));
  };

  listProducts = async (req: Request, res: Response) => {
    res.json(await this.useCases.listProducts.execute(listProductsQuery.parse(req.query)));
  };

  getProduct = async (req: Request, res: Response) => {
    res.json(await this.useCases.getProduct.execute(param(req, 'id')));
  };

  createProduct = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(await this.useCases.createProduct.execute(createProductSchema.parse(req.body), actorOf(req)));
  };

  updateProduct = async (req: Request, res: Response) => {
    const input = updateProductSchema.parse(req.body);
    res.json(await this.useCases.updateProduct.execute(param(req, 'id'), input, actorOf(req)));
  };
}
