//SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

address constant ONE = address(0);
uint256 constant MAX_FEES = 0.5e18;
uint256 constant INITIAL_REFLECTION_INDEX = 1e18;
uint256 constant MIN_DURATION = 5 minutes;
uint256 constant MAX_DURATION = 7 days;

error InvalidCurrency(address currency);
