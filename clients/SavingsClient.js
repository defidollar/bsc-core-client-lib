const Web3 = require("web3");

const zap = require("../artifacts/NerveZap.json");
const ibDUSD = require("../artifacts/ibDUSD.json");
const IERC20 = require("../artifacts/ERC20Detailed.json");

const utils = require("./utils");
const Web3Client = require("./Web3Client");
const ClientBase = require("./ClientBase.js");

const { toBN, toWei, _1e18 } = utils;

class SavingsClient extends ClientBase {
  constructor(web3, config) {
    super(config);
    web3 = web3 || new Web3();
    this.web3Client = new Web3Client(web3);
    this.ibDusd = new web3.eth.Contract(
      ibDUSD.abi,
      config.contracts.tokens.ibDUSD.address
    );
    this.dusd = new web3.eth.Contract(
      IERC20.abi,
      config.contracts.tokens.DUSD.address
    );
    this.zap = new web3.eth.Contract(
      zap.abi,
      this.config.contracts.peaks.NervePeak.zap
    );
  }

  /**
   * @param {*} amount # DUSD to deposit
   * @param {*} options Tx options
   */
  deposit(amount, options = {}) {
    const txObject = this.ibDusd.methods.deposit(toWei(amount.toString()));
    return this.web3Client.send(txObject, options);
  }

  /**
   * @notice Mint DUSD and deposit in savings vault
   * @dev Don't send values scaled with decimals. The following code will handle it.
   * @param {*} tokens InAmounts in the format { BUSD: '6.1', USDT: '0.2', ... }
   * @param {*} dusdAmount Expected dusd amount not accounting for the slippage
   * @param {*} slippage Maximum allowable slippage 0 <= slippage <= 100 %
   */
  mintAndDeposit(tokens, dusdAmount, slippage, options = {}) {
    this._sanitizeTokens(tokens);
    const minDusdAmount = this.adjustForSlippage(
      dusdAmount,
      18,
      slippage
    ).toString();
    const txObject = this.zap.methods.deposit(
      this._processAmounts(tokens),
      minDusdAmount
    );
    return this.web3Client.send(txObject, options);
  }

  /**
   * @param {*} amount ~ # of DUSD to withdraw - NOT Shares. Will be ignored if isMax is provided.
   * @param {*} isMax Whether the user opted to exit completely
   * @param {*} options Tx options
   */
  async withdraw(amount, isMax, options = {}) {
    let shares;
    if (isMax) {
      shares = await this.ibDusd.methods.balanceOf(options.from).call();
    } else {
      shares = utils
        .scale(amount, 36)
        .div(toBN(await this.ibDusd.methods.getPricePerFullShare().call()));
    }
    const txObject = this.ibDusd.methods.withdraw(shares.toString());
    return this.web3Client.send(txObject, options);
  }

  /**
   * @notice ibDusd and DUSD Balance
   * @return { ibDusd, dusd, withdrawable } in wei
   * ibDusd - ibDusd balance
   * withdrawable - dusd withdrawable from the savings ibDusd contract
   * dusd - dusd wallet balance
   */
  async balanceOf(account) {
    const [ibDusd, pricePerFullShare, dusd] = await Promise.all([
      this.ibDusd.methods.balanceOf(account).call(),
      this.ibDusd.methods.getPricePerFullShare().call(),
      this.dusd.methods.balanceOf(account).call(),
    ]);
    return {
      ibDusd,
      withdrawable: toBN(ibDusd).mul(toBN(pricePerFullShare)).div(_1e18),
      dusd,
    };
  }

  /**
   * @notice DUSD allowance for the savings contract
   */
  allowance(account) {
    return this.dusd.methods
      .allowance(account, this.ibDusd.options.address)
      .call();
  }

  /**
   * @notice approve
   * @param amount Amount without having accounted for decimals
   */
  approve(amount, options = {}, trust = false) {
    const txObject = this.dusd.methods.approve(
      this.ibDusd.options.address,
      trust ? amount : toWei(amount.toString())
    );
    return this.web3Client.send(txObject, options);
  }
}

module.exports = SavingsClient;
