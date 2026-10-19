import { describe, expect, it } from 'vitest';
import { KioskDevice, ValidationError } from '../../../domain';
import { LATER, NOW } from './fixtures';

const pair = () => KioskDevice.pair({ id: 'k1', name: ' Tablet cocina ', createdBy: 'admin-1', now: NOW });

describe('KioskDevice', () => {
  it('se autoriza activa y sin conexiones', () => {
    const device = pair();
    expect(device.name).toBe('Tablet cocina');
    expect(device.isActive()).toBe(true);
    expect(device.lastSeenAt).toBeNull();
    expect(device.createdBy).toBe('admin-1');
    expect(() => KioskDevice.pair({ id: 'k', name: '', createdBy: 'a', now: NOW })).toThrow(ValidationError);
  });

  it('registra la última conexión como mucho una vez por minuto', () => {
    const device = pair();
    expect(device.markSeen(NOW)).toBe(true);
    expect(device.markSeen(new Date(NOW.getTime() + 30_000))).toBe(false);
    expect(device.lastSeenAt).toBe(NOW);
    expect(device.markSeen(LATER)).toBe(true);
    expect(device.lastSeenAt).toBe(LATER);
  });

  it('se revoca una sola vez y queda quién y cuándo', () => {
    const device = pair();
    device.revoke('admin-2', LATER);
    expect(device.isActive()).toBe(false);
    expect(device.revokedAt).toBe(LATER);
    expect(device.revokedBy).toBe('admin-2');
    expect(() => device.revoke('admin-2', LATER)).toThrow(
      expect.objectContaining({ code: 'DEVICE_ALREADY_REVOKED' }),
    );
  });
});
