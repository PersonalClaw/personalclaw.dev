// The npm range reader the CI checks share: enough of npm's semver to test an exact
// Node version against the engines ranges package-lock.json records. Moved verbatim
// from tests/support/ci-contract.mjs; `satisfies` throws on a form it does not read,
// and every caller reads a throw as unmet. The forms it reads are the ones the lock
// uses: `||`, space-joined comparators, ^, ~, >=, >, <=, <, =, partial versions and *.
function parseVersion(text) {
  const match = /^v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/.exec(text);
  if (!match) throw new Error(`unsupported version ${text}`);
  const part = (value) => (value === undefined || value === "x" || value === "*" ? null : Number(value));
  return [Number(match[1]), part(match[2]), part(match[3])];
}

function compare(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function comparatorSets(range) {
  if (typeof range !== "string" || range.trim() === "") throw new Error("empty range");
  return range.split("||").map((set) => {
    const text = set.trim();
    if (text === "" || text === "*" || text === "x") return [];
    const comparators = [];
    const pattern = /(\^|~|>=|<=|>|<|=)?\s*(v?\d+(?:\.(?:\d+|x|\*)){0,2})(?=\s|$)/y;
    let index = 0;
    while (index < text.length) {
      if (text[index] === " ") {
        index += 1;
        continue;
      }
      pattern.lastIndex = index;
      const match = pattern.exec(text);
      if (!match) throw new Error(`unsupported range ${range}`);
      comparators.push(...expand(match[1] ?? "=", parseVersion(match[2])));
      index = pattern.lastIndex;
    }
    return comparators;
  });
}

function expand(operator, [major, minor, patch]) {
  const low = [major, minor ?? 0, patch ?? 0];
  if (operator === "^") {
    if (major === 0) throw new Error("unsupported ^0 range");
    return [[">=", low], ["<", [major + 1, 0, 0]]];
  }
  if (operator === "~") {
    return [[">=", low], ["<", minor === null ? [major + 1, 0, 0] : [major, minor + 1, 0]]];
  }
  if (operator === "=") {
    if (minor === null) return [[">=", low], ["<", [major + 1, 0, 0]]];
    if (patch === null) return [[">=", low], ["<", [major, minor + 1, 0]]];
    return [[">=", low], ["<=", low]];
  }
  if (operator === "<=" && (minor === null || patch === null)) {
    return [["<", minor === null ? [major + 1, 0, 0] : [major, minor + 1, 0]]];
  }
  if (operator === ">" && (minor === null || patch === null)) {
    return [[">=", minor === null ? [major + 1, 0, 0] : [major, minor + 1, 0]]];
  }
  return [[operator, low]];
}

export function satisfies(version, range) {
  const target = parseVersion(version);
  if (target.includes(null)) throw new Error(`not an exact version ${version}`);
  return comparatorSets(range).some((set) =>
    set.every(([operator, bound]) => {
      const order = compare(target, bound);
      if (operator === ">=") return order >= 0;
      if (operator === ">") return order > 0;
      if (operator === "<=") return order <= 0;
      if (operator === "<") return order < 0;
      throw new Error(`unsupported operator ${operator}`);
    }),
  );
}

// The lowest version a range admits: the smallest lower bound over its sets.
export function rangeFloor(range) {
  const lows = comparatorSets(range).map((set) => {
    if (set.some(([operator]) => operator === ">")) throw new Error("unsupported > floor");
    const bounds = set.filter(([operator]) => operator === ">=").map(([, bound]) => bound);
    return bounds.reduce((high, bound) => (compare(bound, high) > 0 ? bound : high), [0, 0, 0]);
  });
  const floor = lows.reduce((low, bound) => (compare(bound, low) < 0 ? bound : low));
  return floor.join(".");
}
