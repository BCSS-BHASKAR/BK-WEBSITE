const path = require("path");

const LANG = require(path.join(__dirname, "../../../config/en.lang.json"));

module.exports = {
  LANG,
  SITE_LABELS: LANG.labels,
  SITE_BRANDING: LANG.branding,
};
