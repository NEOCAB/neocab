import type { Transport } from '../domain/types';

export interface TransportSummary {
  id: string;
  childName: string;
  patientNumber: string;
  referredAt: string | null;
  referringHospital: string;
  updatedAt: string;
}

/**
 * Opslag-abstractie. De eerste versie gebruikt alleen lokale conceptopslag in de browser
 * (`LocalStorageTransportRepository`). Een centrale opslag kan later dezelfde interface implementeren.
 */
export interface TransportRepository {
  list(): TransportSummary[];
  load(id: string): Transport | null;
  save(t: Transport): Transport;
  remove(id: string): void;
}

export function summarize(t: Transport): TransportSummary {
  return {
    id: t.id,
    childName: t.child.name,
    patientNumber: t.child.patientNumber,
    referredAt: t.referral.referredAt,
    referringHospital: t.referral.referringHospital,
    updatedAt: t.updatedAt,
  };
}
