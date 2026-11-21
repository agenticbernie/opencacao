// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract OpenCacaoCore is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    enum BatchStatus {
        LISTED,
        ESCROW_FUNDED,
        HARVEST_VERIFIED,
        COMPLETED,
        DISPUTED
    }

    struct Farm {
        uint256 id;
        address farmer;
        string farmName;
        string region;
        string gpsCoords;
        uint256 areaHectares;
        bool eudrCompliant;
    }

    struct CacaoBatch {
        uint256 id;
        uint256 farmId;
        address farmer;
        address buyer;
        uint256 weightKg;
        uint256 escrowAmount;
        uint8 fermentationScore;
        BatchStatus status;
        uint256 insuredPoolId;
        uint256 insuredShares;
    }
    IERC20 public immutable usdc;
    address public certainaryModule;
    uint256 public farmCount;
    uint256 public batchCount;
    uint256 public escrowTVL;
    mapping(uint256 => Farm) private farms;
    mapping(uint256 => CacaoBatch) private batches;
    mapping(uint256 => string) public processingCertificates;
    mapping(uint256 => uint256) public moistureBps;
    event FarmRegistered(uint256 indexed farmId, address indexed farmer);
    event ComplianceUpdated(uint256 indexed farmId, bool compliant);
    event BatchCreated(uint256 indexed batchId, uint256 indexed farmId);
    event EscrowFunded(uint256 indexed batchId, address indexed buyer, uint256 amount);
    event MilestoneLogged(uint256 indexed batchId, uint8 score, string certificate);
    event EscrowReleased(uint256 indexed batchId, uint256 amount);
    event InsuranceLinked(uint256 indexed batchId, uint256 indexed poolId, uint256 shares);

    constructor(IERC20 token) Ownable(msg.sender) {
        usdc = token;
    }

    function setCertainaryModule(address module) external onlyOwner {
        require(certainaryModule == address(0) && module.code.length > 0, "module already set/invalid");
        certainaryModule = module;
    }

    function getFarm(uint256 id) public view returns (Farm memory) {
        require(id > 0 && id <= farmCount, "unknown farm");
        return farms[id];
    }

    function getBatch(uint256 id) public view returns (CacaoBatch memory) {
        require(id > 0 && id <= batchCount, "unknown batch");
        return batches[id];
    }

    function registerFarm(string calldata name, string calldata region, string calldata gps, uint256 area)
        external
        returns (uint256 id)
    {
        require(bytes(name).length > 0 && bytes(region).length > 0 && bytes(gps).length > 0 && area > 0, "invalid farm");
        id = ++farmCount;
        farms[id] = Farm(id, msg.sender, name, region, gps, area, false);
        emit FarmRegistered(id, msg.sender);
    }

    // Owner attestation is not a legal EUDR certification or automated forest audit.
    function attestCompliance(uint256 id, bool compliant) external onlyOwner {
        getFarm(id);
        farms[id].eudrCompliant = compliant;
        emit ComplianceUpdated(id, compliant);
    }

    function createCacaoBatch(uint256 farmId, uint256 weight, uint256 price) external returns (uint256 id) {
        require(getFarm(farmId).farmer == msg.sender, "not farmer");
        require(weight > 0 && price > 0, "invalid batch");
        id = ++batchCount;
        batches[id] = CacaoBatch(id, farmId, msg.sender, address(0), weight, price, 0, BatchStatus.LISTED, 0, 0);
        emit BatchCreated(id, farmId);
    }

    function fundBatchEscrow(uint256 id) external nonReentrant {
        CacaoBatch storage b = batches[id];
        getBatch(id);
        require(b.status == BatchStatus.LISTED && msg.sender != b.farmer, "not fundable");
        b.buyer = msg.sender;
        b.status = BatchStatus.ESCROW_FUNDED;
        escrowTVL += b.escrowAmount;
        usdc.safeTransferFrom(msg.sender, address(this), b.escrowAmount);
        emit EscrowFunded(id, msg.sender, b.escrowAmount);
    }

    function logProcessingMilestone(uint256 id, uint8 score, string calldata cert) external {
        CacaoBatch storage b = batches[id];
        require(b.farmer == msg.sender && b.status == BatchStatus.ESCROW_FUNDED, "not processable");
        require(score <= 100 && bytes(cert).length > 0, "invalid telemetry");
        b.fermentationScore = score;
        b.status = BatchStatus.HARVEST_VERIFIED;
        processingCertificates[id] = cert;
        emit MilestoneLogged(id, score, cert);
    }

    function recordMoisture(uint256 id, uint256 value) external {
        CacaoBatch memory b = getBatch(id);
        require(msg.sender == b.farmer && uint8(b.status) < 3 && value <= 10000, "invalid moisture");
        moistureBps[id] = value;
    }

    function releaseEscrow(uint256 id) external nonReentrant {
        CacaoBatch storage b = batches[id];
        require(b.buyer == msg.sender && b.status == BatchStatus.HARVEST_VERIFIED, "not releasable");
        b.status = BatchStatus.COMPLETED;
        escrowTVL -= b.escrowAmount;
        usdc.safeTransfer(b.farmer, b.escrowAmount);
        emit EscrowReleased(id, b.escrowAmount);
    }

    function linkInsurancePolicy(uint256 id, uint256 poolId, uint256 shares) external {
        require(msg.sender == certainaryModule, "not module");
        getBatch(id);
        CacaoBatch storage b = batches[id];
        require(b.insuredPoolId == 0 || b.insuredPoolId == poolId, "one pool per batch");
        b.insuredPoolId = poolId;
        b.insuredShares += shares;
        emit InsuranceLinked(id, poolId, shares);
    }
}
