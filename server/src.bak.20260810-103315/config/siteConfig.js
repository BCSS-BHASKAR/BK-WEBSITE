const path = require("path");

const SITE_CONFIG = require(path.join(__dirname, "../../../config/site.config.json"));

const SITE_TIMEZONE = SITE_CONFIG.timezone.display.iana;
const DB_TIMEZONE = SITE_CONFIG.timezone.db.iana;

module.exports = {
  SITE_CONFIG,
  SITE_TIMEZONE,
  DB_TIMEZONE,
};
