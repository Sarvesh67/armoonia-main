//SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

interface IHarmoonieRegistry {
  event Registered(uint256 indexed tokenId, address currency);

  event SwitchedCurrency(
    uint256 indexed tokenId,
    address oldCurrency,
    address newCurrency
  );

  event CollectedFee(
    uint256 indexed harmoonieId,
    address indexed owner,
    address indexed currency,
    uint256 amount
  );

  error HarmoonieNotRegistered(uint256 harmoonieId);
  error HarmoonieAlreadyRegistered(uint256 harmoonieId);
  error NotHarmoonieOwner(uint256 harmoonieId);

  function getTotalRegisteredByCurrency(address currency)
    external
    view
    returns (uint256);

  function isRegistered(uint256 harmoonieId) external view returns (bool);

  function getCurrency(uint256 harmoonieId) external view returns (address);

  function getFees(uint256 harmoonieId) external view returns (uint256);

  struct HarmoonieView {
    bool isRegistered;
    address currency;
  }

  function getHarmoonie(uint256 harmoonieId)
    external
    view
    returns (HarmoonieView memory);

  function getHarmoonies(uint256[] memory harmoonieIds)
    external
    view
    returns (HarmoonieView[] memory);

  struct HarmoonieFeesView {
    address currency;
    uint256 balance;
  }

  function getHarmoonieFees(uint256 harmoonieId)
    external
    view
    returns (HarmoonieFeesView memory);

  function getHarmooniesFees(uint256[] memory harmoonieIds)
    external
    view
    returns (HarmoonieFeesView[] memory);

  function register(uint256 harmoonieId, address currency) external;

  function switchCurrency(uint256 harmoonieId, address currency) external;

  function collectFees(uint256[] memory harmoonieIds) external;
}
