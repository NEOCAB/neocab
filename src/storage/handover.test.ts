import { describe, expect, it } from 'vitest';
import { sampleTransport } from '../domain/sample';
import { decodeHandover, encodeHandover, handoverEmail, HANDOVER_BEGIN, HANDOVER_END } from './handover';

describe('overdracht per e-mail', () => {
  it('codeert en decodeert een volledig transport zonder verlies', async () => {
    const t = sampleTransport();
    const code = await encodeHandover(t, new Date('2026-10-10T08:00:00Z'));
    expect(code.startsWith(`${HANDOVER_BEGIN}\nv1.gz\n`)).toBe(true);
    expect(code.endsWith(HANDOVER_END)).toBe(true);
    expect(code.split('\n').every((l) => l.length <= 76 || l.startsWith('-----'))).toBe(true);
    const { transport, exportedAt } = await decodeHandover(code);
    expect(transport).toEqual(t);
    expect(exportedAt).toBe('2026-10-10T08:00:00.000Z');
  });

  it('leest de code uit een hele, doorgestuurde e-mail met geciteerde regels', async () => {
    const t = sampleTransport();
    const { body } = handoverEmail(t, await encodeHandover(t));
    const forwarded = `Hoi, zie hieronder.\n\n> ${body.split('\n').join('\n> ')}\n\nGroet`;
    const { transport } = await decodeHandover(forwarded);
    expect(transport.id).toBe(t.id);
    expect(transport.measurements.map((m) => m.id)).toEqual(t.measurements.map((m) => m.id));
  });

  it('geeft een duidelijke melding bij ontbrekende of beschadigde code', async () => {
    await expect(decodeHandover('alleen tekst')).rejects.toThrow('Geen overdrachtscode gevonden');
    const code = await encodeHandover(sampleTransport());
    const lines = code.split('\n');
    const broken = [...lines.slice(0, 3), ...lines.slice(5)].join('\n');
    await expect(decodeHandover(broken)).rejects.toThrow('onvolledig of beschadigd');
  });

  it('e-mail bevat onderwerp met naam en patiëntnummer en een waarschuwing over patiëntgegevens', async () => {
    const t = sampleTransport();
    const { subject, body } = handoverEmail(t, await encodeHandover(t));
    expect(subject).toBe('Neo.Cab overdracht – Baby Voorbeeld (fictief), patiëntnummer 0012345');
    expect(body).toContain('Transport importeren');
    expect(body).toContain('patiëntgegevens');
  });
});
