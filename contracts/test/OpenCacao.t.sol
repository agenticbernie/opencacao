// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {OpenCacaoCore} from "../src/OpenCacaoCore.sol";
import {CertainaryModule} from "../src/CertainaryModule.sol";

contract OpenCacaoTest is Test {
    MockUSDC token;
    OpenCacaoCore core;
    CertainaryModule shield;
    address farmer = address(0xA);
    address buyer = address(0xB);
    address lp = address(0xC);

    function setUp() public {
        token = new MockUSDC();
        core = new OpenCacaoCore(token);
        shield = new CertainaryModule(token, core);
        core.setCertainaryModule(address(shield));
        address[3] memory actors = [farmer, buyer, lp];
        for (uint256 i; i < 3; i++) {
            vm.startPrank(actors[i]);
            token.faucet();
            token.approve(address(core), type(uint256).max);
            token.approve(address(shield), type(uint256).max);
            vm.stopPrank();
        }
        vm.startPrank(farmer);
        core.registerFarm("Mekong Cacao", "Ben Tre", "[[106.3,10.2],[106.4,10.2],[106.3,10.3],[106.3,10.2]]", 5);
        core.createCacaoBatch(1, 500, 2000e6);
        vm.stopPrank();
        shield.createRiskPool("Ben Tre", "Salinity > 4ppt", 30 days);
        vm.prank(lp);
        shield.postUnderwriteOffer(1, 2000, 100_000);
    }

    function attach(uint256 shares) internal {
        vm.prank(farmer);
        shield.attachShieldToBatch(1, 1, shares);
    }

    function testRegistrationAndAttestation() public {
        assertEq(core.getFarm(1).farmer, farmer);
        assertFalse(core.getFarm(1).eudrCompliant);
        core.attestCompliance(1, true);
        assertTrue(core.getFarm(1).eudrCompliant);
        assertEq(core.getBatch(1).escrowAmount, 2000e6);
    }

    function testEscrowLifecycle() public {
        vm.prank(buyer);
        core.fundBatchEscrow(1);
        assertEq(core.escrowTVL(), 2000e6);
        vm.startPrank(farmer);
        core.recordMoisture(1, 750);
        core.logProcessingMilestone(1, 92, "ipfs://certificate");
        vm.stopPrank();
        vm.prank(buyer);
        core.releaseEscrow(1);
        assertEq(token.balanceOf(farmer), 12000e6);
        assertEq(core.escrowTVL(), 0);
        assertEq(uint8(core.getBatch(1).status), 3);
        vm.prank(buyer);
        vm.expectRevert();
        core.releaseEscrow(1);
    }

    function testTriggeredPayoutAndWithdrawUnused() public {
        attach(1000);
        assertEq(shield.yesShares(1, farmer), 1000);
        assertEq(shield.noShares(1, lp), 1000);
        assertEq(core.getBatch(1).insuredShares, 1000);
        assertEq(shield.getPool(1).impliedRiskBps, 1000);
        shield.resolveClimateOracle(1, true);
        vm.prank(farmer);
        shield.claimInsurancePayout(1);
        assertEq(token.balanceOf(farmer), 10900e6);
        vm.prank(lp);
        shield.withdrawOffer(1);
        assertEq(token.balanceOf(address(shield)), 0);
        vm.prank(farmer);
        vm.expectRevert();
        shield.claimInsurancePayout(1);
    }

    function testSafePayout() public {
        attach(2000);
        shield.resolveClimateOracle(1, false);
        vm.prank(lp);
        shield.claimInsurancePayout(1);
        assertEq(token.balanceOf(lp), 10200e6);
        assertEq(shield.getPool(1).totalCollateral, 0);
        vm.prank(farmer);
        vm.expectRevert();
        shield.claimInsurancePayout(1);
    }

    function testAuthorizationAndStatusGuards() public {
        vm.startPrank(buyer);
        vm.expectRevert();
        core.createCacaoBatch(1, 2, 1e6);
        vm.expectRevert();
        core.logProcessingMilestone(1, 90, "ipfs://x");
        vm.expectRevert();
        core.linkInsurancePolicy(1, 1, 1);
        vm.expectRevert();
        shield.attachShieldToBatch(1, 1, 1);
        vm.expectRevert();
        shield.resolveClimateOracle(1, true);
        vm.expectRevert();
        shield.createRiskPool("x", "y", 1);
        vm.expectRevert();
        core.attestCompliance(1, true);
        vm.stopPrank();
        vm.prank(farmer);
        vm.expectRevert();
        core.fundBatchEscrow(1);
    }

    function testExpiryAndResolutionGuards() public {
        vm.warp(block.timestamp + 31 days);
        vm.prank(farmer);
        vm.expectRevert("pool closed");
        shield.attachShieldToBatch(1, 1, 1);
        vm.prank(lp);
        vm.expectRevert("pool closed");
        shield.postUnderwriteOffer(1, 1, 100_000);
        shield.resolveClimateOracle(1, false);
        vm.expectRevert("already resolved");
        shield.resolveClimateOracle(1, true);
    }

    function testInvalidQuotesAndShares() public {
        vm.startPrank(lp);
        vm.expectRevert();
        shield.postUnderwriteOffer(1, 1, 0);
        vm.expectRevert();
        shield.postUnderwriteOffer(1, 0, 100_000);
        vm.stopPrank();
        vm.startPrank(farmer);
        vm.expectRevert();
        shield.attachShieldToBatch(1, 1, 0);
        vm.expectRevert();
        shield.attachShieldToBatch(1, 1, 2001);
        vm.expectRevert();
        shield.claimInsurancePayout(1);
        vm.stopPrank();
    }

    function testRegionMismatchAndSinglePool() public {
        shield.createRiskPool("Dak Lak", "Heat", 1 days);
        vm.prank(lp);
        shield.postUnderwriteOffer(2, 100, 100_000);
        vm.prank(farmer);
        vm.expectRevert("region mismatch");
        shield.attachShieldToBatch(1, 2, 1);
        attach(1);
        shield.createRiskPool("Ben Tre", "Drought", 1 days);
        vm.prank(lp);
        shield.postUnderwriteOffer(3, 100, 100_000);
        vm.prank(farmer);
        vm.expectRevert("one pool per batch");
        shield.attachShieldToBatch(1, 3, 1);
        assertEq(shield.getOffer(3).availableShares, 100);
    }

    function testBuyerPaysFarmerBeneficiary() public {
        vm.prank(buyer);
        core.fundBatchEscrow(1);
        vm.prank(buyer);
        shield.attachShieldToBatch(1, 1, 100);
        assertEq(shield.yesShares(1, farmer), 100);
        assertEq(shield.yesShares(1, buyer), 0);
    }

    function testPartialFillThenCancel() public {
        attach(500);
        vm.prank(lp);
        shield.withdrawOffer(1);
        assertEq(shield.getPool(1).totalCollateral, 500e6);
        shield.resolveClimateOracle(1, true);
        vm.prank(farmer);
        shield.claimInsurancePayout(1);
        assertEq(token.balanceOf(address(shield)), 0);
    }

    function testFuzzCollateralConservation(uint16 raw, bool disaster) public {
        uint256 shares = bound(uint256(raw), 1, 2000);
        attach(shares);
        assertEq(token.balanceOf(address(shield)), 1800e6 + shares * 100_000);
        shield.resolveClimateOracle(1, disaster);
        vm.prank(disaster ? farmer : lp);
        shield.claimInsurancePayout(1);
        if (shares < 2000) {
            vm.prank(lp);
            shield.withdrawOffer(1);
        }
        assertEq(token.balanceOf(address(shield)), 0);
        assertEq(shield.getPool(1).totalCollateral, 0);
    }

    function testFaucetAndUnknownIds() public {
        assertEq(token.decimals(), 6);
        vm.prank(farmer);
        token.faucet();
        assertEq(token.balanceOf(farmer), 20000e6);
        vm.expectRevert();
        core.getFarm(0);
        vm.expectRevert();
        core.getBatch(10);
        vm.expectRevert();
        shield.getPool(0);
        vm.expectRevert();
        shield.getOffer(0);
    }
}
