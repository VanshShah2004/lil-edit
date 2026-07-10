// Fixed age-range → letter-size mapping for the sizing chart. Not admin-editable —
// any row whose sizeFrom/sizeTo/sizeUnit exactly matches one of these ranges gets
// the corresponding letter shown alongside its age label; everything else shows
// just the age.
const AGE_TO_ALPHA: Record<string, string> = {
  "6-7-Years": "XS",
  "7-8-Years": "S",
  "8-9-Years": "M",
  "9-10-Years": "L",
  "10-12-Years": "XL",
};

export function alphaSizeForAgeRange(sizeFrom: number, sizeTo: number, sizeUnit: string): string | null {
  return AGE_TO_ALPHA[`${sizeFrom}-${sizeTo}-${sizeUnit}`] ?? null;
}
