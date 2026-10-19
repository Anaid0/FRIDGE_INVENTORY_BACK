import type { PageRequest } from '../../domain';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function toPageRequest(page?: number, pageSize?: number): PageRequest {
  const safePage = Number.isInteger(page) && (page as number) > 0 ? (page as number) : 1;
  const requested =
    Number.isInteger(pageSize) && (pageSize as number) > 0 ? (pageSize as number) : DEFAULT_PAGE_SIZE;
  return { page: safePage, pageSize: Math.min(requested, MAX_PAGE_SIZE) };
}
