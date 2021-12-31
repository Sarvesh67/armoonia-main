//SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ERC721Holder } from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { IMarketplace } from "./IMarketplace.sol";
import { ONE, INITIAL_REFLECTION_INDEX, MAX_FEES, MIN_DURATION, MAX_DURATION, InvalidCurrency } from "./common.sol";
// import "hardhat/console.sol";
error CurrencyAlreadyAdded(address currency);

error MarketAlreadyCreated(address token);
error InvalidMarket(address token);
error MarketInactive(address token);

error AuctionInvalidDuration(uint256 duration);
error AuctionAlreadyCreated(address token, uint256 tokenId);
error InvalidAuction(address token, uint256 tokenId);
error AuctionAlreadyEnded(address token, uint256 tokenId, uint256 endedAt);
error AuctionStillInProgress(address token, uint256 tokenId, uint256 endsAt);

error InvalidBidder(address bidder);
error LowBid(address token, uint256 tokenId, uint256 bid, uint256 highestBid);

error SellOrderAlreadyCreated(address token, uint256 tokenId);
error NotAvailableForSale(address token, uint256 tokenId);
error LowValue(address token, uint256 tokenId, uint256 value, uint256 price);
error OnlySeller(address seller);

error NotNftOwner();

error OnlyReflectionFeeCollector();

contract Marketplace is IMarketplace, ReentrancyGuard, Ownable, ERC721Holder {
  using SafeERC20 for IERC20;

  struct Market {
    bool isMarket;
    bool isActive;
    address creator;
    uint256 fee;
    uint256 creatorFee;
    uint256 reflectionFee;
    string name;
  }

  struct Auction {
    bool isAuction;
    address seller;
    address currency;
    uint256 endsAt;
    uint256 highestBid;
    address highestBidder;
  }

  struct SellOrder {
    bool isOrder;
    address seller;
    address currency;
    uint256 price;
  }

  mapping(address => bool) internal currencies;
  mapping(address => Market) internal markets;

  mapping(address => mapping(uint256 => Auction)) internal auctions;
  mapping(address => mapping(uint256 => SellOrder)) internal sellOrders;

  mapping(address => mapping(address => uint256)) internal balances; // user > currency > balance
  mapping(address => mapping(uint256 => address)) internal nftOwner; // token > tokenId > user

  mapping(address => uint256) internal fees;
  mapping(address => uint256) internal reflectionFees;

  address public override reflectionFeesCollector;

  constructor(address _reflectionFeesCollector) {
    reflectionFeesCollector = _reflectionFeesCollector;
    addCurrency(ONE);
  }

  function acceptsCurrency(address currency)
    public
    view
    override
    returns (bool)
  {
    return currencies[currency];
  }

  function addCurrency(address currency) public override onlyOwner {
    if (currencies[currency]) revert CurrencyAlreadyAdded(currency);
    currencies[currency] = true;
    emit CurrencyAdded(currency);
  }

  function getFeesBalance(address currency)
    external
    view
    override
    returns (uint256)
  {
    return fees[currency];
  }

  function getRelectionFeesBalance(address currency)
    external
    view
    override
    returns (uint256)
  {
    return reflectionFees[currency];
  }

  function createMarket(
    address token,
    string memory name,
    address creator,
    uint256 fee,
    uint256 creatorFee,
    uint256 reflectionFee
  ) external override onlyOwner {
    if (token == address(0)) revert InvalidMarket(token);
    if (markets[token].isMarket) revert MarketAlreadyCreated(token);

    markets[token] = Market({
      isMarket: true,
      isActive: true,
      creator: creator,
      fee: fee,
      creatorFee: creatorFee,
      reflectionFee: reflectionFee,
      name: name
    });

    emit MarketCreated(token, name, creator, fee, creatorFee, reflectionFee);
  }

  function getMarket(address token)
    external
    view
    override
    returns (MarketView memory)
  {
    Market storage market = markets[token];
    if (!market.isMarket) revert InvalidMarket(token);
    return
      MarketView({
        token: token,
        name: market.name,
        isActive: market.isActive,
        creator: market.creator,
        fee: market.fee,
        creatorFee: market.creatorFee,
        reflectionFee: market.reflectionFee
      });
  }

  function setMarketFee(
    address token,
    uint256 fee,
    uint256 creatorFee,
    uint256 reflectionFee
  ) external override onlyOwner {
    if (!markets[token].isMarket) revert InvalidMarket(token);
    require(fee + creatorFee + reflectionFee <= MAX_FEES, "Too much fee");
    markets[token].fee = fee;
    markets[token].creatorFee = creatorFee;
    markets[token].reflectionFee = reflectionFee;

    emit MarketFeeChanged(token, fee, creatorFee, reflectionFee);
  }

  function setMarketState(address token, bool active)
    external
    override
    onlyOwner
  {
    if (!markets[token].isMarket) revert InvalidMarket(token);
    markets[token].isActive = active;
    emit MarketStateChanged(token, active);
  }

  function getSellOrder(address token, uint256 tokenId)
    external
    view
    override
    returns (SellOrderView memory)
  {
    SellOrder memory order = sellOrders[token][tokenId];
    if (!order.isOrder) revert NotAvailableForSale(token, tokenId);
    return
      SellOrderView({
        token: token,
        tokenId: tokenId,
        seller: order.seller,
        currency: order.currency,
        price: order.price
      });
  }

  function sell(
    address token,
    uint256 tokenId,
    address currency,
    uint256 price
  ) external override {
    if (!markets[token].isMarket) revert InvalidMarket(token);
    if (!markets[token].isActive) revert MarketInactive(token);
    if (!currencies[currency]) revert InvalidCurrency(currency);

    SellOrder storage order = sellOrders[token][tokenId];
    if (order.isOrder) revert SellOrderAlreadyCreated(token, tokenId);

    IERC721(token).transferFrom(msg.sender, address(this), tokenId);

    order.isOrder = true;
    order.seller = msg.sender;
    order.currency = currency;
    order.price = price;

    emit SellOrderCreated(token, tokenId, msg.sender, currency, price);
  }

  function cancelSell(address token, uint256 tokenId) external override {
    SellOrder storage order = sellOrders[token][tokenId];
    if (!order.isOrder) revert NotAvailableForSale(token, tokenId);
    address seller = order.seller;
    if (seller != msg.sender) revert OnlySeller(seller);

    delete sellOrders[token][tokenId];

    IERC721(token).transferFrom(address(this), seller, tokenId);

    emit SellOrderCanceled(token, tokenId);
  }

  function buy(
    address token,
    uint256 tokenId,
    address currency,
    uint256 value
  ) external payable override {
    SellOrder storage order = sellOrders[token][tokenId];
    if (!order.isOrder) revert NotAvailableForSale(token, tokenId);
    if (order.currency != currency) revert InvalidCurrency(currency);

    uint256 price = order.price;

    if (currency == ONE) {
      value = msg.value;
    }

    if (price > value) revert LowValue(token, tokenId, value, price);

    if (currency != ONE) {
      IERC20(currency).transferFrom(msg.sender, address(this), price);
    }

    address seller = order.seller;

    delete sellOrders[token][tokenId];

    uint256 change = price - value;
    uint256 amountToSeller = chargeFees(token, currency, price);

    balances[seller][currency] += amountToSeller;

    IERC721(token).transferFrom(address(this), msg.sender, tokenId);
    if (currency == ONE && change > 0) {
      payable(msg.sender).transfer(change);
    }

    emit Sale(token, tokenId, msg.sender, currency, price);
  }

  function getAuction(address token, uint256 tokenId)
    external
    view
    override
    returns (AuctionView memory)
  {
    Auction storage auction = auctions[token][tokenId];
    if (!auction.isAuction) revert InvalidAuction(token, tokenId);

    return
      AuctionView({
        token: token,
        tokenId: tokenId,
        seller: auction.seller,
        ended: block.timestamp >= auction.endsAt,
        endsAt: auction.endsAt,
        currency: auction.currency,
        highestBidder: auction.highestBidder,
        highestBid: auction.highestBid
      });
  }

  function getHighestBid(address token, uint256 tokenId)
    external
    view
    override
    returns (BidView memory)
  {
    Auction storage auction = auctions[token][tokenId];
    if (!auction.isAuction) revert InvalidAuction(token, tokenId);

    return
      BidView({ bidder: auction.highestBidder, amount: auction.highestBid });
  }

  function getBalance(address user, address currency)
    external
    view
    override
    returns (uint256)
  {
    return balances[user][currency];
  }

  function getNftOwner(address token, uint256 tokenId)
    external
    view
    override
    returns (address)
  {
    return nftOwner[token][tokenId];
  }

  function createAuction(
    address token,
    uint256 tokenId,
    address currency,
    uint256 initialBid,
    uint256 duration
  ) external override {
    if (!markets[token].isMarket) revert InvalidMarket(token);
    if (!markets[token].isActive) revert MarketInactive(token);
    if (!currencies[currency]) revert InvalidCurrency(currency);
    if (duration < MIN_DURATION || duration > MAX_DURATION)
      revert AuctionInvalidDuration(duration);

    Auction storage auction = auctions[token][tokenId];

    if (auction.isAuction) revert AuctionAlreadyCreated(token, tokenId);

    IERC721(token).transferFrom(msg.sender, address(this), tokenId);

    uint256 endsAt = block.timestamp + duration;

    auction.isAuction = true;
    auction.seller = msg.sender;
    auction.currency = currency;
    auction.endsAt = endsAt;
    auction.highestBid = initialBid;
    auction.highestBidder = address(0);

    emit AuctionCreated(
      token,
      tokenId,
      msg.sender,
      currency,
      initialBid,
      endsAt
    );
  }

  function bid(
    address token,
    uint256 tokenId,
    uint256 value
  ) external payable override nonReentrant {
    // check if bidder can receive nft?
    Auction storage auction = auctions[token][tokenId];
    if (!auction.isAuction) revert InvalidAuction(token, tokenId);
    if (auction.endsAt <= block.timestamp)
      revert AuctionAlreadyEnded(token, tokenId, auction.endsAt);
    if (msg.sender == auction.seller) revert InvalidBidder(msg.sender);

    address currency = auction.currency;

    if (currency == ONE) {
      value = msg.value;
    } else {
      IERC20(currency).transferFrom(msg.sender, address(this), value);
    }

    uint256 highestBid = auction.highestBid;
    address highestBidder = auction.highestBidder;

    if (value <= highestBid) revert LowBid(token, tokenId, value, highestBid);

    if (highestBidder != address(0)) {
      balances[highestBidder][currency] += highestBid;
    }

    auction.highestBidder = msg.sender;
    auction.highestBid = value;

    emit AuctionBid(token, tokenId, msg.sender, value);
  }

  function updateAuctionInitialBid(
    address token,
    uint256 tokenId,
    uint256 initialBid
  ) external override {
    Auction storage auction = auctions[token][tokenId];
    if (!auction.isAuction) revert InvalidAuction(token, tokenId);
    if (auction.endsAt <= block.timestamp)
      revert AuctionAlreadyEnded(token, tokenId, auction.endsAt);
    require(auction.seller == msg.sender, "");
    require(auction.highestBidder == address(0), "");
    auction.highestBid = initialBid;

    emit AuctionInitialBidUpdated(token, tokenId, initialBid);
  }

  function endAuction(address token, uint256 tokenId) external override {
    Auction storage auction = auctions[token][tokenId];

    if (!auction.isAuction) revert InvalidAuction(token, tokenId);

    if (auction.endsAt > block.timestamp)
      revert AuctionStillInProgress(token, tokenId, auction.endsAt);

    address seller = auction.seller;
    uint256 highestBid = auction.highestBid;
    address highestBidder = auction.highestBidder;

    address currency = auction.currency;

    delete auctions[token][tokenId];

    if (highestBidder != address(0)) {
      uint256 value = chargeFees(token, currency, highestBid);

      balances[seller][currency] += value;
      nftOwner[token][tokenId] = highestBidder;

      emit AuctionSale(token, tokenId, highestBidder, highestBid);
    } else {
      nftOwner[token][tokenId] = seller;
    }

    emit AuctionEnd(token, tokenId);
  }

  function chargeFees(
    address token,
    address currency,
    uint256 total
  ) internal returns (uint256) {
    Market storage market = markets[token];
    uint256 fee = (total * market.fee) / 1e18;
    uint256 creatorFee = (total * market.creatorFee) / 1e18;
    uint256 reflectionFee = (total * market.reflectionFee) / 1e18;

    uint256 value = total - fee - creatorFee - reflectionFee;

    fees[currency] += fee;
    balances[market.creator][currency] += creatorFee;
    reflectionFees[currency] += reflectionFee;

    return value;
  }

  function withdraw(address currency)
    external
    override
    nonReentrant
    returns (uint256)
  {
    if (!currencies[currency]) revert InvalidCurrency(currency);
    uint256 balance = balances[msg.sender][currency];
    balances[msg.sender][currency] = 0;
    transferInternal(msg.sender, currency, balance);
    emit Withdraw(msg.sender, currency, balance);
    return balance;
  }

  function withdrawNft(address token, uint256 tokenId)
    external
    override
    nonReentrant
  {
    if (nftOwner[token][tokenId] != msg.sender) revert NotNftOwner();
    nftOwner[token][tokenId] = address(0);
    IERC721(token).transferFrom(address(this), msg.sender, tokenId);
    emit WithdrawNft(msg.sender, token, tokenId);
  }

  function withdrawDevFees(address currency)
    external
    override
    onlyOwner
    returns (uint256)
  {
    if (!currencies[currency]) revert InvalidCurrency(currency);
    uint256 balance = fees[currency];
    fees[currency] = 0;
    transferInternal(msg.sender, currency, balance);
    return balance;
  }

  function withdrawReflectionFees(address currency)
    external
    override
    returns (uint256)
  {
    if (msg.sender != reflectionFeesCollector)
      revert OnlyReflectionFeeCollector();
    if (!currencies[currency]) revert InvalidCurrency(currency);
    uint256 balance = reflectionFees[currency];
    if (balance > 0) {
      reflectionFees[currency] = 0;
      transferInternal(msg.sender, currency, balance);
    }
    return balance;
  }

  function setReflectionFeesCollector(address _reflectionFeesCollector)
    external
    onlyOwner
  {
    reflectionFeesCollector = _reflectionFeesCollector;
  }

  function transferInternal(
    address to,
    address currency,
    uint256 amount
  ) internal {
    if (amount == 0) return;

    if (currency == ONE) {
      payable(to).transfer(amount);
    } else {
      IERC20(currency).safeTransfer(to, amount);
    }
  }
}
