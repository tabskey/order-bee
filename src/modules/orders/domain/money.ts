export function toCents(reais: number): number {
  return Math.round(reais * 100);
}

export function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2);
}
