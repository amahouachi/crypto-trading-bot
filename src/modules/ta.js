const moment = require('moment');
const ta = require('../utils/technical_analysis');
const Ticker = require('../dict/ticker');

module.exports = class Ta {
  constructor(candlestickRepository, instances, tickers) {
    this.instances = instances;
    this.candlestickRepository = candlestickRepository;
    this.tickers = tickers;
  }

  periodToMinutes(period){
    switch (period) {
      case '15m':
        return 15;
      case '1h':
        return 60;
      case '4h':
        return 4*60;
      case '1d':
        return 24*60;
      default:
        return 1;
    }
  }

  getTaForPeriods(periods) {
    return new Promise(resolve => {
      const promises = [];

      // filter same pair on different exchanges; last wins
      const uniqueSymbols = {};
      this.instances.symbols.forEach(symbol => {
        uniqueSymbols[symbol.symbol] = symbol;
      });

      Object.values(uniqueSymbols).forEach(symbol => {
        periods.forEach(period => {
          promises.push(
            new Promise(async resolve => {
              const candles = await this.candlestickRepository.getLookbacksForPair(
                symbol.exchange,
                symbol.symbol,
                period,
                26
              );

              if (candles.length === 0) {
                resolve();
                return;
              }

              const rangeMin = moment()
                .subtract(24, 'hours')
                .subtract(35, 'minutes')
                .unix();
              const rangeMax = moment()
                .subtract(24, 'hours')
                .add(35, 'minutes')
                .unix();

              const dayCandle = candles.find(candle => candle.time > rangeMin && candle.time < rangeMax);

              let change;
              if (dayCandle) {
                change = 100 * (candles[0].close / dayCandle.close) - 100;
              }

              ta.getPredefinedIndicators(candles.slice().reverse()).then(result => {
                resolve({
                  symbol: symbol.symbol,
                  exchange: symbol.exchange,
                  period: period,
                  ta: result,
                  ticker: new Ticker(symbol.exchange, symbol.symbol, undefined, candles[0].close, candles[0].close),
                  percentage_change: change
                });
              });
            })
          );
        });
      });

      Promise.all(promises).then(values => {
        const v = values.filter(value => {
          return value !== undefined;
        });

        const x = {};

        v.forEach(v => {
          if (!x[v.symbol]) {
            const liveTicker = this.tickers.get(v.exchange, v.symbol);
            x[v.symbol] = {
              symbol: v.symbol,
              exchange: v.exchange,
              ticker: liveTicker || v.ticker,
              ta: {},
              percentage_change: v.percentage_change
            };
          }

          // flat indicator list
          const values = {};

          for (const key in v.ta) {
            const taResult = v.ta[key];

            values[key] = {
              value: taResult[taResult.length - 1]
            };

            if (key == 'macd') {
              const r = taResult.slice();

              values[key].trend = ta.getTrendingDirectionLastItem(r.slice(-2).map(v => v.histogram));

              const number = ta.getCrossedSince(r.map(v => v.histogram));

              if (number) {
                values[key].crossed = number * this.periodToMinutes(v.period);
                values[key].crossed_index = number;
              }
            } else if (key == 'ao') {
              const r = taResult.slice();

              values[key].trend = ta.getTrendingDirectionLastItem(r.slice(-2));

              const number = ta.getCrossedSince(r);

              if (number) {
                values[key].crossed = number * this.periodToMinutes(v.period);
                values[key].crossed_index = number;
              }
            } else if (key == 'bollinger_bands') {
              values[key].percent =
                values[key].value && values[key].value.upper && values[key].value.lower
                  ? ta.getBollingerBandPercent(
                      (v.ticker.ask + v.ticker.bid) / 2,
                      values[key].value.upper,
                      values[key].value.lower
                    ) * 100
                  : null;
            } else if (
              key == 'ema_21' ||
              key == 'ema_9' ||
              key == 'cci' ||
              key == 'rsi' ||
              key == 'ao' ||
              key == 'mfi'
            ) {
              values[key].trend = ta.getTrendingDirection(
                taResult
                  .slice()
                  .reverse()
                  .slice(-5)
              );
            }
          }

          x[v.symbol].ta[v.period] = values;
        });

        resolve({
          rows: x,
          periods: periods
        });
      });
    });
  }
};
