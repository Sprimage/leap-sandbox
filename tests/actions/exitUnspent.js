const debug = require('debug')('exitUnspent');
const { helpers, Output, Outpoint, Tx } = require('leap-core');
const { sleep, unspentForAddress, makeTransfer, periodOfTheBlock, getYoungestInputTx } = require('../../src/helpers');
const { bufferToHex } = require('ethereumjs-util');

module.exports = async function(contracts, node, bob) {
    let unspentIndex = -1;
    let txHash;
    let txData;

    console.log(`------Unspents of ${bob}------`);
    const unspents = await node.web3.getUnspent(bob);
    console.log(unspents);
    debug("------Looking for unspent from submitted period------");
    const latestBlockNumber = (await node.web3.eth.getBlock('latest')).number;
    debug("Latest Block number: ", latestBlockNumber);
    const latestSubmittedBlock = latestBlockNumber - latestBlockNumber % 32;
    debug("Latest submitted block number: ", latestSubmittedBlock);
    if (latestSubmittedBlock === 0) {
        throw new Error("Can't exit, no periods were submitted yet");
    };
    do {
        unspentIndex++;
        txHash = unspents[unspentIndex].outpoint.hash;
        txData = await node.web3.eth.getTransaction(bufferToHex(txHash));
    } while (txData.blockNumber >= latestSubmittedBlock);
    console.log(`------Will attept to exit unspent ${unspentIndex} of ${bob}------`);
    const amount = unspents[unspentIndex].output.value;
    console.log("Unspent amount: ", amount);
    debug(`------Transaction hash for Bob's unspent ${unspentIndex}------`);
    debug(txHash);
    debug("------Transaction data------");
    debug(txData);
    debug("------Period------");
    const period = await periodOfTheBlock(node.web3, txData.blockNumber);
    debug(period);
    debug("------Proof------");
    const proof = period.proof(Tx.fromRaw(txData.raw));
    debug(proof);
    debug("------Youngest Input------");
    const youngestInput = await getYoungestInputTx(node.web3, Tx.fromRaw(txData.raw));
    debug(youngestInput);
    debug("------Youngest Input Period------");
    const youngestInputPeriod = await periodOfTheBlock(node.web3, youngestInput.tx.blockNumber);
    debug(youngestInputPeriod);
    debug("------Youngest Input Proof------");
    const youngestInputProof = youngestInputPeriod.proof(Tx.fromRaw(youngestInput.tx.raw));
    debug(youngestInputProof);
    debug("------Period from the contract by merkle root------");
    debug(await contracts.bridge.methods.periods(proof[0]).call());
    console.log("------Balance before exit------");
    const balanceBefore = await contracts.token.methods.balanceOf(bob).call();
    console.log("Bob mainnet balance: ", balanceBefore);
    console.log("Bob plasma balance: ", await node.web3.eth.getBalance(bob));
    console.log("Attempting exit...");
    await contracts.exitHandler.methods.startExit(
        youngestInputProof,
        proof,
        unspents[unspentIndex].outpoint.index,
        youngestInput.index
    ).send({from: bob, value: 0, gas: 2000000});
    console.log("Finilizing exit...");
    await contracts.exitHandler.methods.finalizeTopExit(0).send({from: bob, gas: 2000000});
    console.log("------Balance after exit------");
    const balanceAfter = await contracts.token.methods.balanceOf(bob).call();
    console.log("Bob mainnet balance: ", balanceAfter);
    await sleep(5000);
    console.log("Bob plasma balance: ", await node.web3.eth.getBalance(bob));
}