import {
  AdminSafetyPolicy,
  AuthenticateKioskDeviceUseCase,
  KioskRegisterMovementsUseCase,
  ListKioskDevicesUseCase,
  ListKioskPeopleUseCase,
  PairKioskDeviceUseCase,
  RevokeKioskDeviceUseCase,
  CloseFundingPeriodUseCase,
  ConsumptionChargeGenerator,
  GenerateConsumptionChargesUseCase,
  GetPeriodChargesUseCase,
  ListPendingChargesUseCase,
  PayConsumptionChargeUseCase,
  CreateCategoryUseCase,
  CreateProductUseCase,
  GetCurrentFundingPeriodUseCase,
  GetCurrentUserUseCase,
  GetDashboardSummaryUseCase,
  GetFundingPeriodDetailUseCase,
  GetProductPriceHistoryUseCase,
  GetProductUseCase,
  GetPurchaseReceiptUseCase,
  GetPurchaseUseCase,
  GetSpendingByCategoryUseCase,
  GetSpendingByProductUseCase,
  GetTopWithdrawersUseCase,
  GetPeopleActivityUseCase,
  ComputePeriodRankingUseCase,
  GetLatestPeriodRankingUseCase,
  GetPeriodRankingUseCase,
  ListRankingPeriodsUseCase,
  ListCategoriesUseCase,
  ListFundingPeriodsUseCase,
  ListMovementsUseCase,
  ListProductsUseCase,
  ListPurchasesUseCase,
  ListUserOptionsUseCase,
  ListPeopleUseCase,
  ListUsersUseCase,
  LoginUseCase,
  OpenFundingPeriodUseCase,
  PinVerifier,
  PinIdentifier,
  ChangeOwnPinByPinUseCase,
  RegisterPersonUseCase,
  ResetPersonPinUseCase,
  ChangeOwnPinUseCase,
  UpdatePersonUseCase,
  RegisterContributionUseCase,
  RegisterPurchaseUseCase,
  RegisterStockInUseCase,
  RegisterStockOutUseCase,
  RegisterAdminUseCase,
  SetUserActiveUseCase,
  StockMovementRecorder,
  UpdateProductUseCase,
  UpdateUserUseCase,
  VoidPurchaseUseCase,
} from '../../application';
import { createLogger } from '../logging/logger';
import { createPrismaClient } from '../persistence/prisma/prismaClient';
import { PrismaUnitOfWork } from '../persistence/prisma/PrismaUnitOfWork';
import { PrismaCategoryRepository } from '../persistence/prisma/repositories/PrismaCategoryRepository';
import { PrismaConsumptionChargeRepository } from '../persistence/prisma/repositories/PrismaConsumptionChargeRepository';
import { PrismaContributionRepository } from '../persistence/prisma/repositories/PrismaContributionRepository';
import { PrismaKioskDeviceRepository } from '../persistence/prisma/repositories/PrismaKioskDeviceRepository';
import { PrismaFundingPeriodRepository } from '../persistence/prisma/repositories/PrismaFundingPeriodRepository';
import { PrismaPeriodRankingRepository } from '../persistence/prisma/repositories/PrismaPeriodRankingRepository';
import { PrismaMovementRepository } from '../persistence/prisma/repositories/PrismaMovementRepository';
import { PrismaProductRepository } from '../persistence/prisma/repositories/PrismaProductRepository';
import { PrismaPurchaseRepository } from '../persistence/prisma/repositories/PrismaPurchaseRepository';
import { PrismaSpendingReportReader } from '../persistence/prisma/repositories/PrismaSpendingReportReader';
import { PrismaUserRepository } from '../persistence/prisma/repositories/PrismaUserRepository';
import { BcryptPasswordHasher } from '../security/BcryptPasswordHasher';
import { JwtTokenService } from '../security/JwtTokenService';
import { LocalFileStorage } from '../storage/LocalFileStorage';
import { SystemClock } from '../system/SystemClock';
import { UuidGenerator } from '../system/UuidGenerator';
import type { Env } from './env';

/**
 * Composition root: el único lugar que conoce las implementaciones concretas.
 * Los casos de uso solo reciben interfaces (puertos) por constructor (DIP).
 */
export function createContainer(env: Env) {
  const logger = createLogger(env);
  const prisma = createPrismaClient(env.DATABASE_URL);

  // Adaptadores de salida
  const clock = new SystemClock();
  const ids = new UuidGenerator();
  const hasher = new BcryptPasswordHasher(env.BCRYPT_ROUNDS);
  const tokens = new JwtTokenService(env.JWT_SECRET, env.JWT_EXPIRES_IN);
  const storage = new LocalFileStorage(env.UPLOADS_DIR);
  const uow = new PrismaUnitOfWork(prisma);

  const users = new PrismaUserRepository(prisma);
  const categories = new PrismaCategoryRepository(prisma);
  const products = new PrismaProductRepository(prisma);
  const movements = new PrismaMovementRepository(prisma);
  const periods = new PrismaFundingPeriodRepository(prisma);
  const contributions = new PrismaContributionRepository(prisma);
  const purchases = new PrismaPurchaseRepository(prisma);
  const reports = new PrismaSpendingReportReader(prisma);
  const kioskDevices = new PrismaKioskDeviceRepository(prisma);
  const rankings = new PrismaPeriodRankingRepository(prisma);
  const timeZone = env.APP_TIMEZONE;

  // Servicios de aplicación compartidos
  const recorder = new StockMovementRecorder(ids);
  const adminSafety = new AdminSafetyPolicy(users);
  const pinVerifier = new PinVerifier(hasher, clock);
  const pinIdentifier = new PinIdentifier(users, kioskDevices, hasher, clock);
  const chargeGenerator = new ConsumptionChargeGenerator(ids, env.APP_TIMEZONE);
  const charges = new PrismaConsumptionChargeRepository(prisma);

  const getPeriodCharges = new GetPeriodChargesUseCase(periods, movements, charges, users, env.APP_TIMEZONE);

  const useCases = {
    login: new LoginUseCase(users, hasher, tokens),
    getCurrentUser: new GetCurrentUserUseCase(users),

    registerAdmin: new RegisterAdminUseCase(users, hasher, ids, clock),
    listUsers: new ListUsersUseCase(users),
    listUserOptions: new ListUserOptionsUseCase(users),
    updateUser: new UpdateUserUseCase(users, hasher, clock),
    setUserActive: new SetUserActiveUseCase(users, adminSafety, clock),

    registerPerson: new RegisterPersonUseCase(users, hasher, ids, clock),
    updatePerson: new UpdatePersonUseCase(users, clock),
    resetPersonPin: new ResetPersonPinUseCase(users, hasher, clock),
    listPeople: new ListPeopleUseCase(users, clock),
    changeOwnPin: new ChangeOwnPinUseCase(users, pinVerifier, hasher, clock),
    changeOwnPinByPin: new ChangeOwnPinByPinUseCase(users, pinIdentifier, hasher, clock),

    pairKioskDevice: new PairKioskDeviceUseCase(kioskDevices, users, tokens, ids, clock),
    listKioskDevices: new ListKioskDevicesUseCase(kioskDevices, users),
    revokeKioskDevice: new RevokeKioskDeviceUseCase(kioskDevices, users, clock),
    authenticateKioskDevice: new AuthenticateKioskDeviceUseCase(kioskDevices, clock),
    listKioskPeople: new ListKioskPeopleUseCase(users, clock),
    kioskRegisterMovements: new KioskRegisterMovementsUseCase(
      uow,
      users,
      pinVerifier,
      pinIdentifier,
      recorder,
      clock,
    ),

    createCategory: new CreateCategoryUseCase(categories, ids, clock),
    listCategories: new ListCategoriesUseCase(categories),

    createProduct: new CreateProductUseCase(uow, categories, recorder, ids, clock),
    updateProduct: new UpdateProductUseCase(products, categories, clock),
    listProducts: new ListProductsUseCase(products, purchases, clock),
    getProduct: new GetProductUseCase(products, movements),

    registerStockIn: new RegisterStockInUseCase(uow, recorder, clock),
    registerStockOut: new RegisterStockOutUseCase(uow, recorder, clock),
    listMovements: new ListMovementsUseCase(movements),
    getTopWithdrawers: new GetTopWithdrawersUseCase(movements, periods, clock, timeZone),
    getPeopleActivity: new GetPeopleActivityUseCase(movements, periods, timeZone),
    computePeriodRanking: new ComputePeriodRankingUseCase(
      periods,
      movements,
      rankings,
      users,
      kioskDevices,
      clock,
      timeZone,
    ),
    getPeriodRanking: new GetPeriodRankingUseCase(periods, rankings, users, kioskDevices, clock, timeZone),
    getLatestPeriodRanking: new GetLatestPeriodRankingUseCase(periods, rankings, users, kioskDevices),
    listRankingPeriods: new ListRankingPeriodsUseCase(periods, rankings, clock, timeZone),

    openFundingPeriod: new OpenFundingPeriodUseCase(periods, ids, clock),
    closeFundingPeriod: new CloseFundingPeriodUseCase(uow, chargeGenerator, clock),
    listFundingPeriods: new ListFundingPeriodsUseCase(periods),
    getCurrentFundingPeriod: new GetCurrentFundingPeriodUseCase(periods),
    getFundingPeriodDetail: new GetFundingPeriodDetailUseCase(periods, contributions, purchases),
    registerContribution: new RegisterContributionUseCase(periods, users, contributions, ids, clock),
    getPeriodCharges,
    generateConsumptionCharges: new GenerateConsumptionChargesUseCase(
      uow,
      chargeGenerator,
      getPeriodCharges,
      clock,
    ),
    listPendingCharges: new ListPendingChargesUseCase(charges),
    payConsumptionCharge: new PayConsumptionChargeUseCase(periods, charges, contributions, ids, clock),

    registerPurchase: new RegisterPurchaseUseCase(uow, recorder, storage, ids, clock),
    voidPurchase: new VoidPurchaseUseCase(uow, recorder, clock),
    listPurchases: new ListPurchasesUseCase(purchases),
    getPurchase: new GetPurchaseUseCase(purchases, users, products),
    getPurchaseReceipt: new GetPurchaseReceiptUseCase(purchases, storage),

    getSpendingByProduct: new GetSpendingByProductUseCase(reports),
    getSpendingByCategory: new GetSpendingByCategoryUseCase(reports),
    getProductPriceHistory: new GetProductPriceHistoryUseCase(reports, products),

    getDashboardSummary: new GetDashboardSummaryUseCase(products, movements, periods, clock),
  };

  return {
    env,
    logger,
    tokens,
    useCases,
    services: { pinVerifier },
    /** Verifica que la base de datos responda (para /api/health). */
    async checkDatabase(): Promise<boolean> {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
      } catch {
        return false;
      }
    },
    async close(): Promise<void> {
      await prisma.$disconnect();
    },
  };
}

export type Container = ReturnType<typeof createContainer>;
export type UseCases = Container['useCases'];
