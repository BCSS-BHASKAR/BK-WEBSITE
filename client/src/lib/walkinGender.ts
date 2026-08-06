import { pnp } from "./pnpTheme";

// Mirrors the `walkins.gender` ENUM in the database.
export const WALKIN_GENDERS = ["male", "female", "unknown"] as const;

export type WalkinGender = (typeof WALKIN_GENDERS)[number];

export const WALKIN_GENDER_META: Record<WalkinGender, { label: string; color: string; softColor: string }> = {
  male: { label: "Male", color: pnp.primary, softColor: pnp.primarySoft },
  female: { label: "Female", color: pnp.purple, softColor: pnp.purpleSoft },
  unknown: { label: "Not classified", color: pnp.textMuted, softColor: "rgba(15,23,42,0.06)" },
};

export function isWalkinGender(v: unknown): v is WalkinGender {
  return typeof v === "string" && (WALKIN_GENDERS as readonly string[]).includes(v);
}

export function walkinGenderLabel(v: unknown): string {
  return isWalkinGender(v) ? WALKIN_GENDER_META[v].label : "—";
}

export function walkinGenderColor(v: unknown): { color: string; softColor: string } {
  const meta = isWalkinGender(v) ? WALKIN_GENDER_META[v] : WALKIN_GENDER_META.unknown;
  return { color: meta.color, softColor: meta.softColor };
}
