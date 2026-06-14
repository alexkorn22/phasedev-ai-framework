export function add(a: number, b: number): number {
  // Bug: should be a + b, but currently it's a - b
  return a - b;
}
