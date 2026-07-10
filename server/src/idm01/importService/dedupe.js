export function dedupeRecords(candidates) {
  const seen = new Set();
  const accepted = [];
  const duplicateRejections = [];

  for (const { index, record } of candidates) {
    if (seen.has(record.serialNo)) {
      duplicateRejections.push({
        index,
        serialNo: record.serialNo,
        reason: "DUPLICATE_SERIAL"
      });
      continue;
    }

    seen.add(record.serialNo);
    accepted.push({ index, record });
  }

  return { accepted, duplicateRejections };
}
