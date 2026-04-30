export function extractItemFromNote(note = '') {
  const text = String(note || '').trim();

  const m = text.match(
    /^(?:Product\s+(?:Update|Copy)\s*:\s*)?\s*(Added?|Deleted?|Updated?|Changed?|Add|Delete|Update|Change)\s*:?\s*(.+)$/i
  );
  if (m) {
    let verb = m[1].toLowerCase();
    if (verb.startsWith('add')) verb = 'added';
    else if (verb.startsWith('delete')) verb = 'deleted';
    else if (verb.startsWith('update')) verb = 'updated';
    else if (verb.startsWith('change')) verb = 'changed';
    return { verb, item: m[2].trim() };
  }

  const anywhere = text.match(/\b(added?|deleted?|updated?|changed?)\b/i);
  if (anywhere) {
    let verb = anywhere[1].toLowerCase();
    if (verb.startsWith('add')) verb = 'added';
    else if (verb.startsWith('delete')) verb = 'deleted';
    else if (verb.startsWith('update')) verb = 'updated';
    else if (verb.startsWith('change')) verb = 'changed';
    return { verb, item: text };
  }

  return { verb: null, item: text };
}
