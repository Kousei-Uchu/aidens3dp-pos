// Location: src/training/index.ts
// Every training module the app knows about, in the order the hub lists them. Add a module here once its file exists.
import type { TrainingModule } from '../lib/trainingModule';
import { welcome } from './modules/welcome';
import { signIn } from './modules/sign-in';
import { cart } from './modules/cart';
import { findItems } from './modules/find-items';
import { payCard } from './modules/pay-card';
import { receipts } from './modules/receipts';
import { payCash } from './modules/pay-cash';
import { splitPay } from './modules/split-pay';
import { giftSell } from './modules/gift-sell';
import { giftPay } from './modules/gift-pay';
import { savedCarts } from './modules/saved-carts';
import { customer } from './modules/customer';
import { bundlesDeals } from './modules/bundles-deals';
import { discounts } from './modules/discounts';
import { priceAdjust } from './modules/price-adjust';
import { refund } from './modules/refund';
import { scanning } from './modules/scanning';
import { inventory } from './modules/inventory';
import { stockLookupModule } from './modules/stock-lookup';
import { ordersModule } from './modules/orders';
import { drawerDayModule } from './modules/drawer-day';
import { checkChangeModule } from './modules/check-change';
import { swapCashModule } from './modules/swap-cash';

export const MODULES: TrainingModule[] = [welcome, signIn, cart, findItems, payCard, payCash, splitPay, giftSell, giftPay, savedCarts, receipts, customer, discounts, priceAdjust, refund, bundlesDeals, scanning, inventory, stockLookupModule, ordersModule, drawerDayModule, checkChangeModule, swapCashModule];
export const getModule = (id: string): TrainingModule | undefined => MODULES.find(m => m.id === id);
