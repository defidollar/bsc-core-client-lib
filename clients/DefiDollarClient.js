const Web3 = require("web3");

const IERC20 = require("../artifacts/ERC20Detailed.json");
const IPeak = require("../artifacts/NervePeak.json");
const zap = require("../artifacts/NerveZap.json");
const Core = require("../artifacts/Core.json");

const utils = require("./utils");
const Web3Client = require("./Web3Client");
const ClientBase = require("./ClientBase");

const { toBN, toWei } = utils;

class DefiDollarClient extends ClientBase {
  constructor(web3, config) {
    super(config);
    web3 = web3 || new Web3();
    this.web3Client = new Web3Client(web3);
    this.config = config;
    this.NervePeak = this.config.contracts.peaks.NervePeak;
    this.IERC20 = new web3.eth.Contract(IERC20.abi);
    this.peak = new web3.eth.Contract(IPeak.abi, this.NervePeak.address);
    this.zap = new web3.eth.Contract(zap.abi, this.NervePeak.zap);
    this.core = new web3.eth.Contract(Core.abi, config.contracts.base);
  }

  /**
   * @notice Mint DUSD
   * @dev Don't send values scaled with decimals. The following code will handle it.
   * @param tokens InAmounts in the format { BUSD: '6.1', USDT: '0.2', ... }
   * @param dusdAmount Expected dusd amount not accounting for the slippage
   * @param slippage Maximum allowable slippage 0 <= slippage <= 100 %
   */
  mint(tokens, dusdAmount, slippage, options = {}) {
    this._sanitizeTokens(tokens);
    let txObject;
    // mint with 1 or more of the vanilla coins
    const minDusdAmount = this.adjustForSlippage(
      dusdAmount,
      18,
      slippage
    ).toString();

    txObject = this.zap.methods.mint(
      this._processAmounts(tokens),
      minDusdAmount
    );

    if (!txObject) {
      throw new Error(
        `couldn't find a suitable combination with tokens ${tokens.toString()}`
      );
    }
    return this.web3Client.send(txObject, options);
  }

  /**
   * @notice calcExpectedAmount of DUSD that will be minted or redeemed
   * @dev Don't send values scaled with decimals. The following code will handle it.
   * @param tokens amounts in the format { BUSD: '6.1', USDT: '0.2', ... }
   * @param deposit deposit=true, withdraw=false
   * @return expectedAmount and address of the chosen peak
   */
  async calcExpectedMintAmount(tokens) {
    this._sanitizeTokens(tokens);
    let expectedAmount = await this.zap.methods
      .calcMint(this._processAmounts(tokens))
      .call();
    return { expectedAmount, peak: this.zap.options.address };
  }

  /**
   * @notice Redeem DUSD
   * @dev Don't send values scaled with decimals. The following code will handle it.
   * @param tokens OutAmounts in the format { BUSD: '6.1', USDT: '0.2', ... }
   * @param dusdAmount Expected dusd amount not accounting for the slippage
   * @param slippage Maximum allowable slippage 0 <= slippage <= 100
   */
  redeem(dusdAmount, tokens, slippage, options = {}) {
    this._sanitizeTokens(tokens);
    let txObject;
    dusdAmount = toWei(dusdAmount);
    if (Object.keys(tokens).length === 1) {
      const c = Object.keys(tokens)[0];
      const index = this.NervePeak.coins.findIndex((key) => key === c);
      txObject = this.zap.methods.redeemInSingleCoin(
        dusdAmount,
        index,
        this.adjustForSlippage(
          tokens[c],
          this.config.contracts.tokens[c].decimals,
          slippage
        )
      );
    } else {
      txObject = this.zap.methods.redeem(
        dusdAmount,
        this._processAmounts(tokens).map((a) =>
          this.adjustForSlippage(a, null, slippage)
        )
      );
    }
    return this.web3Client.send(txObject, options);
  }

  async calcExpectedRedeemAmount(dusdAmount, token) {
    dusdAmount = toWei(dusdAmount);
    let txObject;
    if (!token) {
      // all tokens
      txObject = this.zap.methods.calcRedeem(dusdAmount);
    } else if (this.NervePeak.coins.includes(token)) {
      // single stablecoin
      const index = this.NervePeak.coins.findIndex((key) => key === token);
      txObject = this.zap.methods.calcRedeemInSingleCoin(dusdAmount, index);
    } else {
      throw new Error(`Invalid token id ${token} in calcExpectedRedeemAmount`);
    }
    const expectedAmount = await txObject.call();
    return { expectedAmount };
  }

  async ceiling() {
    let { ceiling, amount } = await this.core.methods
      .peaks(this.config.contracts.peaks.NervePeak.address)
      .call();
    ceiling = toBN(ceiling);
    amount = toBN(amount);
    let available = 0;
    if (ceiling.gt(amount)) {
      available = ceiling.sub(amount).toString();
    }
    return { ceiling: ceiling.toString(), available };
  }

  // ##### Common Functions #####

  /**
   * @notice balanceOf
   * @param token Contract address or supported token ids DAI, USDC, USDT ...
   * @param account Account
   * @return balance
   */
  async balanceOf(token, account) {
    token = this._processTokenId(token);
    this.IERC20.options.address = token;
    if (!this.IERC20.options.address) {
      throw new Error(`tokenId ${tokenId} is not supported`);
    }
    return this.IERC20.methods.balanceOf(account).call();
  }

  /**
   * @notice approve
   * @param token ERC20 token contract
   * @param spender Spender
   * @param amount Amount Pass without having accounted for decimals
   * @param decimals Decimals to scale the amount with. Otherwise send null
   */
  async approve(token, spender, amount, decimals, options = {}) {
    token = this._processTokenId(token);
    this.IERC20.options.address = token;
    if (!this.IERC20.options.address)
      throw new Error(`tokenId ${tokenId} is not known`);
    const txObject = this.IERC20.methods.approve(
      spender,
      decimals ? utils.scale(amount, decimals).toString() : amount.toString()
    );
    return this.web3Client.send(txObject, options);
  }

  allowance(token, account, spender) {
    token = this._processTokenId(token);
    this.IERC20.options.address = token;
    return this.IERC20.methods.allowance(account, spender).call();
  }

  _processTokenId(token) {
    return token.slice(0, 2) !== "0x"
      ? this.config.contracts.tokens[token].address
      : token;
  }
}

module.exports = DefiDollarClient;
