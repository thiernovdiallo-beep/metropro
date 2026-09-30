export function insertId(result: unknown): number {
  if (Array.isArray(result) && result[0] && typeof result[0] === "object" && "insertId" in result[0]) {
    return Number((result[0] as { insertId: number }).insertId);
  }
  if (result && typeof result === "object" && "insertId" in result) {
    return Number((result as { insertId: number }).insertId);
  }
  throw new Error("Could not read insert id");
}

export function affectedRows(result: unknown): number {
  if (Array.isArray(result) && result[0] && typeof result[0] === "object" && "affectedRows" in result[0]) {
    return Number((result[0] as { affectedRows: number }).affectedRows);
  }
  if (result && typeof result === "object" && "affectedRows" in result) {
    return Number((result as { affectedRows: number }).affectedRows);
  }
  return 0;
}
