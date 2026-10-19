import { describe, expect, it } from 'vitest';
import { Money, ValidationError } from '../../../domain';

describe('Money', () => {
  it.each([
    ['2500', 250000],
    ['2500.5', 250050],
    ['2500.50', 250050],
    ['0.05', 5],
    [' 10 ', 1000],
    ['-15.25', -1525],
  ])('fromDecimal(%s) = %i centavos', (input, cents) => {
    expect(Money.fromDecimal(input).cents).toBe(cents);
  });

  it('acepta números con máximo 2 decimales', () => {
    expect(Money.fromDecimal(2500.5).cents).toBe(250050);
    expect(Money.fromDecimal(0).isZero()).toBe(true);
  });

  it.each(['abc', '', '1.234', '1,5', '1e3'])('rechaza el texto %j', (input) => {
    expect(() => Money.fromDecimal(input)).toThrow(ValidationError);
  });

  it('rechaza números no finitos o con más de 2 decimales', () => {
    expect(() => Money.fromDecimal(Number.NaN)).toThrow(ValidationError);
    expect(() => Money.fromDecimal(Infinity)).toThrow(ValidationError);
    expect(() => Money.fromDecimal(0.1 + 0.2)).toThrow(ValidationError);
  });

  it('fromCents exige un entero seguro y normaliza -0', () => {
    expect(() => Money.fromCents(1.5)).toThrow(ValidationError);
    expect(Object.is(Money.fromDecimal('-0').cents, 0)).toBe(true);
  });

  it('suma y resta de forma exacta (sin errores de coma flotante)', () => {
    const total = Money.fromDecimal('0.10').add(Money.fromDecimal('0.20'));
    expect(total.toDecimalString()).toBe('0.30');
    expect(Money.fromDecimal('100').subtract(Money.fromDecimal('148')).toDecimalString()).toBe('-48.00');
  });

  it('multiplica solo por enteros', () => {
    expect(Money.fromDecimal('2500').multiply(12).toDecimalString()).toBe('30000.00');
    expect(() => Money.fromDecimal('1').multiply(1.5)).toThrow(ValidationError);
  });

  it('sum de una lista vacía es 0', () => {
    expect(Money.sum([]).isZero()).toBe(true);
    expect(Money.sum([Money.fromDecimal('1.5'), Money.fromDecimal('2.25')]).toDecimalString()).toBe('3.75');
  });

  it('comparaciones y conversiones', () => {
    const money = Money.fromDecimal('-3.07');
    expect(money.isNegative()).toBe(true);
    expect(money.isPositive()).toBe(false);
    expect(money.toNumber()).toBe(-3.07);
    expect(money.toDecimalString()).toBe('-3.07');
    expect(JSON.stringify({ money })).toBe('{"money":"-3.07"}');
    expect(money.equals(Money.fromCents(-307))).toBe(true);
  });
});
