// The last picture replacements of this browser session, so one click can bring the previous picture back.
// A record holds every change one import made: {uuid, path, before, after} per document and data path.
// Kept in memory only. Reloading the page forgets them.

const DEFAULT_LIMIT_PER_DOCUMENT = 5;
const DEFAULT_LIMIT_TOTAL = 30;

// One change of a document picture. Null when nothing changes.
function describeChange(uuid, path, before, after) {
  const from = (before === undefined) ? null : before;
  if ( !uuid || !path || (from === after) ) return null;
  return {uuid, path, before: from, after};
}

function createUndoJournal({limitPerDocument = DEFAULT_LIMIT_PER_DOCUMENT, limitTotal = DEFAULT_LIMIT_TOTAL} = {}) {
  let records = [];
  let counter = 0;

  const trim = () => {
    // Per document the newest records stay, a record that no document keeps is dropped
    const seen = new Map();
    const keep = new Set();
    for ( const record of [...records].reverse() ) {
      let kept = false;
      for ( const uuid of record.uuids ) {
        const count = seen.get(uuid) ?? 0;
        if ( count < limitPerDocument ) kept = true;
        seen.set(uuid, count + 1);
      }
      if ( kept ) keep.add(record.id);
    }
    records = records.filter(record => keep.has(record.id)).slice(-limitTotal);
  };

  return {
    // Adds a record of changes (see describeChange). Returns null without a change.
    record({label = "", kind = "", changes = []} = {}) {
      const list = changes.filter(Boolean);
      if ( !list.length ) return null;
      const record = {
        id: ++counter,
        label,
        kind,
        time: Date.now(),
        changes: list,
        uuids: [...new Set(list.map(change => change.uuid))]
      };
      records.push(record);
      trim();
      return record;
    },
    // Newest first
    forDocument(uuid) {
      return records.filter(record => record.uuids.includes(uuid)).reverse();
    },
    latestFor(uuid) {
      return this.forDocument(uuid)[0] ?? null;
    },
    latest() {
      return records.at(-1) ?? null;
    },
    get(id) {
      return records.find(record => record.id === id) ?? null;
    },
    // Takes a record out, for example after it was restored
    remove(id) {
      records = records.filter(record => record.id !== id);
    },
    clear() {
      records = [];
    },
    get size() {
      return records.length;
    }
  };
}

export {DEFAULT_LIMIT_PER_DOCUMENT, DEFAULT_LIMIT_TOTAL, createUndoJournal, describeChange};
