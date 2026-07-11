/** Nested location tree: level1 → level2 → level3[] */
export type LocationTree = Record<string, Record<string, string[]>>;

/** Default 2 sub-counties with 2 wards each for any admin level-1 unit */
export function defaultLocationTree(level1Name: string): Record<string, string[]> {
  const central = `${level1Name} Central`;
  const north = `${level1Name} North`;
  return {
    [central]: [`${central} Ward 1`, `${central} Ward 2`],
    [north]: [`${north} Ward 1`],
  };
}

export function buildLocationTree(
  names: readonly string[],
  detailed: LocationTree
): LocationTree {
  const tree: LocationTree = {};
  for (const name of names) {
    tree[name] = detailed[name] ?? defaultLocationTree(name);
  }
  return tree;
}
