export interface PageRequest {
  page: number; // empieza en 1
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DateRange {
  from?: Date;
  to?: Date;
}
