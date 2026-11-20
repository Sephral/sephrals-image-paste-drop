// The quiet first hint for a GM who installed the module but never used it. States of the world setting `firstHint`:
// "" nothing yet, "shown" the hint was shown, "used" the first import happened. Only the first state shows the hint.

const FIRST_HINT_STATES = Object.freeze({NONE: "", SHOWN: "shown", USED: "used"});

function shouldShowFirstHint({isGM = false, state = "", usedBefore = false} = {}) {
  if ( !isGM || usedBefore ) return false;
  return (state ?? "") === FIRST_HINT_STATES.NONE;
}

// What the state becomes at an import. Never goes back.
function stateAfterImport() {
  return FIRST_HINT_STATES.USED;
}

export {FIRST_HINT_STATES, shouldShowFirstHint, stateAfterImport};
