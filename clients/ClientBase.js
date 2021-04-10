const assert = require("assert").strict;

const utils = require("./utils");

const { toBN, toWei, TEN_THOUSAND } = utils;

class ClientBase {
  constructor(config) {
    this.config = config;
    this.NervePeak = config.contracts.peaks.NervePeak;
  }

  adjustForSlippage(amount, decimals, slippage) {
    slippage = parseFloat(slippage);
    if (isNaN(slippage) || slippage < 0 || slippage > 100) {
      throw new Error(`Invalid slippage value: ${slippage} provided`);
    }
    amount = decimals ? utils.scale(amount, decimals) : toBN(amount);
    if (amount.eq(toBN(0)) || slippage == 0) return amount.toString();
    return toBN(amount)
      .mul(TEN_THOUSAND.sub(toBN(parseFloat(slippage) * 100)))
      .div(TEN_THOUSAND)
      .toString();
  }

  _processAmounts(tokens) {
    Object.keys(tokens).forEach((t) =>
      assert.ok(this.NervePeak.coins.includes(t), "bad coins")
    );
    const inAmounts = new Array(3);
    for (let i = 0; i < this.NervePeak.coins.length; i++) {
      const c = this.NervePeak.coins[i];
      if (tokens[c]) {
        inAmounts[i] = utils
          .scale(tokens[c], this.config.contracts.tokens[c].decimals)
          .toString();
      } else {
        inAmounts[i] = 0;
      }
    }
    return inAmounts;
  }

  _sanitizeTokens(tokens) {
    Object.keys(tokens).forEach((t) => {
      if (!tokens[t] || isNaN(parseFloat(tokens[t]))) delete tokens[t];
    });
  }
}

module.exports = ClientBase;
