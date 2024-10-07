<script setup lang="ts">
import { Connection, Keypair, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js';
import fetch from 'cross-fetch';
import bs58 from 'bs58';
import { WalletMultiButton } from "solana-wallets-vue";
import { useWallet } from 'solana-wallets-vue';
import { clusterApiUrl, SystemProgram, Transaction, PublicKey, TransactionInstruction, AddressLookupTableAccount, TransactionMessage } from '@solana/web3.js';

import { ref, watch, computed } from 'vue';

const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=2eb38aa5-c8f6-4048-9fac-5ed0db1710ed';
const MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const INPUT_MINT = 'So11111111111111111111111111111111111111112';

const connection = new Connection(RPC_URL);
const { publicKey, sendTransaction } = useWallet();

const totalBuy = ref(0.001);
const slippageBps = ref(1);

const exchanges = ref({
    raydium: { checked: false, amount: 0, get: { outAmount: 0 }, post: null },
    meteora: { checked: false, amount: 0, get: { outAmount: 0 }, post: null },
    orca: { checked: false, amount: 0, get: { outAmount: 0 }, post: null },
});

const activeExchangeCount = computed(() =>
    Object.values(exchanges.value).filter(e => e.checked).length
);

const updateExchangeAmounts = () => {
    const amount = totalBuy.value / activeExchangeCount.value;
    Object.values(exchanges.value).forEach(exchange => {
        exchange.amount = exchange.checked ? amount : 0;
    });
};

const fetchQuote = async (dexes, amount) => {
    const params = new URLSearchParams({
        inputMint: INPUT_MINT,
        outputMint: MINT,
        amount: Math.floor(amount * LAMPORTS_PER_SOL).toString(),
        slippageBps: (slippageBps.value * 100).toString(),
        onlyDirectRoutes: 'true',
        dexes: dexes.join(','),
    });
    const response = await fetch(`https://quote-api.jup.ag/v6/quote?${params}`);
    return response.json();
};

const updateQuotes = async () => {
    const quotePromises = Object.entries(exchanges.value)
        .filter(([_, exchange]) => exchange.checked)
        .map(async ([name, exchange]) => {
            const dexes = {
                raydium: ['Raydium', 'Raydium CLMM'],
                meteora: ['Meteora', 'Meteora DLMM'],
                orca: ['Orca V1', 'Orca V2', 'Whirlpool'],
            };
            exchange.get = await fetchQuote(dexes[name], exchange.amount);
        });

    await Promise.all(quotePromises);
};

watch([() => exchanges.value.raydium.checked, () => exchanges.value.meteora.checked, () => exchanges.value.orca.checked, totalBuy],
    () => {
        updateExchangeAmounts();
        updateQuotes();
    }
);

const totalBuyQuota = computed(() =>
    Object.values(exchanges.value)
        .reduce((total, exchange) => total + Math.floor(exchange.get.outAmount || 0), 0) / 100000
);

const swapTransaction = async () => {
    if (!publicKey.value) return;

    const deserializeInstruction = (instruction) => {
        return new TransactionInstruction({
            programId: new PublicKey(instruction.programId),
            keys: instruction.accounts.map(key => ({
                pubkey: new PublicKey(key.pubkey),
                isSigner: key.isSigner,
                isWritable: key.isWritable,
            })),
            data: Buffer.from(instruction.data, 'base64'),
        });
    }

    let instructions = [];
    let accounts = [];
    console.log(exchanges.value);

    for (const [name, exchange] of Object.entries(exchanges.value)) {
        if (exchange.checked) {
            const resp = await postQuote(exchange.get, publicKey.value);
            instructions.push(
                ...resp.setupInstructions.map(deserializeInstruction),
                deserializeInstruction(resp.swapInstruction),
                deserializeInstruction(resp.cleanupInstruction)
            );
            accounts.push(...resp.addressLookupTableAccounts);
        }
        
    }



    const { blockhash } = await connection.getLatestBlockhash();
    const messageV0 = new TransactionMessage({
        payerKey: publicKey.value,
        recentBlockhash: blockhash,
        instructions,
    }).compileToV0Message(accounts);

    const transaction = new VersionedTransaction(messageV0);
    return sendTransaction(transaction, connection);
};

const postQuote = async (pool, wallet) => {
    const response = await fetch('https://quote-api.jup.ag/v6/swap-instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            quoteResponse: pool,
            userPublicKey: wallet,
            wrapAndUnwrapSol: true,
        }),
    });
    const instructions = await response.json();

    const addressLookupTableAccounts = await Promise.all(
        instructions.addressLookupTableAddresses.map(async (address) => {
            const accountInfo = await connection.getAccountInfo(new PublicKey(address));
            return accountInfo ? new AddressLookupTableAccount({
                key: new PublicKey(address),
                state: AddressLookupTableAccount.deserialize(accountInfo.data),
            }) : null;
        })
    );

    return { ...instructions, addressLookupTableAccounts: addressLookupTableAccounts.filter(Boolean) };
};
const priceFormat = (price) => (price / 100000).toLocaleString('en-US', { minimumFractionDigits: 5, maximumFractionDigits: 5 });

</script>
<template>
    <div class="flex flex-col  w-1/3 mx-auto mt-10 p-4">
       
        <div class="w-full">
            <img src="/logo.png" alt="">
            <wallet-multi-button></wallet-multi-button>

            <div class="mb-6 mt-10">
                <label for="rpc"
                    class="block text-xl bg-gradient-to-r from-lime-400 to-lime-100 bg-clip-text text-transparent font-bold">RPC</label>
                <input type="text" id="rpc" v-model="RPC_URL"
                    class="mt-1 p-2 w-full bg-red-800 dark:bg-green-900 rounded-full focus:outline-none border-2 border-red-400 dark:border-green-400 text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent">
            </div>

            <div class="mb-6">
                <label
                    class="block text-xl bg-gradient-to-r from-lime-400 to-lime-100 bg-clip-text text-transparent font-bold">Slippage</label>
                <div class="flex gap-3">
                    <template v-for="value in [1, 10, 20]" :key="value">
                        <div class="flex w-full">
                            <input type="radio" :id="`slippage-${value}`" class="peer hidden" v-model="slippageBps"
                                :value="value" />
                            <label :for="`slippage-${value}`"
                                class="select-none cursor-pointer rounded-lg border-2 border-red-400 dark:border-green-400 py-3 w-full px-6 font-bold text-red-200 transition-colors duration-200 ease-in-out peer-checked:bg-red-900 peer-checked:dark:bg-green-900 peer-checked:text-lime-300">
                                {{ value }}%
                            </label>
                        </div>
                    </template>
                </div>
            </div>

            <div class="mb-6">
                <label for="token-address"
                    class="block text-xl bg-gradient-to-r from-lime-400 to-lime-100 bg-clip-text text-transparent font-bold">Token
                    address</label>
                <input type="text" id="token-address" v-model="MINT"
                    class="mt-1 p-2 w-full bg-red-800 dark:bg-green-900 rounded-full focus:outline-none text-white border-2 border-red-400 dark:border-green-400 focus:ring-2 focus:ring-blue-600 focus:border-transparent">
            </div>

            <div class="mb-6">
                <label for="total-buy"
                    class="block text-xl bg-gradient-to-r from-lime-400 to-lime-100 bg-clip-text text-transparent font-bold">SOL</label>
                <input type="text" id="total-buy" v-model="totalBuy"
                    class="mt-1 p-2 w-full bg-red-800 dark:bg-green-900 rounded-full focus:outline-none text-white border-2 border-red-400 dark:border-green-400 focus:ring-2 focus:ring-blue-600 focus:border-transparent">
            </div>

            <div v-for="(exchange, name) in exchanges" :key="name" class="flex items-center w-full">
                <label :for="name"
                    class="grid grid-cols-4 text-white p-5 h-full rounded-xl  group bg-red-900 dark:bg-green-900 w-full my-2 cursor-pointer">
                    <div class="inline-flex items-center">
                        <div class="relative inline-block w-8 h-4 rounded-full cursor-pointer">
                            <input :id="name" type="checkbox" v-model="exchange.checked"
                                class="absolute w-8 h-4 transition-colors duration-300 rounded-full appearance-none cursor-pointer peer bg-blue-100 checked:bg-lime-300 peer-checked:border-lime-300 peer-checked:before:bg-lime-300">
                            <label :for="name"
                                class="before:content[''] absolute top-2/4 -left-1 h-5 w-5 -translate-y-2/4 cursor-pointer rounded-full border border-blue-gray-100 bg-white shadow-md transition-all duration-300 before:absolute before:top-2/4 before:left-2/4 before:block before:h-10 before:w-10 before:-translate-y-2/4 before:-translate-x-2/4 before:rounded-full before:bg-blue-gray-500 before:opacity-0 before:transition-opacity hover:before:opacity-10 peer-checked:translate-x-full peer-checked:border-gray-900 peer-checked:before:bg-gray-900">
                            </label>
                        </div>
                    </div>
                    <h3
                        class="items-left col-span-2 md:col-span-1 bg-gradient-to-r text-2xl from-lime-400 to-lime-100 bg-clip-text text-transparent font-bold">
                        {{ name }}
                    </h3>
                    <p v-if="exchange.get">{{ priceFormat(exchange.get.outAmount) }}</p>
                    <p class="text-right hidden md:flex">{{ exchange.amount.toFixed(4) }}</p>
                </label>
            </div>

            <div class="flex rounded-xl text-white group bg-red-900 dark:bg-green-900 relative w-full p-4 my-2">
                <div class="w-2/3 bg-gradient-to-r from-lime-400 to-green-100 bg-clip-text text-transparent font-bold">
                    With tool total: {{ totalBuyQuota }}
                </div>
                <div class="w-1/3 text-right">
                    <a @click="updateQuotes"
                        class="bg-gradient-to-r from-lime-400 to-lime-100 bg-clip-text text-transparent font-bold cursor-pointer">Update
                        Price</a>
                </div>
            </div>

            <button @click="sendTransaction"
                class=" rounded-xl text-white group bg-red-900 dark:bg-gradient-to-r from-lime-400 to-lime-600 disabled:cursor-not-allowed relative w-full">
                <div class="rounded-xl py-5 text-lg font-bold">
                    <span >
                        <span
                            class="btext-white  font-bold">Swap</span>
                    </span>
                </div>
            </button>

            <p
                class="text-xl bg-gradient-to-r from-lime-400 to-lime-100 bg-clip-text text-transparent text-center mt-2">
                Powered by <b>JUP</b>
            </p>
        </div>
    </div>
</template>