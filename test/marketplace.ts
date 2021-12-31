import chai, { expect } from "chai";
import { ethers } from "hardhat";
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";

import {
  IERC20,
  IERC721,
  Marketplace,
  Marketplace__factory,
} from "../typechain";

import { parseEther } from "@ethersproject/units";
import { hexlify, randomBytes } from "ethers/lib/utils";
import { BigNumber } from "@ethersproject/bignumber";

chai.should();
chai.use(smock.matchers);

const ONE = ethers.constants.AddressZero;

describe("Marketplace", function () {
  let nft: FakeContract<IERC721>;
  let marketplace: MockContract<Marketplace>;

  let time = Date.now();

  beforeEach(async () => {
    // const [, reflectionFeesCollector] = await ethers.getSigners();
    nft = await smock.fake<IERC721>("IERC721");
    const marketplaceFactory = await smock.mock<Marketplace__factory>(
      "Marketplace"
    );
    marketplace = await marketplaceFactory.deploy(ethers.constants.AddressZero);

    const block = await ethers.provider.getBlock(
      await ethers.provider.getBlockNumber()
    );

    time = block.timestamp;
  });

  it("should create market", async () => {
    const [, creator] = await ethers.getSigners();

    await marketplace.createMarket(
      nft.address,
      "Test",
      creator.address,
      10,
      3,
      2
    );

    const market = await marketplace.getMarket(nft.address);

    expect(market.isActive).to.eq(true);
    expect(market.name).to.eq("Test");
    expect(market.fee).to.eq(10);
    expect(market.creator).to.eq(creator.address);
    expect(market.creatorFee).to.eq(3);
    expect(market.reflectionFee).to.eq(2);
  });

  it("create market should fail if market already exists", async () => {
    await marketplace.setVariable("markets", {
      [nft.address]: {
        isMarket: true,
      },
    });

    await expect(marketplace.createMarket(nft.address, "Test", 10, 2)).to.be
      .reverted;
  });

  it("create market should fail if not owner", async () => {
    const [, account] = await ethers.getSigners();
    await expect(
      marketplace
        .connect(account)
        .createMarket(
          nft.address,
          "Test",
          ethers.constants.AddressZero,
          10,
          3,
          2
        )
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("create market should fail if not owner", async () => {
    await expect(
      marketplace.createMarket(
        ethers.constants.AddressZero,
        "Black Holes",
        10,
        2
      )
    ).to.be.reverted;
  });

  it("set market fees should update market fees", async () => {
    await marketplace.setVariable("markets", {
      [nft.address]: {
        isMarket: true,
        fee: 0,
        creatorFee: 0,
        reflectionFee: 0,
      },
    });

    await marketplace.setMarketFee(nft.address, 8, 5, 3);

    const market = await marketplace.getMarket(nft.address);

    expect(market.fee).to.eq(8);
    expect(market.creatorFee).to.eq(5);
    expect(market.reflectionFee).to.eq(3);
  });

  it("set market fees should fail if total fees higher then max fees", async () => {
    await marketplace.setVariable("markets", {
      [nft.address]: {
        isMarket: false,
      },
    });

    await expect(
      marketplace.setMarketFee(
        nft.address,
        parseEther("0.20"),
        parseEther("0.20"),
        parseEther("0.20")
      )
    ).to.be.reverted;
  });

  it("set market fees should if market doesnt exist", async () => {
    await marketplace.setVariable("markets", {
      [nft.address]: {
        isMarket: false,
      },
    });

    await expect(marketplace.setMarketFee(nft.address, 1, 2, 3)).to.be.reverted;
  });

  it("set market state should update market state", async () => {
    await marketplace.setVariable("markets", {
      [nft.address]: {
        isMarket: true,
        isActive: true,
      },
    });

    await marketplace.setMarketState(nft.address, false);

    const market = await marketplace.getMarket(nft.address);
    expect(market.isActive).to.eq(false);
  });

  it("set market state should if market doesnt exist", async () => {
    await marketplace.setVariable("markets", {
      [nft.address]: {
        isMarket: false,
      },
    });

    await expect(marketplace.setMarketState(nft.address, false)).to.be.reverted;
  });

  it("should create auction", async () => {
    const [account] = await ethers.getSigners();

    await marketplace.setVariable("markets", {
      [nft.address]: {
        isMarket: true,
        isActive: true,
      },
    });

    nft.ownerOf.returnsAtCall(0, account.address);

    await marketplace.createAuction(
      nft.address,
      1,
      ONE,
      100,
      60 * 60 // 1 hour
    );

    nft.transferFrom
      .atCall(0)
      .should.be.calledWith(account.address, marketplace.address, 1);

    const blockNumber = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNumber);

    const auction = await marketplace.getAuction(nft.address, 1);

    expect(auction.token).to.eq(nft.address);
    expect(auction.tokenId).to.eq(1);
    expect(auction.seller).to.eq(account.address);
    expect(auction.currency).to.eq(ONE);
    expect(auction.highestBidder).to.eq(ethers.constants.AddressZero);
    expect(auction.highestBid).to.eq(100);
    expect(auction.ended).to.eq(false);
    expect(auction.endsAt).to.eq(block.timestamp + 60 * 60);
  });

  it("create auction should fail if market not registered", async () => {
    await marketplace.setVariable("markets", {
      [nft.address]: {
        isMarket: false,
      },
    });

    await expect(
      marketplace.createAuction(
        nft.address,
        1,
        ONE,
        100,
        60 * 60 // 1 hour
      )
    ).to.be.reverted;
  });

  it("create auction should fail if market not active", async () => {
    await marketplace.setVariable("markets", {
      [nft.address]: {
        isMarket: true,
        isActive: false,
      },
    });

    await expect(
      marketplace.createAuction(
        nft.address,
        1,
        ONE,
        100,
        60 * 60 // 1 hour
      )
    ).to.be.reverted;
  });

  it("create auction should fail if invalid currency", async () => {
    const currency = hexlify(randomBytes(20));

    await marketplace.setVariable("markets", {
      [nft.address]: {
        isMarket: true,
        isActive: true,
      },
    });

    await marketplace.setVariable("currencies", {
      [currency]: false,
    });

    // awaitmarketplace.createAuction(
    //   nft.address,
    //   1,
    //   currency,
    //   100,
    //   60 * 60 // 1 hour
    // );

    await expect(
      marketplace.createAuction(
        nft.address,
        1,
        currency,
        100,
        60 * 60 // 1 hour
      )
    ).to.be.reverted;
  });

  it("create auction should fail if token is already in auction", async () => {
    await marketplace.setVariable("markets", {
      [nft.address]: {
        isMarket: true,
        isActive: true,
      },
    });

    await marketplace.setVariable("auctions", {
      [nft.address]: {
        1: {
          isAuction: true,
          endsAt: time + 60,
        },
      },
    });

    await expect(
      marketplace.createAuction(
        nft.address,
        1,
        ONE,
        100,
        60 * 60 // 1 hour
      )
    ).to.be.reverted;
  });

  xit("create auction should fail if not owner of nft", async () => {
    const [, anon] = await ethers.getSigners();

    await marketplace.setVariable("markets", {
      [nft.address]: {
        isMarket: true,
        isActive: true,
      },
    });

    nft.ownerOf.returnsAtCall(0, anon.address);

    await expect(
      marketplace.createAuction(
        nft.address,
        1,
        ONE,
        100,
        60 * 60 // 1 hour
      )
    ).to.be.reverted;
  });

  it("create auction should fail if transfer nft fails", async () => {
    const [account] = await ethers.getSigners();

    await marketplace.setVariable("markets", {
      [nft.address]: {
        isMarket: true,
        isActive: true,
      },
    });

    nft.ownerOf.returnsAtCall(0, account.address);
    nft.transferFrom.revertsAtCall(0);

    await expect(
      marketplace.createAuction(
        nft.address,
        1,
        ONE,
        100,
        60 * 60 // 1 hour
      )
    ).to.be.reverted;

    nft.transferFrom
      .atCall(0)
      .should.be.calledWith(account.address, marketplace.address, 1);
  });

  it("bid higher should update highestBid and highestBidder", async () => {
    const [account] = await ethers.getSigners();

    await marketplace.setVariable("auctions", {
      [nft.address]: {
        1: {
          isAuction: true,
          endsAt: time + 60,
          currency: ONE,
          highestBid: 100,
        },
      },
    });

    await marketplace.bid(nft.address, 1, 0, {
      value: 200,
    });

    const auction = await marketplace.getAuction(nft.address, 1);

    expect(auction.highestBidder).to.eq(account.address);
    expect(auction.highestBid).to.eq(200);
  });

  it("if highestBidder bid should increase highestBid and add previous bid to balance", async () => {
    const [account] = await ethers.getSigners();

    await marketplace.setVariable("auctions", {
      [nft.address]: {
        1: {
          isAuction: true,
          endsAt: time + 60,
          currency: ONE,
          highestBid: 100,
        },
      },
    });

    await marketplace.bid(nft.address, 1, 0, {
      value: 200,
    });

    await marketplace.bid(nft.address, 1, 0, {
      value: 300,
    });

    const bid = await marketplace.getHighestBid(nft.address, 1);
    const balance = await marketplace.getBalance(account.address, ONE);

    expect(bid.amount).to.eq(300);
    expect(balance).to.eq(200);
  });

  it("bid should increase outbidder balance", async () => {
    const [account, justin, seller] = await ethers.getSigners();

    await marketplace.setVariable("auctions", {
      [nft.address]: {
        1: {
          isAuction: true,
          endsAt: time + 60,
          seller: seller.address,
          currency: ONE,
          highestBid: 100,
          highestBidder: ethers.constants.AddressZero,
        },
      },
    });

    await marketplace.bid(nft.address, 1, 0, {
      value: 200,
    });

    await marketplace.connect(justin).bid(nft.address, 1, 0, {
      value: 300,
    });

    const auction = await marketplace.getAuction(nft.address, 1);

    expect(auction.highestBidder).to.eq(justin.address);
    expect(auction.highestBid).to.eq(300);

    const balance = await marketplace.getBalance(account.address, ONE);

    expect(balance).to.eq(200);
  });

  xit("rebidding should add last bid balance", async () => {
    const [account, justin, seller] = await ethers.getSigners();

    await marketplace.setVariable("auctions", {
      [nft.address]: {
        1: {
          isAuction: true,
          endsAt: time + 60,
          seller: seller.address,
          currency: ONE,
          highestBid: 100,
          highestBidder: ethers.constants.AddressZero,
        },
      },
    });

    await marketplace.bid(nft.address, 1, 0, {
      value: 200,
    });

    await marketplace.connect(justin).bid(nft.address, 1, 0, {
      value: 300,
    });

    await marketplace.bid(nft.address, 1, 0, {
      value: 200,
    });

    const auction = await marketplace.getAuction(nft.address, 1);

    expect(auction.highestBidder).to.eq(account.address);
    expect(auction.highestBid).to.eq(400);

    const justinBid = await marketplace.getBalance(justin.address, ONE);

    expect(justinBid).to.eq(300);
  });

  it("bid should fail if bidder is seller", async () => {
    const [seller] = await ethers.getSigners();

    await marketplace.setVariable("auctions", {
      [nft.address]: {
        1: {
          isAuction: true,
          endsAt: time + 60,
          seller: seller.address,
          currency: ONE,
          highestBid: 100,
          highestBidder: ethers.constants.AddressZero,
        },
      },
    });

    await expect(
      marketplace.bid(nft.address, 1, 0, {
        value: 200,
      })
    ).to.be.reverted;
  });

  it("bid should fail if invalid auction", async () => {
    await marketplace.setVariable("auctions", {
      [nft.address]: {
        1: {
          isAuction: false,
        },
      },
    });

    await expect(
      marketplace.bid(nft.address, 1, 0, {
        value: 200,
      })
    ).to.be.reverted;
  });

  it("bid should fail if auction ended", async () => {
    await marketplace.setVariable("auctions", {
      [nft.address]: {
        1: {
          isAuction: true,
          endsAt: 0,
        },
      },
    });

    await expect(
      marketplace.bid(nft.address, 1, 0, {
        value: 200,
      })
    ).to.be.reverted;
  });

  it("bid should fail if amount/value is lower than highest bid", async () => {
    const [, seller] = await ethers.getSigners();

    await marketplace.setVariable("auctions", {
      [nft.address]: {
        1: {
          isAuction: true,
          endsAt: time + 60,
          seller: seller.address,
          currency: ONE,
          highestBid: 100,
          highestBidder: ethers.constants.AddressZero,
        },
      },
    });

    await expect(
      marketplace.bid(nft.address, 1, 0, {
        value: 50,
      })
    ).to.be.reverted;
  });

  it("should withdraw", async () => {
    const [account] = await ethers.getSigners();

    await ethers.provider.send("hardhat_setBalance", [
      marketplace.address,
      BigNumber.from(20000).toHexString(),
    ]);

    await marketplace.setVariable("balances", {
      [account.address]: {
        [ONE]: 20000,
      },
    });

    const balanceBefore = await account.getBalance();

    const tx = await marketplace.withdraw(ONE);
    const receipt = await tx.wait();

    expect(await account.getBalance()).to.eq(
      balanceBefore
        .add(20000)
        .sub(receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice))
    );

    expect(await marketplace.getBalance(account.address, ONE)).to.eq(0);
  });

  it("withdraw should fail if invalid currency", async () => {
    await expect(marketplace.withdraw(hexlify(randomBytes(20)))).to.be.reverted;
  });

  it("should withdraw nft", async () => {
    const [account] = await ethers.getSigners();

    await marketplace.setVariable("nftOwner", {
      [nft.address]: {
        1: account.address,
      },
    });

    await marketplace.withdrawNft(nft.address, 1);

    nft.transferFrom
      .atCall(0)
      .should.be.calledWith(marketplace.address, account.address, 1);

    expect(await marketplace.getNftOwner(nft.address, 1)).to.eq(
      ethers.constants.AddressZero
    );
  });

  it("withdraw nft should fail if not owner", async () => {
    await marketplace.setVariable("nftOwner", {
      [nft.address]: {
        1: ethers.constants.AddressZero,
      },
    });

    await expect(marketplace.withdrawNft(nft.address, 1)).to.be.reverted;
  });

  it("end auction should set nft owner to highestBidder, add balance and increase fees", async () => {
    const [, justin, seller, creator] = await ethers.getSigners();

    const devFee = parseEther("0.03");
    const creatorFee = parseEther("0.1");
    const reflectionFee = parseEther("0.1");

    await marketplace.setVariable("markets", {
      [nft.address]: {
        creator: creator.address,
        fee: devFee,
        creatorFee: creatorFee,
        reflectionFee: reflectionFee,
      },
    });

    const bid = parseEther("1");

    await marketplace.setVariable("auctions", {
      [nft.address]: {
        1: {
          isAuction: true,
          endsAt: 0,
          seller: seller.address,
          currency: ONE,
          highestBid: bid,
          highestBidder: justin.address,
        },
      },
    });

    const devFeeAmount = bid.mul(devFee).div(ethers.constants.WeiPerEther);
    const creatorFeeAmount = bid
      .mul(creatorFee)
      .div(ethers.constants.WeiPerEther);
    const reflectionFeeAmount = bid
      .mul(reflectionFee)
      .div(ethers.constants.WeiPerEther);

    const feesAmount = devFeeAmount
      .add(creatorFeeAmount)
      .add(reflectionFeeAmount);

    await marketplace.endAuction(nft.address, 1);

    expect(await marketplace.getNftOwner(nft.address, 1)).to.eq(justin.address);

    expect(await marketplace.getBalance(seller.address, ONE)).to.eq(
      bid.sub(feesAmount)
    );

    expect(await marketplace.getBalance(creator.address, ONE)).to.eq(
      creatorFeeAmount
    );

    expect(await marketplace.getFeesBalance(ONE)).to.eq(devFeeAmount);

    expect(await marketplace.getRelectionFeesBalance(ONE)).to.eq(
      reflectionFeeAmount
    );
  });

  it("end auction should fail if auction doesnt exist", async () => {
    await marketplace.setVariable("auctions", {
      [nft.address]: {
        1: {
          isAuction: false,
        },
      },
    });

    await expect(marketplace.endAuction(nft.address, 1)).to.be.reverted;
  });

  it("end auction should fail if too soon", async () => {
    const blockNumber = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNumber);

    await marketplace.setVariable("auctions", {
      [nft.address]: {
        1: {
          isAuction: true,
          endsAt: block.timestamp + 60 * 5,
        },
      },
    });

    await expect(marketplace.endAuction(nft.address, 1)).to.be.reverted;
  });

  it("end auction without bid should set nft owner to seller", async () => {
    const [, seller] = await ethers.getSigners();

    await marketplace.setVariable("auctions", {
      [nft.address]: {
        1: {
          isAuction: true,
          endsAt: 0,
          seller: seller.address,
          currency: ONE,
          highestBid: 100,
          highestBidder: ethers.constants.AddressZero,
        },
      },
    });

    await marketplace.endAuction(nft.address, 1);

    expect(await marketplace.getNftOwner(nft.address, 1)).to.eq(seller.address);
  });

  it("withdraw dev fees", async () => {
    const [account] = await ethers.getSigners();
    const fees = BigNumber.from(20000);

    await ethers.provider.send("hardhat_setBalance", [
      marketplace.address,
      fees.toHexString(),
    ]);

    await marketplace.setVariable("fees", {
      [ONE]: fees,
    });

    const balanceBefore = await account.getBalance();

    const tx = await marketplace.withdrawDevFees(ONE);
    const receipt = await tx.wait();

    expect(await account.getBalance()).to.eq(
      balanceBefore
        .add(fees)
        .sub(receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice))
    );
    expect(await marketplace.getFeesBalance(ONE)).to.eq(0);
  });

  it("withdraw dev fees should fail if not owner", async () => {
    const [, account] = await ethers.getSigners();

    await expect(marketplace.connect(account).withdrawDevFees(ONE)).to.be
      .reverted;
  });

  it("withdraw reflection fees", async () => {
    const [, reflectionFeesCollector] = await ethers.getSigners();
    const fees = BigNumber.from(20000);

    await ethers.provider.send("hardhat_setBalance", [
      marketplace.address,
      fees.toHexString(),
    ]);

    await marketplace.setVariable(
      "reflectionFeesCollector",
      reflectionFeesCollector.address
    );

    await marketplace.setVariable("reflectionFees", {
      [ONE]: fees,
    });

    const balanceBefore = await reflectionFeesCollector.getBalance();

    const tx = await marketplace
      .connect(reflectionFeesCollector)
      .withdrawReflectionFees(ONE);
    const receipt = await tx.wait();

    expect(await reflectionFeesCollector.getBalance()).to.eq(
      balanceBefore
        .add(fees)
        .sub(receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice))
    );
    expect(await marketplace.getFeesBalance(ONE)).to.eq(0);
  });

  it("sell should list token for sale", async () => {
    const [account] = await ethers.getSigners();

    await marketplace.setVariable("markets", {
      [nft.address]: {
        isMarket: true,
        isActive: true,
      },
    });

    await marketplace.sell(nft.address, 1, ONE, 100);

    const sale = await marketplace.getSellOrder(nft.address, 1);

    expect(sale.token).to.eq(nft.address);
    expect(sale.tokenId).to.eq(1);
    expect(sale.seller).to.eq(account.address);
    expect(sale.currency).to.eq(ONE);
    expect(sale.price).to.eq(100);

    nft.transferFrom
      .atCall(0)
      .should.be.calledWith(account.address, marketplace.address, 1);
  });

  it("cancel sell should fail if not seller", async () => {
    // const [account] = await ethers.getSigners();

    await marketplace.setVariable("markets", {
      [nft.address]: {
        isMarket: true,
        isActive: true,
      },
    });

    await marketplace.setVariable("sellOrders", {
      [nft.address]: {
        1: {
          isOrder: true,
          seller: ethers.constants.AddressZero,
        },
      },
    });

    await expect(marketplace.cancelSell(nft.address, 1)).to.be.reverted;
  });

  it("cancel sell should delist token from sale", async () => {
    const [account] = await ethers.getSigners();

    await marketplace.setVariable("markets", {
      [nft.address]: {
        isMarket: true,
        isActive: true,
      },
    });

    await marketplace.setVariable("sellOrders", {
      [nft.address]: {
        1: {
          isOrder: true,
          seller: account.address,
        },
      },
    });

    await marketplace.cancelSell(nft.address, 1);

    await expect(marketplace.getSellOrder(nft.address, 1)).to.be.reverted;
  });

  it("buy", async () => {
    const [account, seller] = await ethers.getSigners();
    const devFee = parseEther("0.03");
    const reflectionFee = parseEther("0.1");
    const price = BigNumber.from(500);

    await marketplace.setVariable("markets", {
      [nft.address]: {
        isMarket: true,
        isActive: true,
        fee: devFee,
        reflectionFee: reflectionFee,
      },
    });

    await marketplace.setVariable("sellOrders", {
      [nft.address]: {
        1: {
          isOrder: true,
          seller: seller.address,
          currency: ONE,
          price: price,
        },
      },
    });

    await marketplace.buy(nft.address, 1, ONE, 0, {
      value: price,
    });

    nft.transferFrom
      .atCall(0)
      .should.be.calledWith(marketplace.address, account.address, 1);

    const devFeeAmount = price.mul(devFee).div(ethers.constants.WeiPerEther);
    const reflectionFeeAmount = price
      .mul(reflectionFee)
      .div(ethers.constants.WeiPerEther);

    expect(await marketplace.getBalance(seller.address, ONE)).to.eq(
      price.sub(devFeeAmount).sub(reflectionFeeAmount)
    );
    expect(await marketplace.getFeesBalance(ONE)).to.eq(devFeeAmount);

    expect(await marketplace.getRelectionFeesBalance(ONE)).to.eq(
      reflectionFeeAmount
    );

    await expect(marketplace.getSellOrder(nft.address, 1)).to.be.reverted;
  });

  describe("ERC20 currency", () => {
    let currency: FakeContract<IERC20>;

    beforeEach(async () => {
      currency = await smock.fake<IERC20>("IERC20");

      await marketplace.addCurrency(currency.address);
    });

    it("should create auction with erc20 currency", async () => {
      const [account] = await ethers.getSigners();

      await marketplace.setVariable("markets", {
        [nft.address]: {
          isMarket: true,
          isActive: true,
        },
      });

      nft.ownerOf.returns(account.address);

      await marketplace.createAuction(
        nft.address,
        1,
        currency.address,
        100,
        60 * 60
      );

      const auction = await marketplace.getAuction(nft.address, 1);

      expect(auction.currency).to.eq(currency.address);
    });

    it("bid should use transferFrom", async () => {
      const [account, seller] = await ethers.getSigners();

      await marketplace.setVariable("auctions", {
        [nft.address]: {
          1: {
            isAuction: true,
            endsAt: time + 60,
            seller: seller.address,
            currency: currency.address,
            highestBid: 100,
            highestBidder: ethers.constants.AddressZero,
          },
        },
      });

      currency.transferFrom.returns(true);

      await marketplace.bid(nft.address, 1, 200);

      currency.transferFrom
        .atCall(0)
        .should.be.calledWith(account.address, marketplace.address, 200);
    });

    it("withdraw should use transfer", async () => {
      const [account] = await ethers.getSigners();

      await marketplace.setVariable("balances", {
        [account.address]: {
          [currency.address]: 200,
        },
      });

      currency.transfer.returns(true);
      await marketplace.withdraw(currency.address);
      currency.transfer.atCall(0).should.be.calledWith(account.address, 200);
    });

    it("withdraw dev fees should use transfer", async () => {
      const [account] = await ethers.getSigners();
      const fees = BigNumber.from(20000);

      await marketplace.setVariable("fees", {
        [currency.address]: fees,
      });

      currency.transfer.returns(true);

      await marketplace.withdrawDevFees(currency.address);

      currency.transfer.atCall(0).should.be.calledWith(account.address, fees);
    });
  });
});
