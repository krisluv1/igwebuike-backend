const { str } = require("./validators");
const { normalizeSkills } = require("./jobRules");

// Profile fields used for job matching. Only fields present in the body are changed.
function validateProfileUpdate(body = {}) {
  const errors = [], value = {};
  if (body.skills !== undefined) {
    const s = normalizeSkills(body.skills);
    if (s === null) errors.push("Skills must be at most 15 short items (letters, digits, + # . -).");
    else value.skills = s;
  }
  if (body.occupation !== undefined) {
    const o = body.occupation === "" ? "" : str(body.occupation, 80);
    if (o === null) errors.push("Occupation must be at most 80 characters."); else value.occupation = o;
  }
  if (body.bio !== undefined) {
    const b = body.bio === "" ? "" : str(body.bio, 500);
    if (b === null) errors.push("Bio must be at most 500 characters."); else value.bio = b;
  }
  if (!errors.length && !Object.keys(value).length) errors.push("Nothing to update.");
  return errors.length ? { errors } : { value };
}

module.exports = { validateProfileUpdate };
