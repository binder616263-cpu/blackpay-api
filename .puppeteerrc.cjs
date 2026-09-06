const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Yeh Chrome ko project ke andar save karega taaki Render delete na kare
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};