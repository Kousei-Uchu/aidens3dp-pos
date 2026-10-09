// Feature switches. Flip a flag and rebuild the app to turn the feature back on.
/** Apple Wallet passes for gift cards ("Add gift card to Apple Wallet" after a sale). Off = the app never offers them.
 *  Cashier (staff) passes are separate and always on. Re-enabling also needs GIFT_CARD_PASSES = "on" on the pass-server (see pass-server/README.md). */
export const GIFT_CARD_PASSES = false;
