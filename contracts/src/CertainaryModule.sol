// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {OpenCacaoCore} from "./OpenCacaoCore.sol";

contract CertainaryModule is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    enum PoolStatus {
        OPEN,
        TRIGGERED,
        EXPIRED_SAFE
    }

    struct RiskPool {
        uint256 id;
        string region;
        string triggerCondition;
        uint256 expiry;
        uint256 totalCollateral;
        uint256 impliedRiskBps;
        PoolStatus status;
    }

    struct UnderwriteOffer {
        uint256 id;
        uint256 poolId;
        address underwriter;
        uint256 premiumPerShare;
        uint256 availableShares;
        bool active;
    }
    IERC20 public immutable usdc;
    OpenCacaoCore public immutable core;
    uint256 public poolCount;
    uint256 public offerCount;
    mapping(uint256 => RiskPool) private pools;
    mapping(uint256 => UnderwriteOffer) private offers;
    mapping(uint256 => mapping(address => uint256)) public yesShares;
    mapping(uint256 => mapping(address => uint256)) public noShares;
    event PoolCreated(uint256 indexed poolId, string region, string trigger, uint256 expiry);
    event OfferPosted(uint256 indexed offerId, uint256 indexed poolId, address indexed underwriter);
    event ShieldAttached(
        uint256 indexed batchId, uint256 indexed poolId, address indexed beneficiary, uint256 shares, uint256 premium
    );
    event PoolResolved(uint256 indexed poolId, bool disaster);
    event PayoutClaimed(uint256 indexed poolId, address indexed claimant, uint256 amount);
    event OfferWithdrawn(uint256 indexed offerId, uint256 amount);

    constructor(IERC20 token, OpenCacaoCore cacao) Ownable(msg.sender) {
        usdc = token;
        core = cacao;
    }

    function getPool(uint256 id) public view returns (RiskPool memory) {
        require(id > 0 && id <= poolCount, "unknown pool");
        return pools[id];
    }

    function getOffer(uint256 id) public view returns (UnderwriteOffer memory) {
        require(id > 0 && id <= offerCount, "unknown offer");
        return offers[id];
    }

    function createRiskPool(string calldata region, string calldata trigger, uint256 duration)
        external
        onlyOwner
        returns (uint256 id)
    {
        require(bytes(region).length > 0 && bytes(trigger).length > 0 && duration > 0, "invalid pool");
        id = ++poolCount;
        pools[id] = RiskPool(id, region, trigger, block.timestamp + duration, 0, 0, PoolStatus.OPEN);
        emit PoolCreated(id, region, trigger, block.timestamp + duration);
    }

    function postUnderwriteOffer(uint256 poolId, uint256 shares, uint256 premium)
        external
        nonReentrant
        returns (uint256 id)
    {
        RiskPool memory p = getPool(poolId);
        require(p.status == PoolStatus.OPEN && block.timestamp < p.expiry, "pool closed");
        require(shares > 0 && premium >= 10_000 && premium <= 400_000, "invalid quote");
        id = ++offerCount;
        offers[id] = UnderwriteOffer(id, poolId, msg.sender, premium, shares, true);
        usdc.safeTransferFrom(msg.sender, address(this), (1e6 - premium) * shares);
        emit OfferPosted(id, poolId, msg.sender);
    }

    function attachShieldToBatch(uint256 batchId, uint256 offerId, uint256 shares) external nonReentrant {
        getOffer(offerId);
        UnderwriteOffer storage o = offers[offerId];
        RiskPool storage p = pools[o.poolId];
        OpenCacaoCore.CacaoBatch memory b = core.getBatch(batchId);
        require(msg.sender == b.farmer || msg.sender == b.buyer, "not batch party");
        require(uint8(b.status) < 3, "batch closed");
        require(keccak256(bytes(core.getFarm(b.farmId).region)) == keccak256(bytes(p.region)), "region mismatch");
        require(p.status == PoolStatus.OPEN && block.timestamp < p.expiry, "pool closed");
        require(o.active && shares > 0 && shares <= o.availableShares, "invalid shares");
        o.availableShares -= shares;
        if (o.availableShares == 0) o.active = false;
        p.totalCollateral += shares * 1e6;
        p.impliedRiskBps = o.premiumPerShare / 100;
        yesShares[o.poolId][b.farmer] += shares;
        noShares[o.poolId][o.underwriter] += shares;
        core.linkInsurancePolicy(batchId, o.poolId, shares);
        usdc.safeTransferFrom(msg.sender, address(this), o.premiumPerShare * shares);
        emit ShieldAttached(batchId, o.poolId, b.farmer, shares, o.premiumPerShare * shares);
    }

    // Demo oracle deliberately permits early settlement. Real deployments need a trusted data adapter.
    function resolveClimateOracle(uint256 poolId, bool disaster) external onlyOwner {
        getPool(poolId);
        RiskPool storage p = pools[poolId];
        require(p.status == PoolStatus.OPEN, "already resolved");
        p.status = disaster ? PoolStatus.TRIGGERED : PoolStatus.EXPIRED_SAFE;
        emit PoolResolved(poolId, disaster);
    }

    function withdrawOffer(uint256 offerId) external nonReentrant {
        getOffer(offerId);
        UnderwriteOffer storage o = offers[offerId];
        require(msg.sender == o.underwriter && o.availableShares > 0, "not withdrawable");
        uint256 amount = o.availableShares * (1e6 - o.premiumPerShare);
        o.availableShares = 0;
        o.active = false;
        usdc.safeTransfer(msg.sender, amount);
        emit OfferWithdrawn(offerId, amount);
    }

    function claimInsurancePayout(uint256 poolId) external nonReentrant {
        getPool(poolId);
        RiskPool storage p = pools[poolId];
        require(p.status != PoolStatus.OPEN, "unresolved");
        uint256 shares = p.status == PoolStatus.TRIGGERED ? yesShares[poolId][msg.sender] : noShares[poolId][msg.sender];
        require(shares > 0, "no winning shares");
        yesShares[poolId][msg.sender] = 0;
        noShares[poolId][msg.sender] = 0;
        uint256 amount = shares * 1e6;
        p.totalCollateral -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit PayoutClaimed(poolId, msg.sender, amount);
    }
}
