//SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { IMarketplace } from "./IMarketplace.sol";
import { IHarmoonieRegistry } from "./IHarmoonieRegistry.sol";
import { ONE, INITIAL_REFLECTION_INDEX, InvalidCurrency } from "./common.sol";

// import "hardhat/console.sol";

contract HarmoonieRegistry is ReentrancyGuard, IHarmoonieRegistry {
  using SafeERC20 for IERC20;

  IMarketplace internal immutable marketplace;
  IERC721 internal immutable harmoonies;

  struct Harmoonie {
    bool registered;
    address currency;
    uint256 reflectionFeeDebt;
  }

  mapping(uint256 => Harmoonie) internal registered;
  mapping(address => uint256) internal totalRegisteredByCurrency;
  mapping(address => uint256) internal reflectionFeesIndex;

  constructor(IMarketplace _marketplace, IERC721 _harmoonies) {
    marketplace = _marketplace;
    harmoonies = _harmoonies;
  }

  fallback() external payable {}

  receive() external payable {}

  function getTotalRegisteredByCurrency(address currency)
    external
    view
    override
    returns (uint256)
  {
    if (!marketplace.acceptsCurrency(currency))
      revert InvalidCurrency(currency);
    return totalRegisteredByCurrency[currency];
  }

  function isRegistered(uint256 harmoonieId)
    external
    view
    override
    returns (bool)
  {
    return registered[harmoonieId].registered;
  }

  function getCurrency(uint256 harmoonieId)
    external
    view
    override
    returns (address)
  {
    Harmoonie storage harmoonie = registered[harmoonieId];
    if (!harmoonie.registered) revert HarmoonieNotRegistered(harmoonieId);
    return registered[harmoonieId].currency;
  }

  function getFees(uint256 harmoonieId)
    external
    view
    override
    returns (uint256)
  {
    Harmoonie storage harmoonie = registered[harmoonieId];
    if (!harmoonie.registered) revert HarmoonieNotRegistered(harmoonieId);
    return
      calculateFees(
        calculateFeeIndex(harmoonie.currency),
        harmoonie.reflectionFeeDebt
      );
  }

  function getHarmoonie(uint256 harmoonieId)
    public
    view
    override
    returns (HarmoonieView memory)
  {
    Harmoonie storage harmoonie = registered[harmoonieId];
    return
      HarmoonieView({
        isRegistered: harmoonie.registered,
        currency: harmoonie.currency
      });
  }

  function getHarmoonies(uint256[] memory harmoonieIds)
    external
    view
    override
    returns (HarmoonieView[] memory)
  {
    HarmoonieView[] memory _harmoonies = new HarmoonieView[](
      harmoonieIds.length
    );
    for (uint256 index = 0; index < harmoonieIds.length; index++) {
      _harmoonies[index] = getHarmoonie(harmoonieIds[index]);
    }
    return _harmoonies;
  }

  function getHarmoonieFees(uint256 harmoonieId)
    public
    view
    override
    returns (HarmoonieFeesView memory)
  {
    Harmoonie storage harmoonie = registered[harmoonieId];
    if (!harmoonie.registered) revert HarmoonieNotRegistered(harmoonieId);
    return
      HarmoonieFeesView(
        harmoonie.currency,
        calculateFees(
          calculateFeeIndex(harmoonie.currency),
          harmoonie.reflectionFeeDebt
        )
      );
  }

  function getHarmooniesFees(uint256[] memory harmoonieIds)
    external
    view
    override
    returns (HarmoonieFeesView[] memory)
  {
    HarmoonieFeesView[] memory fees = new HarmoonieFeesView[](
      harmoonieIds.length
    );
    for (uint256 index = 0; index < harmoonieIds.length; index++) {
      fees[index] = getHarmoonieFees(harmoonieIds[index]);
    }
    return fees;
  }

  function register(uint256 harmoonieId, address currency) public override {
    if (harmoonies.ownerOf(harmoonieId) != msg.sender)
      revert NotHarmoonieOwner(harmoonieId);
    if (registered[harmoonieId].registered)
      revert HarmoonieAlreadyRegistered(harmoonieId);
    if (!marketplace.acceptsCurrency(currency))
      revert InvalidCurrency(currency);

    uint256 feeIndex = updateFeeIndex(currency);

    registered[harmoonieId].registered = true;
    registered[harmoonieId].currency = currency;
    registered[harmoonieId].reflectionFeeDebt = feeIndex;
    totalRegisteredByCurrency[currency]++;

    emit Registered(harmoonieId, currency);
  }

  function switchCurrency(uint256 harmoonieId, address currency)
    external
    override
    nonReentrant
  {
    if (harmoonies.ownerOf(harmoonieId) != msg.sender)
      revert NotHarmoonieOwner(harmoonieId);
    if (!registered[harmoonieId].registered)
      revert HarmoonieNotRegistered(harmoonieId);
    if (!marketplace.acceptsCurrency(currency))
      revert InvalidCurrency(currency);

    collectFeesInternal(harmoonieId);

    uint256 feeIndex = updateFeeIndex(currency);

    address oldCurrency = registered[harmoonieId].currency;
    totalRegisteredByCurrency[oldCurrency]--;
    totalRegisteredByCurrency[currency]++;

    registered[harmoonieId].currency = currency;
    registered[harmoonieId].reflectionFeeDebt = feeIndex;

    emit SwitchedCurrency(harmoonieId, oldCurrency, currency);
  }

  function collectFees(uint256[] memory harmoonieIds)
    external
    override
    nonReentrant
  {
    for (uint256 i = 0; i < harmoonieIds.length; i++) {
      collectFeesInternal(harmoonieIds[i]);
    }
  }

  function collectFeesInternal(uint256 harmoonieId) internal {
    if (harmoonies.ownerOf(harmoonieId) != msg.sender)
      revert NotHarmoonieOwner(harmoonieId);
    Harmoonie storage harmoonie = registered[harmoonieId];
    if (!harmoonie.registered) revert HarmoonieNotRegistered(harmoonieId);

    address currency = harmoonie.currency;

    uint256 feeIndex = updateFeeIndex(currency);
    uint256 amount = calculateFees(feeIndex, harmoonie.reflectionFeeDebt);

    harmoonie.reflectionFeeDebt = feeIndex;

    if (currency == ONE) {
      payable(msg.sender).transfer(amount);
    } else {
      IERC20(currency).transfer(msg.sender, amount);
    }

    emit CollectedFee(harmoonieId, msg.sender, currency, amount);
  }

  function updateFeeIndex(address currency) internal returns (uint256) {
    uint256 index = reflectionFeesIndex[currency];

    if (index == 0) {
      reflectionFeesIndex[currency] = index = INITIAL_REFLECTION_INDEX;
    }

    if (marketplace.reflectionFeesCollector() == address(this)) {
      uint256 harmooniesByCurrency = totalRegisteredByCurrency[currency];
      if (harmooniesByCurrency > 0) {
        uint256 fees = marketplace.withdrawReflectionFees(currency);
        if (fees > 0) {
          index += (fees * 1e18) / harmooniesByCurrency;
          reflectionFeesIndex[currency] = index;
        }
      }
    }

    return index;
  }

  function calculateFeeIndex(address currency) internal view returns (uint256) {
    uint256 index = reflectionFeesIndex[currency];

    if (index == 0) {
      index = INITIAL_REFLECTION_INDEX;
    }

    if (marketplace.reflectionFeesCollector() == address(this)) {
      uint256 harmooniesByCurrency = totalRegisteredByCurrency[currency];
      if (harmooniesByCurrency > 0) {
        uint256 fees = marketplace.getRelectionFeesBalance(currency);
        if (fees > 0) {
          index += (fees * 1e18) / harmooniesByCurrency;
        }
      }
    }

    return index;
  }

  function calculateFees(uint256 reflectionFeeIndex, uint256 reflectionFeeDebt)
    internal
    pure
    returns (uint256)
  {
    uint256 amount;

    if (reflectionFeeIndex > 0 && reflectionFeeDebt > 0) {
      amount = (reflectionFeeIndex - reflectionFeeDebt) / 1e18;
    }

    return amount;
  }
}
