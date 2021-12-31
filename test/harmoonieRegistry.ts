import chai, { expect } from "chai";
import { ethers } from "hardhat";
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";

import {
  IERC721,
  IMarketplace,
  HarmoonieRegistry,
  HarmoonieRegistry__factory,
} from "../typechain";

import { parseEther } from "@ethersproject/units";
import { hexlify, randomBytes } from "ethers/lib/utils";

chai.should();
chai.use(smock.matchers);

const ONE = ethers.constants.AddressZero;

describe("HarmoonieRegistry", function () {
  let harmoonies: FakeContract<IERC721>;
  let marketplace: FakeContract<IMarketplace>;
  let registry: MockContract<HarmoonieRegistry>;

  beforeEach(async () => {
    harmoonies = await smock.fake<IERC721>("IERC721");
    marketplace = await smock.fake<IMarketplace>("IMarketplace");

    const registryFactory = await smock.mock<HarmoonieRegistry__factory>(
      "HarmoonieRegistry"
    );

    registry = await registryFactory.deploy(
      marketplace.address,
      harmoonies.address
    );

    marketplace.reflectionFeesCollector.returns(registry.address);
  });

  it("should register harmoonie", async () => {
    const [account] = await ethers.getSigners();
    harmoonies.ownerOf.returns(account.address);
    marketplace.acceptsCurrency.returns(true);
    await registry.register(1, ONE);
  });

  it("register harmoonie should fail if not owner", async () => {
    harmoonies.ownerOf.returns(ethers.constants.AddressZero);
    marketplace.acceptsCurrency.returns(true);
    await expect(registry.register(1, ONE)).to.be.reverted;
  });

  it("register harmoonie should fail if already registered", async () => {
    const [account] = await ethers.getSigners();
    await registry.setVariable("registered", {
      1: {
        registered: true,
      },
    });
    harmoonies.ownerOf.returns(account.address);
    marketplace.acceptsCurrency.returns(true);
    await expect(registry.register(1, ONE)).to.be.reverted;
  });

  it("register harmoonie should fail if invalid currency", async () => {
    const [account] = await ethers.getSigners();
    harmoonies.ownerOf.returns(account.address);
    marketplace.acceptsCurrency.returns(false);
    await expect(registry.register(1, ONE)).to.be.reverted;
  });

  it("collect fees should fail if not harmoonie owner", async () => {
    await registry.setVariable("registered", {
      1: {
        registered: true,
        currency: ONE,
      },
    });
    harmoonies.ownerOf.returns(ethers.constants.AddressZero);
    await expect(registry.collectFees([1])).to.be.reverted;
  });

  it("collect fees should fail if harmoonie not registered", async () => {
    const [account] = await ethers.getSigners();
    await registry.setVariable("registered", {
      1: {
        registered: false,
      },
    });
    harmoonies.ownerOf.returns(account.address);
    await expect(registry.collectFees([1])).to.be.reverted;
  });

  it("should collect fees", async () => {
    const [, harmoonieHolder] = await ethers.getSigners();
    const registeredHarmoonies = 20;
    const fees = parseEther("10");
    const initialFeeIndex = parseEther("1");

    const reflectionFeeIndex = fees
      .mul(ethers.constants.WeiPerEther)
      .div(registeredHarmoonies)
      .add(initialFeeIndex);

    const feesToCollect = reflectionFeeIndex
      .sub(initialFeeIndex)
      .div(ethers.constants.WeiPerEther);

    await ethers.provider.send("hardhat_setBalance", [
      registry.address,
      fees.toHexString(),
    ]);

    await registry.setVariable("reflectionFeesIndex", {
      [ONE]: initialFeeIndex,
    });

    await registry.setVariable("registered", {
      1: {
        registered: true,
        currency: ONE,
        reflectionFeeDebt: initialFeeIndex,
      },
    });

    await registry.setVariable("totalRegisteredByCurrency", {
      [ONE]: registeredHarmoonies,
    });

    harmoonies.ownerOf.returns(harmoonieHolder.address);
    marketplace.withdrawReflectionFees.returns(fees);

    const balanceBefore = await harmoonieHolder.getBalance();
    const tx = await registry.connect(harmoonieHolder).collectFees([1]);
    const receipt = await tx.wait();

    expect(await harmoonieHolder.getBalance()).to.eq(
      balanceBefore
        .add(feesToCollect)
        .sub(receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice))
    );
  });

  it("switching currency should collect fees", async () => {
    const [account] = await ethers.getSigners();

    const registeredHarmoonies = 20;
    const fees = parseEther("10");
    const initialFeeIndex = parseEther("1");

    const updatedFeeIndex = fees
      .mul(ethers.constants.WeiPerEther)
      .div(registeredHarmoonies)
      .add(initialFeeIndex);

    const harmoonieFee = updatedFeeIndex
      .sub(initialFeeIndex)
      .div(ethers.constants.WeiPerEther);

    const currency = hexlify(randomBytes(20));

    await ethers.provider.send("hardhat_setBalance", [
      registry.address,
      fees.toHexString(),
    ]);

    marketplace.acceptsCurrency.returns(true);
    marketplace.withdrawReflectionFees.returns(fees);

    await registry.setVariable("reflectionFeesIndex", {
      [ONE]: initialFeeIndex,
      [currency]: initialFeeIndex,
    });

    await registry.setVariable("registered", {
      1: {
        registered: true,
        reflectionFeeDebt: initialFeeIndex,
      },
    });

    await registry.setVariable("totalRegisteredByCurrency", {
      [ONE]: registeredHarmoonies,
      [currency]: 0,
    });

    harmoonies.ownerOf.returns(account.address);

    const balanceBefore = await account.getBalance();

    const tx = await registry.switchCurrency(1, currency);
    const receipt = await tx.wait();

    expect(await account.getBalance()).to.eq(
      balanceBefore
        .add(harmoonieFee)
        .sub(receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice))
    );
  });

  it("swithing currency should fail if not harmoonie owner", async () => {
    const [, anon] = await ethers.getSigners();

    await registry.setVariable("registered", {
      1: {
        registered: true,
      },
    });

    const currency = hexlify(randomBytes(20));
    harmoonies.ownerOf.returns(anon.address);
    await expect(registry.switchCurrency(1, currency)).to.be.reverted;
  });

  it("switching currency should fail if harmoonie not registered", async () => {
    const [account] = await ethers.getSigners();

    await registry.setVariable("registered", {
      1: {
        registered: false,
      },
    });

    const currency = hexlify(randomBytes(20));
    harmoonies.ownerOf.returns(account.address);
    await expect(registry.switchCurrency(1, currency)).to.be.reverted;
  });

  it("swithing currency should fail if invalid currency", async () => {
    const [account] = await ethers.getSigners();

    await registry.setVariable("registered", {
      1: {
        registered: true,
      },
    });

    const currency = hexlify(randomBytes(20));
    harmoonies.ownerOf.returns(account.address);
    marketplace.acceptsCurrency.returns(false);
    await expect(registry.switchCurrency(1, currency)).to.be.reverted;
  });

  // describe("ERC20 currency", () => {
  //   let currency: FakeContract<IERC20>;

  //   beforeEach(async () => {
  //     currency = await smock.fake<IERC20>("IERC20");

  //     await marketplace.addCurrency(currency.address);
  //   });

  //   it("collect fees should use transfer", async () => {
  //     const [, harmoonieHolder] = await ethers.getSigners();
  //     const registeredHarmoonies = 20;
  //     const fees = parseEther("10");
  //     const initialFeeIndex = parseEther("1");

  //     const reflectionFeeIndex = fees
  //       .mul(ethers.constants.WeiPerEther)
  //       .div(registeredHarmoonies)
  //       .add(initialFeeIndex);

  //     await marketplace.setVariable("reflectionFeesIndex", {
  //       [currency.address]: reflectionFeeIndex,
  //     });

  //     await marketplace.setVariable("registered", {
  //       1: {
  //         registered: true,
  //         currency: currency.address,
  //         reflectionFeeDebt: initialFeeIndex,
  //       },
  //     });

  //     harmoonies.ownerOf.returns(harmoonieHolder.address);

  //     const feesToCollect = reflectionFeeIndex
  //       .sub(initialFeeIndex)
  //       .div(ethers.constants.WeiPerEther);

  //     currency.transfer.returns(true);
  //     await marketplace.connect(harmoonieHolder).collectFees([1]);
  //     currency.transfer
  //       .atCall(0)
  //       .should.be.calledWith(harmoonieHolder.address, feesToCollect);
  //   });
  // });
});
