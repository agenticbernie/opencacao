// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Script, console2} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {OpenCacaoCore} from "../src/OpenCacaoCore.sol";
import {CertainaryModule} from "../src/CertainaryModule.sol";

contract Deploy is Script {
    function run() external {
        require(block.chainid == 43113 || block.chainid == 31337, "Fuji only (or local test)");
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        MockUSDC token = new MockUSDC();
        OpenCacaoCore core = new OpenCacaoCore(token);
        CertainaryModule shield = new CertainaryModule(token, core);
        core.setCertainaryModule(address(shield));
        token.faucet();
        token.approve(address(shield), type(uint256).max);
        core.registerFarm(
            unicode"Mekong Cacao Cooperative",
            unicode"Bến Tre - Mekong Delta",
            "[[106.375,10.242],[106.379,10.242],[106.379,10.246],[106.375,10.246],[106.375,10.242]]",
            12
        );
        core.registerFarm(
            unicode"Cho Gao Family Estate",
            unicode"Tiền Giang - Mekong Delta",
            "[[106.45,10.35],[106.46,10.35],[106.46,10.36],[106.45,10.36],[106.45,10.35]]",
            8
        );
        core.registerFarm(
            unicode"Highlands Cacao Collective",
            unicode"Đắk Lắk - Central Highlands",
            "[[108.03,12.67],[108.04,12.67],[108.04,12.68],[108.03,12.68],[108.03,12.67]]",
            24
        );
        for (uint256 i = 1; i <= 3; i++) {
            core.attestCompliance(i, true);
        }
        core.createCacaoBatch(1, 500, 2000e6);
        core.createCacaoBatch(2, 750, 3000e6);
        core.createCacaoBatch(3, 1200, 4800e6);
        core.createCacaoBatch(1, 400, 1600e6);
        shield.createRiskPool(unicode"Bến Tre - Mekong Delta", unicode"Salinity > 4.0‰ (30d)", 30 days);
        shield.createRiskPool(unicode"Tiền Giang - Mekong Delta", "Rainfall < 20mm over 30 days", 30 days);
        shield.createRiskPool(
            unicode"Đắk Lắk - Central Highlands", unicode"Temp > 38°C for 5 consecutive days", 30 days
        );
        shield.postUnderwriteOffer(1, 2500, 120_000);
        shield.postUnderwriteOffer(2, 3000, 80_000);
        shield.postUnderwriteOffer(3, 4000, 150_000);
        vm.stopBroadcast();
        console2.log("MockUSDC", address(token));
        console2.log("OpenCacaoCore", address(core));
        console2.log("CertainaryModule", address(shield));
    }
}
