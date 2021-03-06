const ethers = require('ethers');
const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");
const debug = require('debug');

const erc20abi = require('../src/erc20abi');
const SimpleToken = require('../build/contracts/build/contracts/SimpleToken');
const { mine } = require('../src/helpers');
const { assert } = chai;
chai.use(chaiAsPromised);

const log = debug('7_registerTokens');


module.exports = async function(env) {
  const { contracts, nodes, accounts, wallet } = env;
  const node = nodes[0];
  const minter = accounts[0].addr;

  console.log("\nTest: Register token");

  console.log("Registering another token...");

  const beforeColors = await node.getColors('erc20');
  console.log('Initial state');
  console.log('   Token count:', beforeColors.length);
  console.log('   Tokens:', beforeColors);

  console.log('Deploying new ERC20 token..');
  let factory = new ethers.ContractFactory(
    erc20abi,
    SimpleToken.bytecode,
    wallet
  );
  let simpleToken = await factory.deploy(
    {
      gasLimit: 1712388,
      gasPrice: 100000000000,
    }
  );
  await simpleToken.deployed();
  console.log('   Address:', simpleToken.address);

  console.log('Submitting registerToken proposal..');
  const data = contracts.exitHandler.interface.functions.registerToken.encode([simpleToken.address, 0]);
  log('   Subject:', contracts.exitHandler.address)
  log('   Data:', data)
  const gov = contracts.governance.connect(wallet.provider.getSigner(minter));
  await mine(
    gov.propose(
      contracts.exitHandler.address, data,
      { gasLimit: 2000000, gasPrice: 100000000000 }
    )
  );

  console.log('Finalizing proposal..');
  await mine(contracts.governance.finalize({ gasLimit: 1000000, gasPrice: 100000000000 }));

  // wait for event buffer
  await node.advanceUntilChange(wallet);

  const afterColors = await node.getColors('erc20');
  console.log('Checking..');

  assert.equal(afterColors.length, beforeColors.length + 1, 'Token count');
  console.log('   ✅ Token count:', afterColors.length);

  assert.deepEqual(
      beforeColors.concat([simpleToken.address]),
      afterColors,
      "getColors()"
  );
  console.log('   ✅ getColors(): ' + afterColors);

  assert.equal(
      await node.getColor(simpleToken.address),
      1,
      "getColor()"
  );
  console.log(`   ✅ getColor(${simpleToken.address}): 1`);
}
