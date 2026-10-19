import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Role } from '../../../domain';
import type { Container } from '../../config/container';
import { asyncHandler as h } from '../asyncHandler';
import { AuthController } from '../controllers/AuthController';
import { CatalogController } from '../controllers/CatalogController';
import { FundingController } from '../controllers/FundingController';
import { KioskController } from '../controllers/KioskController';
import { MovementController } from '../controllers/MovementController';
import { PeopleController } from '../controllers/PeopleController';
import { PurchaseController } from '../controllers/PurchaseController';
import { ReportController } from '../controllers/ReportController';
import { UserController } from '../controllers/UserController';
import { authenticate, requireKiosk, requireUser } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { receiptUpload } from '../middlewares/upload';

export function apiRouter(container: Container): Router {
  const { useCases, tokens, env } = container;
  const router = Router();
  const auth = authenticate(tokens, useCases.getCurrentUser, useCases.authenticateKioskDevice);
  const admin = authorize(Role.ADMIN);

  const authCtrl = new AuthController(useCases);
  const users = new UserController(useCases);
  const people = new PeopleController(useCases);
  const catalog = new CatalogController(useCases);
  const movements = new MovementController(useCases);
  const funding = new FundingController(useCases);
  const purchases = new PurchaseController(useCases);
  const reports = new ReportController(useCases);
  const kiosk = new KioskController(useCases);

  // --- Públicas ---
  router.get(
    '/health',
    h(async (_req, res) => {
      const database = await container.checkDatabase();
      res.status(database ? 200 : 503).json({ status: database ? 'ok' : 'degraded', database });
    }),
  );

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => env.NODE_ENV === 'test',
    message: { error: { code: 'TOO_MANY_ATTEMPTS', message: 'Demasiados intentos, espera unos minutos' } },
  });
  router.post('/auth/login', loginLimiter, h(authCtrl.login));

  // --- Autenticadas: usuario (admin) o tablet ---
  router.use(auth);

  // Lectura del inventario: también desde la tablet.
  router.get('/categories', h(catalog.listCategories));
  router.get('/products', h(catalog.listProducts));
  router.get('/products/:id', h(catalog.getProduct));
  router.get('/movements', h(movements.list));
  router.get('/stats/top-withdrawers', h(movements.topWithdrawers));
  router.get('/dashboard/summary', h(movements.dashboard));

  // Solo tablet. Además del bloqueo por persona (5 PIN incorrectos), límite de peticiones por tablet.
  const kioskLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => `kiosk:${req.kioskDevice?.id ?? 'unknown'}`,
    skip: () => env.NODE_ENV === 'test',
    message: {
      error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas operaciones seguidas; espera un momento' },
    },
  });
  router.get('/kiosk/me', requireKiosk, h(kiosk.me));
  router.get('/kiosk/people', requireKiosk, h(kiosk.people));
  router.post('/kiosk/movements', requireKiosk, kioskLimiter, h(kiosk.registerMovements));
  router.post('/kiosk/people/:id/pin', requireKiosk, kioskLimiter, h(kiosk.changePin));

  // --- Solo usuarios (admin): una tablet no pasa de aquí ---
  router.use(requireUser);
  router.get('/auth/me', h(authCtrl.me));

  router.get('/kiosk/devices', admin, h(kiosk.list));
  router.post('/kiosk/devices', admin, h(kiosk.pair));
  router.delete('/kiosk/devices/:id', admin, h(kiosk.revoke));

  router.get('/users/options', h(users.options));
  router.get('/users', admin, h(users.list));
  router.post('/users', admin, h(users.register));
  router.patch('/users/:id', admin, h(users.update));

  router.get('/people', admin, h(people.list));
  router.post('/people', admin, h(people.register));
  router.patch('/people/:id', admin, h(people.update));
  router.post('/people/:id/pin', admin, h(people.resetPin));

  router.post('/categories', admin, h(catalog.createCategory));
  router.post('/products', admin, h(catalog.createProduct));
  router.patch('/products/:id', admin, h(catalog.updateProduct));

  router.post('/movements/in', h(movements.stockIn));
  router.post('/movements/out', h(movements.stockOut));

  router.get('/funding-periods', h(funding.list));
  router.get('/funding-periods/current', h(funding.current));
  router.get('/funding-periods/:id', h(funding.detail));
  router.post('/funding-periods', admin, h(funding.open));
  router.patch('/funding-periods/:id/close', admin, h(funding.close));
  router.post('/funding-periods/:id/contributions', admin, h(funding.contribute));

  router.get('/purchases', h(purchases.list));
  router.get('/purchases/:id', h(purchases.detail));
  router.get('/purchases/:id/receipt', h(purchases.receipt));
  router.post('/purchases', admin, receiptUpload, h(purchases.register));
  router.post('/purchases/:id/void', admin, h(purchases.void));

  router.get('/reports/spending-by-product', h(reports.byProduct));
  router.get('/reports/spending-by-category', h(reports.byCategory));
  router.get('/reports/price-history/:productId', h(reports.priceHistory));

  return router;
}
