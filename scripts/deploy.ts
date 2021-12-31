// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { parseEther } from "@ethersproject/units";
import { ethers } from "hardhat";
import {
  IERC721__factory,
  HarmoonieRegistry__factory,
  Marketplace__factory,
} from "../typechain";

const HARMOONIES_ADDRESS = ethers.constants.AddressZero;

async function deploy() {
  const [owner] = await ethers.getSigners();

  const harmoonies = IERC721__factory.connect(HARMOONIES_ADDRESS, owner);

  const marketplaceFactory = (await ethers.getContractFactory(
    "Marketplace"
  )) as Marketplace__factory;

  const harmoonieRegistryFactory = (await ethers.getContractFactory(
    "HarmoonieRegistry"
  )) as HarmoonieRegistry__factory;

  console.log("deploying marketplace");
  const marketplace = await marketplaceFactory.deploy(
    ethers.constants.AddressZero
  );

  await marketplace.deployed();

  console.log("deploying harmoonieRegistry");
  const harmoonieRegistry = await harmoonieRegistryFactory.deploy(
    marketplace.address,
    harmoonies.address
  );

  await harmoonieRegistry.deployed();

  await marketplace.setReflectionFeesCollector(harmoonieRegistry.address);

  console.log({
    marketplace: marketplace.address,
    harmoonieRegistry: harmoonieRegistry.address,
  });

  return {
    marketplace,
    harmoonieRegistry,
  };
}

async function main() {
  const { marketplace, harmoonieRegistry } = await deploy();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
