const Web3 = require("web3");

const toBN = Web3.utils.toBN;
const toWei = Web3.utils.toWei;
const _1e18 = toBN(10).pow(toBN(18));

const TEN_THOUSAND = toBN(10000);

function scale(num, decimals) {
  num = toBN(toWei(num.toString()));
  if (decimals < 18) {
    num = num.div(toBN(10).pow(toBN(18 - decimals)));
  } else if (decimals > 18) {
    num = num.mul(toBN(10).pow(toBN(decimals - 18)));
  }
  return num;
}

module.exports = {
  scale,
  toWei,
  toBN,
  _1e18,
  TEN_THOUSAND,
  ZEROAddress: "0x0000000000000000000000000000000000000000",
};
