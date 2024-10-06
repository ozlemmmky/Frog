import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

import { createWebHashHistory, createRouter } from 'vue-router'

import "solana-wallets-vue/styles.css";
import SolanaWallets from "solana-wallets-vue";


import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";

import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack'



import Swap from './components/App.vue'


const routes = [
  { path: '/', name: 'home', component: Swap },

]

const router = createRouter({
  history: createWebHashHistory('#'),
  routes,
})



const walletOptions = {
  wallets: [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new BackpackWalletAdapter(),
  ],
  autoConnect: true,
};





createApp(App)
  .use(SolanaWallets, walletOptions)
  .use(router)
  .mount('#app')
