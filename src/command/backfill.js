const services = require('../modules/services');

module.exports = class BackfillCommand {
  async execute(exchangeName, symbol, period, date) {
    await services.getBackfill().backfill(exchangeName, symbol, period, date);
  }
};
