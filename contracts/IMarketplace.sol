//SPDX-License-Identifier: Unlicense
pragma solidity =0.8.4;

interface IMarketplace {
  event CurrencyAdded(address currency);

  event MarketCreated(
    address indexed token,
    string name,
    address creator,
    uint256 fee,
    uint256 creatorFee,
    uint256 reflectionFee
  );

  event MarketFeeChanged(
    address indexed token,
    uint256 fee,
    uint256 creatorFee,
    uint256 reflectionFee
  );

  event MarketStateChanged(address indexed token, bool isActive);

  event SellOrderCreated(
    address indexed token,
    uint256 indexed tokenId,
    address indexed seller,
    address currency,
    uint256 price
  );

  event SellOrderCanceled(address indexed token, uint256 indexed tokenId);

  event Sale(
    address indexed token,
    uint256 indexed tokenId,
    address indexed buyer,
    address currency,
    uint256 price
  );

  event AuctionCreated(
    address indexed token,
    uint256 indexed tokenId,
    address indexed seller,
    address currency,
    uint256 initialBid,
    uint256 endsAt
  );

  event AuctionBid(
    address indexed token,
    uint256 indexed tokenId,
    address indexed bidder,
    uint256 amount
  );

  event AuctionEnd(address indexed token, uint256 indexed tokenId);

  event AuctionSale(
    address indexed token,
    uint256 indexed tokenId,
    address indexed bidder,
    uint256 amount
  );

  event AuctionInitialBidUpdated(
    address indexed token,
    uint256 indexed tokenId,
    uint256 initialBid
  );

  event Withdraw(
    address indexed user,
    address indexed currency,
    uint256 amount
  );

  event WithdrawNft(
    address indexed user,
    address indexed token,
    uint256 indexed tokenId
  );

  function addCurrency(address currency) external;

  function acceptsCurrency(address curreny) external view returns (bool);

  // function getReflectionFeeIndex(address currency)
  //   external
  //   view
  //   returns (uint256);

  function createMarket(
    address token,
    string memory name,
    address creator,
    uint256 fee,
    uint256 creatorFee,
    uint256 reflectionFee
  ) external;

  struct MarketView {
    address token;
    string name;
    bool isActive;
    address creator;
    uint256 fee;
    uint256 creatorFee;
    uint256 reflectionFee;
  }

  function getMarket(address token) external view returns (MarketView memory);

  function setMarketFee(
    address token,
    uint256 fee,
    uint256 creatorFee,
    uint256 reflectionFee
  ) external;

  function setMarketState(address token, bool active) external;

  struct SellOrderView {
    address token;
    uint256 tokenId;
    address seller;
    address currency;
    uint256 price;
  }

  function getSellOrder(address token, uint256 tokenId)
    external
    view
    returns (SellOrderView memory);

  function sell(
    address token,
    uint256 tokenId,
    address currency,
    uint256 price
  ) external;

  function cancelSell(address token, uint256 tokenId) external;

  function buy(
    address token,
    uint256 tokenId,
    address currency,
    uint256 value
  ) external payable;

  function createAuction(
    address token,
    uint256 tokenId,
    address currency,
    uint256 initialBid,
    uint256 duration
  ) external;

  function updateAuctionInitialBid(
    address token,
    uint256 tokenId,
    uint256 initialBid
  ) external;

  struct AuctionView {
    address token;
    uint256 tokenId;
    address seller;
    bool ended;
    uint256 endsAt;
    address currency;
    address highestBidder;
    uint256 highestBid;
  }

  function getAuction(address token, uint256 tokenId)
    external
    view
    returns (AuctionView memory);

  function endAuction(address token, uint256 tokenId) external;

  struct BidView {
    address bidder;
    uint256 amount;
  }

  function bid(
    address token,
    uint256 tokenId,
    uint256 value
  ) external payable;

  function getHighestBid(address token, uint256 tokenId)
    external
    view
    returns (BidView memory);

  function getBalance(address user, address curency)
    external
    view
    returns (uint256);

  function withdraw(address currency) external returns (uint256);

  function getNftOwner(address token, uint256 tokenId)
    external
    view
    returns (address);

  function withdrawNft(address token, uint256 tokenId) external;

  function getFeesBalance(address currency) external view returns (uint256);

  function withdrawDevFees(address currency) external returns (uint256);

  function reflectionFeesCollector() external view returns (address);

  function getRelectionFeesBalance(address currency)
    external
    view
    returns (uint256);

  function withdrawReflectionFees(address currency) external returns (uint256);
}
